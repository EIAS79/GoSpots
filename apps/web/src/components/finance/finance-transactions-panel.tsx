"use client";

import { Loader2, Plus, Receipt, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  createTransaction,
  fetchTransactions,
  type Transaction,
} from "@/lib/finance-client";
import { publishLiveEvent } from "@/lib/live-events";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueSettings } from "@/lib/venue-settings-context";

type TxMode = "SALE" | "REFUND";

const PAYMENT_METHOD_KEYS = [
  { value: "CASH", labelKey: "finance.txPayCash" },
  { value: "CARD", labelKey: "finance.txPayCard" },
  { value: "ONLINE", labelKey: "finance.txPayOnline" },
  { value: "OTHER", labelKey: "finance.txPayOther" },
] as const;

export function FinanceTransactionsPanel({ canWrite }: { canWrite: boolean }) {
  const { formatMoney, t } = useVenueSettings();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TxMode>("SALE");

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("1");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        setRows(await fetchTransactions(60));
        return true;
      } catch (e) {
        if (!opts?.silent) {
          setError(
            e instanceof Error ? e.message : t("finance.txLoadFailed"),
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
    refreshOnSections: ["finance", "shop_orders"],
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    const unitPrice = parseFloat(amount);
    const quantity = parseInt(qty, 10);
    if (!name.trim() || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setError(t("finance.txEnterValid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTransaction({
        kind: mode,
        method,
        note: note.trim() || undefined,
        lines: [
          {
            name: name.trim(),
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            unitPrice,
          },
        ],
      });
      setName("");
      setAmount("");
      setQty("1");
      setNote("");
      publishLiveEvent({ section: "finance" });
      await load({ silent: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("finance.txRecordFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-7 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {canWrite ? (
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="rounded-xl border border-white/10 bg-zinc-900/50 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("SALE")}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
                mode === "SALE"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10",
              )}
            >
              <Plus size={14} />
              {t("finance.txSale")}
            </button>
            <button
              type="button"
              onClick={() => setMode("REFUND")}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
                mode === "REFUND"
                  ? "bg-rose-500/20 text-rose-200"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10",
              )}
            >
              <RotateCcw size={14} />
              {t("finance.txRefund")}
            </button>
          </div>
          <p className="mt-3 text-sm font-medium text-white">
            {mode === "SALE"
              ? t("finance.txSaleTitle")
              : t("finance.txRefundTitle")}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {mode === "SALE"
              ? t("finance.txSaleHint")
              : t("finance.txRefundHint")}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              {t("finance.txItemLabel")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                placeholder={t("finance.txItemPlaceholder")}
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("finance.txAmount")}
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("finance.txQty")}
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              {t("finance.txPayment")}
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                {PAYMENT_METHOD_KEYS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-xs text-zinc-500">
            {t("finance.txNote")}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              placeholder={t("finance.txNotePlaceholder")}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50",
              mode === "SALE"
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-rose-600 hover:bg-rose-500",
            )}
          >
            {mode === "SALE" ? <Plus size={14} /> : <RotateCcw size={14} />}
            {mode === "SALE"
              ? t("finance.txRecordSale")
              : t("finance.txRecordRefund")}
          </button>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="flex items-center gap-2 border-b border-white/5 bg-zinc-900/60 px-4 py-2.5">
          <Receipt size={16} className="text-zinc-400" />
          <span className="text-xs font-medium text-zinc-300">
            {t("finance.txRecent")}
          </span>
          <span className="ml-auto text-[10px] text-zinc-600">
            {t("finance.txAutoRefresh")}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            {t("finance.txEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {row.lines.map((l) => l.name).join(", ") ||
                      t("finance.txSaleFallback")}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {new Date(row.createdAt).toLocaleString()} · {row.method} ·{" "}
                    {row.kind}
                    {row.note ? ` · ${row.note}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-semibold tabular-nums",
                    row.kind === "REFUND" ? "text-rose-300" : "text-emerald-300",
                  )}
                >
                  {row.kind === "REFUND" ? "−" : ""}
                  {formatMoney(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
