"use client";

import { Loader2, Printer, Receipt, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  InvoiceDocument,
  type InvoiceDocumentData,
  type InvoiceLineItem,
} from "@/components/finance/invoice-document";
import { cn } from "@/lib/cn";
import {
  fetchShopOrders,
  fetchTransactions,
  orderLinesSubtotal,
  type ShopOrder,
  type Transaction,
} from "@/lib/finance-client";
import { fetchPlayBilling, type PlayBillingItem } from "@/lib/play-billing-client";
import { useVenueSettings } from "@/lib/venue-settings-context";
import { venueMarketingName } from "@/lib/venue-display";

type SourceKind = "order" | "sale" | "play";

type SelectableRow = {
  key: string;
  kind: SourceKind;
  label: string;
  detail: string;
  amount: number;
  paymentMethod?: string | null;
  customerName?: string | null;
  lines: InvoiceLineItem[];
  createdAt: string;
};

function startOfDayIso(dateStr: string) {
  return `${dateStr}T00:00:00.000`;
}

function endOfDayIso(dateStr: string) {
  return `${dateStr}T23:59:59.999`;
}

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function invoiceNumberFor(dateStr: string) {
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  return `INV-${dateStr.replace(/-/g, "")}-${stamp}`;
}

function sameDay(iso: string, day: string) {
  return iso.slice(0, 10) === day;
}

export function InvoicesPanel() {
  const { shop, formatMoney } = useVenueSettings();
  const [day, setDay] = useState(todayInputValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [sales, setSales] = useState<Transaction[]>([]);
  const [play, setPlay] = useState<PlayBillingItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<InvoiceDocumentData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderRows, txRows, billing] = await Promise.all([
        fetchShopOrders({
          status: "COMPLETED",
          archived: "all",
          from: startOfDayIso(day),
          to: endOfDayIso(day),
          take: 120,
        }),
        fetchTransactions(120),
        fetchPlayBilling({
          tab: "paid",
          from: day,
          to: day,
          pageSize: 100,
        }),
      ]);
      setOrders(orderRows);
      setSales(
        txRows.filter(
          (t) => t.kind === "SALE" && sameDay(t.createdAt, day),
        ),
      );
      setPlay(
        billing.items.filter(
          (i) => i.isPaid && sameDay(i.startsAt, day),
        ),
      );
      setSelected(new Set());
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load day’s sales.");
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const list: SelectableRow[] = [];

    for (const order of orders) {
      const activeLines = order.lines.filter((l) => l.lineStatus === "ACTIVE");
      const lines: InvoiceLineItem[] = activeLines.map((l) => ({
        id: l.id,
        description: l.name,
        detail: order.label ? `Order · ${order.label}` : "Menu order",
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        total: l.quantity * l.unitPrice,
      }));
      if (order.reservationFee && order.reservationFee > 0) {
        lines.push({
          id: `${order.id}-fee`,
          description: "Table reservation fee",
          quantity: 1,
          unitPrice: order.reservationFee,
          total: order.reservationFee,
        });
      }
      const amount =
        order.total > 0 ? order.total : orderLinesSubtotal(order) + (order.reservationFee ?? 0);
      list.push({
        key: `order:${order.id}`,
        kind: "order",
        label: order.label?.trim() || "Menu order",
        detail: `${activeLines.length} item${activeLines.length === 1 ? "" : "s"}`,
        amount,
        paymentMethod: order.paymentMethod,
        lines,
        createdAt: order.completedAt ?? order.createdAt,
      });
    }

    for (const tx of sales) {
      list.push({
        key: `sale:${tx.id}`,
        kind: "sale",
        label: tx.note?.trim() || "Quick sale",
        detail: `${tx.lines.length} line${tx.lines.length === 1 ? "" : "s"}`,
        amount: tx.amount,
        paymentMethod: tx.method,
        lines: tx.lines.map((l) => ({
          id: l.id,
          description: l.name,
          detail: "Quick sale",
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          total: l.total,
        })),
        createdAt: tx.createdAt,
      });
    }

    for (const item of play) {
      const amount = item.billedAmount ?? item.amountDue;
      list.push({
        key: `play:${item.id}`,
        kind: "play",
        label: item.guestName || "Play session",
        detail: [
          item.resource?.name,
          item.resource?.categoryName,
          `${item.durationMinutes} min`,
        ]
          .filter(Boolean)
          .join(" · "),
        amount,
        customerName: item.guestName,
        lines: [
          {
            id: item.id,
            description: item.resource?.name
              ? `${item.resource.name} session`
              : "Play session",
            detail: item.breakdown || undefined,
            quantity: 1,
            unitPrice: amount,
            total: amount,
          },
        ],
        createdAt: item.startsAt,
      });
    }

    return list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [orders, sales, play]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDraft(null);
  }

  function selectAll() {
    setSelected(new Set(rows.map((r) => r.key)));
    setDraft(null);
  }

  function clearSelection() {
    setSelected(new Set());
    setDraft(null);
  }

  function buildInvoice() {
    const picked = rows.filter((r) => selected.has(r.key));
    if (picked.length === 0) {
      setError("Select at least one order, sale, or session.");
      return;
    }
    setError(null);
    const lines = picked.flatMap((r) => r.lines);
    const methods = [
      ...new Set(
        picked.map((r) => r.paymentMethod).filter(Boolean) as string[],
      ),
    ];
    const customers = [
      ...new Set(
        picked.map((r) => r.customerName).filter(Boolean) as string[],
      ),
    ];
    const venueName = shop
      ? venueMarketingName(shop)
      : "Venue";

    setDraft({
      invoiceNumber: invoiceNumberFor(day),
      issuedAt: new Date(),
      title: picked.length === 1 ? "Receipt" : "Invoice",
      venue: {
        name: venueName,
        address: shop?.address,
        city: shop?.city,
        country: shop?.country,
        phone: shop?.phone,
        email: shop?.email,
      },
      customerName: customers.length === 1 ? customers[0] : null,
      paymentMethod: methods.length === 1 ? methods[0] : methods.join(" / ") || null,
      note:
        picked.length > 1
          ? `Combined ${picked.length} sales from ${day}`
          : null,
      lines,
      currencyLabel: formatMoney,
    });
  }

  function printInvoice() {
    window.print();
  }

  const selectedTotal = rows
    .filter((r) => selected.has(r.key))
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
        <label className="text-xs text-zinc-500">
          Sales day
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="mt-1 block rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button
            type="button"
            onClick={selectAll}
            disabled={rows.length === 0}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selected.size === 0}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={buildInvoice}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            <Receipt size={13} />
            Build invoice
            {selected.size > 0 ? ` · ${formatMoney(selectedTotal)}` : ""}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-6 py-12 text-center text-sm text-zinc-500">
          No completed orders, sales, or paid play sessions for this day.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/50">
          {rows.map((row) => {
            const on = selected.has(row.key);
            return (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => toggle(row.key)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                    on ? "bg-emerald-500/10" : "hover:bg-white/[0.03]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded border text-[10px]",
                      on
                        ? "border-emerald-400/50 bg-emerald-500 text-zinc-950"
                        : "border-white/20 text-transparent",
                    )}
                  >
                    ✓
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      row.kind === "order"
                        ? "bg-amber-500/15 text-amber-200"
                        : row.kind === "play"
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "bg-sky-500/15 text-sky-200",
                    )}
                  >
                    {row.kind === "order"
                      ? "Order"
                      : row.kind === "play"
                        ? "Play"
                        : "Sale"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">
                      {row.label}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500">
                      {row.detail}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-200">
                    {formatMoney(row.amount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {draft ? (
        <div className="space-y-3 print:space-y-0">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-sm text-zinc-400">
              Preview · {draft.invoiceNumber}
            </p>
            <button
              type="button"
              onClick={printInvoice}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              <Printer size={15} />
              Print / save PDF
            </button>
          </div>
          <div className="invoice-print-root mx-auto max-w-3xl">
            <InvoiceDocument data={draft} />
          </div>
        </div>
      ) : null}

      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .invoice-print-root,
          .invoice-print-root * {
            visibility: visible !important;
          }
          .invoice-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none;
            padding: 0;
            margin: 0;
          }
          .invoice-sheet {
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
