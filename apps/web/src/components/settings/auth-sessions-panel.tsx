"use client";

import { KeyRound, Loader2, MonitorSmartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  authSessionsErrorMessage,
  fetchAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
  summarizeUserAgent,
  type AuthSessionRow,
} from "@/lib/auth-sessions-client";
import { formatDate } from "@/lib/format";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

type ConfirmKind =
  | { type: "one"; session: AuthSessionRow }
  | { type: "others" }
  | null;

export function AuthSessionsPanel() {
  const vs = useVenueSettingsOptional();
  const t = vs?.t ?? ((key: string) => key);
  const locale = vs?.locale ?? "en";

  const [sessions, setSessions] = useState<AuthSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAuthSessions();
      setSessions(data.sessions);
    } catch (err) {
      setError(
        authSessionsErrorMessage(err) || t("settings.sessionsLoadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onConfirm() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (confirm.type === "one") {
        setRevokingId(confirm.session.id);
        await revokeAuthSession(confirm.session.id);
        setSessions((prev) => prev.filter((s) => s.id !== confirm.session.id));
        setNote(t("settings.sessionRevoked"));
      } else {
        const { revokedCount } = await revokeOtherAuthSessions();
        setNote(
          t("settings.sessionsRevokedOthers", { count: revokedCount }),
        );
        await load();
      }
      setConfirm(null);
    } catch (err) {
      setError(authSessionsErrorMessage(err) || t("common.error"));
    } finally {
      setBusy(false);
      setRevokingId(null);
    }
  }

  const othersCount = Math.max(0, sessions.length - 1);

  return (
    <>
      <section className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sky-300">
              <KeyRound size={18} />
              <h2 className="font-semibold text-white">
                {t("settings.sessions")}
              </h2>
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              {t("settings.sessionsHint")}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || loading || othersCount < 1}
            onClick={() => setConfirm({ type: "others" })}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
          >
            {t("settings.revokeOthers")}
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
        {note ? (
          <p className="mb-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
            {note}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" />
            {t("settings.sessionsLoading")}
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500">
            {t("settings.sessionsEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 rounded-lg border border-white/10 bg-zinc-950 p-2 text-zinc-400">
                    <MonitorSmartphone size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {summarizeUserAgent(session.userAgent)}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {t("settings.sessionStarted", {
                        when: formatDate(session.createdAt, locale),
                      })}
                      {" · "}
                      {t("settings.sessionExpires", {
                        when: formatDate(session.expiresAt, locale),
                      })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm({ type: "one", session })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
                >
                  {revokingId === session.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {t("settings.revokeSession")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirm != null}
        title={
          confirm?.type === "others"
            ? t("settings.revokeOthersTitle")
            : t("settings.revokeSessionTitle")
        }
        description={
          confirm?.type === "others"
            ? t("settings.revokeOthersDesc")
            : t("settings.revokeSessionDesc")
        }
        confirmLabel={
          confirm?.type === "others"
            ? t("settings.revokeOthers")
            : t("settings.revokeSession")
        }
        cancelLabel={t("common.cancel")}
        variant="danger"
        busy={busy}
        onConfirm={() => void onConfirm()}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
      />
    </>
  );
}
