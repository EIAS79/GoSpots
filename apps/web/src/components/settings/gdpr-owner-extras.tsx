"use client";

import { Eraser, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { logout } from "@/lib/auth-client";
import {
  closeGuestDsar,
  eraseAccount,
  eraseGuestByEmail,
  gdprEraseErrorMessage,
  listGuestDsar,
  type GuestDsarItem,
} from "@/lib/gdpr-client";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Owner-only GDPR extras: erase-by-email, DSAR inbox, account wipe.
 * Mounted under Shop settings → Privacy & data (after single-entity erase).
 */
export function GdprOwnerExtras({
  t,
  erasePassword,
  onNeedPassword,
}: {
  t: Translate;
  erasePassword: string;
  onNeedPassword: () => void;
}) {
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);

  const [dsarItems, setDsarItems] = useState<GuestDsarItem[]>([]);
  const [dsarLoading, setDsarLoading] = useState(true);
  const [dsarError, setDsarError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const [accountPassword, setAccountPassword] = useState("");
  const [accountPhrase, setAccountPhrase] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountConfirmOpen, setAccountConfirmOpen] = useState(false);

  const loadDsar = useCallback(async () => {
    setDsarLoading(true);
    setDsarError(null);
    try {
      const res = await listGuestDsar();
      setDsarItems(res.items);
    } catch (err) {
      setDsarError(
        err instanceof Error ? err.message : t("settings.dsarEmpty"),
      );
    } finally {
      setDsarLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadDsar();
  }, [loadDsar]);

  function onRequestEmailErase() {
    if (!email.trim()) {
      setEmailError(t("settings.eraseNeedEmail"));
      setEmailNote(null);
      return;
    }
    if (!erasePassword) {
      onNeedPassword();
      setEmailError(t("settings.eraseNeedPassword"));
      return;
    }
    setEmailError(null);
    setEmailConfirmOpen(true);
  }

  async function onConfirmEmailErase() {
    if (!erasePassword || !email.trim()) {
      setEmailConfirmOpen(false);
      return;
    }
    setEmailBusy(true);
    setEmailError(null);
    setEmailNote(null);
    try {
      await eraseGuestByEmail({
        guestEmail: email.trim(),
        password: erasePassword,
      });
      setEmailNote(t("settings.eraseByEmailSuccess"));
      setEmail("");
      setEmailConfirmOpen(false);
    } catch (err) {
      setEmailError(gdprEraseErrorMessage(err) || t("settings.eraseFailed"));
      setEmailConfirmOpen(false);
    } finally {
      setEmailBusy(false);
    }
  }

  async function onCloseDsar(id: string) {
    if (!erasePassword) {
      onNeedPassword();
      setDsarError(t("settings.dsarCloseNeedPassword"));
      return;
    }
    setClosingId(id);
    setDsarError(null);
    try {
      await closeGuestDsar({ id, password: erasePassword });
      await loadDsar();
    } catch (err) {
      setDsarError(
        err instanceof Error ? err.message : t("settings.eraseFailed"),
      );
    } finally {
      setClosingId(null);
    }
  }

  function onRequestAccountErase() {
    setAccountError(null);
    if (!accountPassword) {
      setAccountError(t("settings.eraseNeedPassword"));
      return;
    }
    if (accountPhrase !== "DELETE MY ACCOUNT") {
      setAccountError(t("settings.eraseAccountPhrase"));
      return;
    }
    setAccountConfirmOpen(true);
  }

  async function onConfirmAccountErase() {
    setAccountBusy(true);
    setAccountError(null);
    try {
      await eraseAccount({
        password: accountPassword,
        confirmPhrase: accountPhrase,
      });
      try {
        await logout();
      } catch {
        /* session may already be revoked */
      }
      window.location.href = "/login";
    } catch (err) {
      setAccountError(
        err instanceof Error
          ? err.message
          : t("settings.eraseAccountFailed"),
      );
      setAccountConfirmOpen(false);
    } finally {
      setAccountBusy(false);
    }
  }

  const openDsar = dsarItems.filter((d) => d.status !== "CLOSED");

  return (
    <>
      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="mb-2 flex items-center gap-2 text-rose-200/90">
          <Eraser size={16} />
          <h3 className="text-sm font-semibold text-zinc-100">
            {t("settings.eraseByEmail")}
          </h3>
        </div>
        <p className="mb-4 text-sm text-zinc-500">{t("settings.eraseByEmailHint")}</p>
        {emailError ? (
          <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {emailError}
          </p>
        ) : null}
        {emailNote ? (
          <p className="mb-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
            {emailNote}
          </p>
        ) : null}
        <form
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            onRequestEmailErase();
          }}
        >
          <label className="block min-w-[14rem] flex-[2] text-xs text-zinc-500">
            {t("settings.eraseByEmail")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("settings.eraseByEmailPlaceholder")}
              disabled={emailBusy}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
          </label>
          <button
            type="submit"
            disabled={emailBusy}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
          >
            {emailBusy ? <Loader2 size={16} className="animate-spin" /> : <Eraser size={16} />}
            {t("settings.eraseConfirm")}
          </button>
        </form>
        <p className="mt-2 text-[11px] text-zinc-600">
          {t("settings.erasePassword")} — {t("settings.eraseNeedPassword")}
        </p>
      </div>

      <div className="mt-6 border-t border-white/10 pt-5">
        <h3 className="text-sm font-semibold text-zinc-100">
          {t("settings.dsarInbox")}
        </h3>
        <p className="mb-3 mt-1 text-sm text-zinc-500">
          {t("settings.dsarInboxHint")}
        </p>
        {dsarError ? (
          <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {dsarError}
          </p>
        ) : null}
        {dsarLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-5 animate-spin text-zinc-500" />
          </div>
        ) : openDsar.length === 0 ? (
          <p className="text-sm text-zinc-600">{t("settings.dsarEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {openDsar.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-200">
                      {item.type} · {item.guestEmail}
                    </p>
                    {item.guestName ? (
                      <p className="text-xs text-zinc-500">{item.guestName}</p>
                    ) : null}
                    {item.message ? (
                      <p className="mt-1 text-xs text-zinc-400">{item.message}</p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-zinc-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={closingId === item.id}
                    onClick={() => void onCloseDsar(item.id)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/20 disabled:opacity-50"
                  >
                    {closingId === item.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      t("settings.dsarClose")
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 border-t border-rose-500/20 pt-5">
        <div className="mb-2 flex items-center gap-2 text-rose-300">
          <Trash2 size={16} />
          <h3 className="text-sm font-semibold text-zinc-100">
            {t("settings.eraseAccount")}
          </h3>
        </div>
        <p className="mb-4 text-sm text-zinc-500">{t("settings.eraseAccountHint")}</p>
        {accountError ? (
          <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {accountError}
          </p>
        ) : null}
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onRequestAccountErase();
          }}
        >
          <label className="block text-xs text-zinc-500">
            {t("settings.erasePassword")}
            <input
              type="password"
              value={accountPassword}
              onChange={(e) => setAccountPassword(e.target.value)}
              disabled={accountBusy}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            {t("settings.eraseAccountPhrase")}
            <input
              type="text"
              value={accountPhrase}
              onChange={(e) => setAccountPhrase(e.target.value)}
              disabled={accountBusy}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
            />
          </label>
          <button
            type="submit"
            disabled={accountBusy}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-rose-500/40 bg-rose-600/20 px-4 py-2 text-sm text-rose-100 hover:bg-rose-600/30 disabled:opacity-50"
          >
            {accountBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
            {t("settings.eraseAccountConfirm")}
          </button>
        </form>
      </div>

      <ConfirmDialog
        open={emailConfirmOpen}
        title={t("settings.eraseConfirmTitle")}
        description={t("settings.eraseByEmailHint")}
        confirmLabel={t("settings.eraseConfirm")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        busy={emailBusy}
        onConfirm={() => void onConfirmEmailErase()}
        onCancel={() => !emailBusy && setEmailConfirmOpen(false)}
      />

      <ConfirmDialog
        open={accountConfirmOpen}
        title={t("settings.eraseAccountConfirmTitle")}
        description={t("settings.eraseAccountConfirmDesc")}
        confirmLabel={t("settings.eraseAccountConfirm")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        busy={accountBusy}
        onConfirm={() => void onConfirmAccountErase()}
        onCancel={() => !accountBusy && setAccountConfirmOpen(false)}
      />
    </>
  );
}
