"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createLoss,
  deleteLoss,
  fetchLosses,
  type ShopLoss,
} from "@/lib/finance-client";
import { publishLiveEvent } from "@/lib/live-events";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueSettings } from "@/lib/venue-settings-context";

export function LossesPanel({ canWrite }: { canWrite: boolean }) {
  const { formatMoney, t } = useVenueSettings();
  const [losses, setLosses] = useState<ShopLoss[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      setError(null);
      try {
        setLosses(await fetchLosses());
        return true;
      } catch (e) {
        if (!opts?.silent) {
          setError(
            e instanceof Error ? e.message : t("finance.lossLoadFailed"),
          );
        }
        return false;
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(() => load({ silent: true }), [], {
    intervalMs: 20_000,
    refreshOnSections: ["finance"],
  });

  return (
    <div className="space-y-6">
      {canWrite ? (
        <form
          className="grid gap-3 rounded-xl border border-white/10 bg-zinc-900/40 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const amt = parseFloat(amount);
            if (!amt || !reason.trim()) return;
            setSaving(true);
            void createLoss({
              amount: amt,
              reason: reason.trim(),
              category: category.trim() || undefined,
            })
              .then(() => {
                setAmount("");
                setReason("");
                setCategory("");
                publishLiveEvent({ section: "finance" });
                return load({ silent: true });
              })
              .catch((err) =>
                setError(
                  err instanceof Error
                    ? err.message
                    : t("finance.lossSaveFailed"),
                ),
              )
              .finally(() => setSaving(false));
          }}
        >
          <label className="block text-xs text-zinc-500">
            {t("finance.lossAmount")}
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            {t("finance.lossCategory")}
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("finance.lossCategoryPlaceholder")}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-500 sm:col-span-2">
            {t("finance.lossReason")}
            <input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600/80 px-4 py-2 text-sm text-white sm:col-span-2 sm:justify-self-start"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t("finance.lossRecord")}
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-zinc-500" />
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
          {losses.length === 0 ? (
            <li className="p-8 text-center text-sm text-zinc-500">
              {t("finance.lossEmpty")}
            </li>
          ) : (
            losses.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-rose-200">
                    {formatMoney(l.amount)}
                  </p>
                  <p className="text-sm text-zinc-300">{l.reason}</p>
                  <p className="text-xs text-zinc-500">
                    {l.category ? `${l.category} · ` : ""}
                    {new Date(l.occurredAt).toLocaleString()}
                  </p>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(t("finance.lossDeleteConfirm"))) return;
                      void deleteLoss(l.id).then(() => {
                        publishLiveEvent({ section: "finance" });
                        return load({ silent: true });
                      });
                    }}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
