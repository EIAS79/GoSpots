"use client";

import { Loader2, MailWarning, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { translate } from "@/lib/i18n";
import {
  fetchSystemMailOutboxDead,
  mailOutboxErrorMessage,
  retrySystemMailOutboxDead,
  type MailOutboxDeadLetterRow,
  type MailOutboxStatusCounts,
} from "@/lib/mail-outbox-client";
import { usePublicPrefs } from "@/lib/public-prefs-context";

const EMPTY_COUNTS: MailOutboxStatusCounts = {
  PENDING: 0,
  SENT: 0,
  FAILED: 0,
  DEAD: 0,
  SKIPPED: 0,
};

/** Platform admin: null-shopId (password reset, etc.) dead letters. */
export function SystemMailOutboxPanel() {
  const { locale } = usePublicPrefs();
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const [counts, setCounts] = useState<MailOutboxStatusCounts>(EMPTY_COUNTS);
  const [items, setItems] = useState<MailOutboxDeadLetterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [includeFailed, setIncludeFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchSystemMailOutboxDead({
          includeFailed,
          take: 50,
        });
        setCounts(data.counts);
        setItems(data.items);
        setTotal(data.total);
      } catch (err) {
        setError(
          mailOutboxErrorMessage(err) || t("mailSystemOutbox.loadFailed"),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [includeFailed, locale],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function onRetry(row: MailOutboxDeadLetterRow) {
    if (row.status !== "DEAD" || retryingId) return;
    setRetryingId(row.id);
    setError(null);
    setNote(null);
    try {
      await retrySystemMailOutboxDead(row.id);
      setNote(t("mailSystemOutbox.retrySuccess"));
      await load({ silent: true });
    } catch (err) {
      setError(
        mailOutboxErrorMessage(err) || t("mailSystemOutbox.retryFailed"),
      );
    } finally {
      setRetryingId(null);
    }
  }

  const countChips: { key: keyof MailOutboxStatusCounts; labelKey: string }[] =
    [
      { key: "DEAD", labelKey: "mailSystemOutbox.countDead" },
      { key: "FAILED", labelKey: "mailSystemOutbox.countFailed" },
      { key: "PENDING", labelKey: "mailSystemOutbox.countPending" },
      { key: "SENT", labelKey: "mailSystemOutbox.countSent" },
      { key: "SKIPPED", labelKey: "mailSystemOutbox.countSkipped" },
    ];

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-amber-300">
            <MailWarning size={18} />
            <h2 className="font-semibold text-white">
              {t("mailSystemOutbox.title")}
            </h2>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            {t("mailSystemOutbox.hint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={includeFailed}
              onChange={(e) => setIncludeFailed(e.target.checked)}
              className="rounded border-white/20 bg-zinc-950"
            />
            {t("mailSystemOutbox.includeFailed")}
          </label>
          <button
            type="button"
            disabled={loading || refreshing || retryingId != null}
            onClick={() => void load({ silent: true })}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
          >
            {refreshing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {t("mailSystemOutbox.refresh")}
          </button>
        </div>
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

      {!loading ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {countChips.map(({ key, labelKey }) => (
            <span
              key={key}
              className={`rounded-lg border px-2.5 py-1 text-xs tabular-nums ${
                key === "DEAD" && counts.DEAD > 0
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                  : "border-white/10 bg-zinc-950 text-zinc-400"
              }`}
            >
              {t(labelKey, { n: counts[key] })}
            </span>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" />
          {t("mailSystemOutbox.loading")}
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-sm text-zinc-500">
          {t("mailSystemOutbox.empty")}
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-zinc-500">
            {t("mailSystemOutbox.listTotal", { total })}
          </p>
          <ul className="divide-y divide-white/5">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        row.status === "DEAD"
                          ? "border-amber-400/40 text-amber-200"
                          : row.status === "FAILED"
                            ? "border-rose-400/30 text-rose-200"
                            : "border-white/15 text-zinc-400"
                      }`}
                    >
                      {row.status}
                    </span>
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {row.subject?.trim() || t("mailSystemOutbox.noSubject")}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {row.to?.trim() || t("mailSystemOutbox.noRecipient")}
                    {" · "}
                    {t("mailSystemOutbox.attempts", { n: row.attempts })}
                    {" · "}
                    {t("mailSystemOutbox.updated", {
                      when: formatDate(row.updatedAt, locale),
                    })}
                  </p>
                  {row.lastError ? (
                    <p className="mt-1 line-clamp-2 text-xs text-rose-300/90">
                      {row.lastError}
                    </p>
                  ) : null}
                </div>
                {row.status === "DEAD" ? (
                  <button
                    type="button"
                    disabled={retryingId != null}
                    onClick={() => void onRetry(row)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {retryingId === row.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RotateCcw size={14} />
                    )}
                    {t("mailSystemOutbox.retry")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
