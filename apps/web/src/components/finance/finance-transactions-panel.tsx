"use client";

import { Loader2, Plus, Receipt } from "lucide-react";
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

export function FinanceTransactionsPanel({ canWrite }: { canWrite: boolean }) {
  const { formatMoney } = useVenueSettings();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("1");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      setRows(await fetchTransactions(60));
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : "Could not load transactions.");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(() => load({ silent: true }), [], {
    intervalMs: 20_000,
    refreshOnSections: ["finance", "shop_orders"],
  });

  async function onQuickSale(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    const unitPrice = parseFloat(amount);
    const quantity = parseInt(qty, 10);
    if (!name.trim() || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Enter a name and valid amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTransaction({
        kind: "SALE",
        method: "CASH",
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
      publishLiveEvent({ section: "finance" });
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record sale.");
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
          onSubmit={(e) => void onQuickSale(e)}
          className="rounded-xl border border-white/10 bg-zinc-900/50 p-4"
        >
          <p className="text-sm font-medium text-white">Quick counter sale</p>
          <p className="mt-1 text-xs text-zinc-500">
            Record a walk-up sale without building a full menu order.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="block text-xs text-zinc-500 sm:col-span-2">
              Item / label
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                placeholder="Drinks bundle, merch…"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Amount
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
              Qty
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Plus size={14} />
            Record sale
          </button>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="flex items-center gap-2 border-b border-white/5 bg-zinc-900/60 px-4 py-2.5">
          <Receipt size={16} className="text-zinc-400" />
          <span className="text-xs font-medium text-zinc-300">
            Recent transactions
          </span>
          <span className="ml-auto text-[10px] text-zinc-600">
            Auto-refreshes every 20s
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            No transactions yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {rows.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {t.lines.map((l) => l.name).join(", ") || "Sale"}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {new Date(t.createdAt).toLocaleString()} · {t.method} ·{" "}
                    {t.kind}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-semibold tabular-nums",
                    t.kind === "REFUND" ? "text-rose-300" : "text-emerald-300",
                  )}
                >
                  {t.kind === "REFUND" ? "−" : ""}
                  {formatMoney(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
