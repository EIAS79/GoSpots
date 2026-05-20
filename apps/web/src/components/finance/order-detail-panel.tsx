"use client";

import {
  CheckCircle2,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { MenuItemPicker } from "@/components/finance/menu-item-picker";
import { OrderStatusBadge } from "@/components/finance/order-status-badge";
import type { FullMenu } from "@/lib/menu-client";
import type { ShopOrder, ShopOrderLine } from "@/lib/finance-client";
import { orderLinesSubtotal } from "@/lib/finance-client";
import {
  getOrderDisplayLabel,
  getOrderShortRef,
  orderHasStaffLabel,
} from "@/lib/order-display-label";

function OrderLineRow({
  line,
  canEdit,
  formatMoney,
  onQtyBlur,
  onPriceBlur,
  onCancelLine,
  onRemoveLine,
  onRestoreLine,
}: {
  line: ShopOrderLine;
  canEdit: boolean;
  formatMoney: (n: number) => string;
  onQtyBlur: (q: number) => void;
  onPriceBlur: (p: number) => void;
  onCancelLine: () => void;
  onRemoveLine: () => void;
  onRestoreLine: () => void;
}) {
  const active = line.lineStatus === "ACTIVE";
  const lineTotal = active ? line.quantity * line.unitPrice : 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-zinc-950/60 p-3",
        !active && "opacity-55",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-zinc-100">
          {line.name}
        </p>
        <p className="shrink-0 text-sm font-semibold text-emerald-300">
          {formatMoney(lineTotal)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {canEdit && active ? (
          <>
            <label className="flex items-center gap-1">
              Qty
              <input
                type="number"
                min={1}
                defaultValue={line.quantity}
                key={`q-${line.id}-${line.quantity}`}
                onBlur={(e) => {
                  const q = parseInt(e.target.value, 10);
                  if (q && q !== line.quantity) onQtyBlur(q);
                }}
                className="w-12 rounded-md border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-white"
              />
            </label>
            <label className="flex items-center gap-1">
              Each
              <input
                type="number"
                min={0}
                step="0.01"
                defaultValue={line.unitPrice}
                key={`p-${line.id}-${line.unitPrice}`}
                onBlur={(e) => {
                  const p = parseFloat(e.target.value);
                  if (!Number.isNaN(p) && p !== line.unitPrice) onPriceBlur(p);
                }}
                className="w-16 rounded-md border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-white"
              />
            </label>
          </>
        ) : (
          <span>
            {line.quantity} × {formatMoney(line.unitPrice)}
          </span>
        )}
        {!active ? (
          <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
            Canceled
          </span>
        ) : null}
      </div>
      {canEdit ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {active ? (
            <>
              <button
                type="button"
                onClick={onCancelLine}
                className="text-[11px] text-amber-400 hover:text-amber-200"
              >
                Cancel line
              </button>
              <button
                type="button"
                onClick={onRemoveLine}
                className="text-[11px] text-zinc-500 hover:text-rose-300"
              >
                Remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onRestoreLine}
              className="text-[11px] text-emerald-400"
            >
              Restore
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function OrderDetailPanel({
  selected,
  tab,
  canWrite,
  busy,
  menu,
  labelDraft,
  setLabelDraft,
  noteDraft,
  setNoteDraft,
  payDraft,
  setPayDraft,
  guestDraft,
  setGuestDraft,
  tableReservedDraft,
  setTableReservedDraft,
  reservationFeeDraft,
  setReservationFeeDraft,
  formatMoney,
  canHandToCustomer,
  metaAutosave = "idle",
  onDeleteOrder,
  onCancelOrder,
  onHandOff,
  onBackToPreparing,
  onAddLine,
  onLineQty,
  onLinePrice,
  onCancelLine,
  onRemoveLine,
  onRestoreLine,
}: {
  selected: ShopOrder;
  tab: string;
  canWrite: boolean;
  busy: boolean;
  menu: FullMenu | null;
  labelDraft: string;
  setLabelDraft: (v: string) => void;
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  payDraft: string;
  setPayDraft: (v: string) => void;
  guestDraft: string;
  setGuestDraft: (v: string) => void;
  tableReservedDraft: boolean;
  setTableReservedDraft: (v: boolean) => void;
  reservationFeeDraft: string;
  setReservationFeeDraft: (v: string) => void;
  formatMoney: (n: number) => string;
  canHandToCustomer: boolean;
  metaAutosave?: "idle" | "pending" | "saving" | "saved";
  onDeleteOrder: () => void;
  onCancelOrder: () => void;
  onHandOff: () => void;
  onBackToPreparing: () => void;
  onAddLine: (itemId: string, qty: number) => void;
  onLineQty: (lineId: string, q: number) => void;
  onLinePrice: (lineId: string, p: number) => void;
  onCancelLine: (lineId: string) => void;
  onRemoveLine: (lineId: string) => void;
  onRestoreLine: (lineId: string) => void;
}) {
  const readOnly =
    tab === "ARCHIVED" ||
    Boolean(selected.archivedAt) ||
    selected.status === "CANCELED";
  const canEditLines =
    canWrite && !selected.archivedAt && selected.status !== "CANCELED";
  const menuSubtotal = orderLinesSubtotal(selected);
  const reservationCharge =
    selected.tableReserved && selected.reservationFee != null
      ? selected.reservationFee
      : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/10 bg-zinc-950/40 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-white">
                {getOrderDisplayLabel(selected)}
              </h2>
              <OrderStatusBadge status={selected.status} />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {selected.guestCount} guest{selected.guestCount === 1 ? "" : "s"} ·{" "}
              {selected.paymentMethod}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-emerald-300">
              {formatMoney(selected.total)}
            </p>
            {(menuSubtotal > 0 || reservationCharge > 0) && (
              <p className="mt-1 text-[10px] text-zinc-500">
                Menu {formatMoney(menuSubtotal)}
                {selected.tableReserved ? (
                  <>
                    {" "}
                    · Reservation{" "}
                    {reservationCharge > 0
                      ? formatMoney(reservationCharge)
                      : "free"}
                  </>
                ) : null}
              </p>
            )}
            {canWrite && !selected.archivedAt ? (
              <button
                type="button"
                disabled={busy}
                onClick={onDeleteOrder}
                className="mt-1 inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"
              >
                <Trash2 size={12} />
                Delete permanently
              </button>
            ) : null}
          </div>
        </div>

        {selected.status === "PENDING" && canWrite ? (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90 ring-1 ring-amber-500/20">
            Add items below, then mark{" "}
            <strong>Handed to customer</strong> only after they receive the order.
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {readOnly && !canEditLines ? (
          <p className="mb-4 rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
            {tab === "ARCHIVED" || selected.archivedAt
              ? "Archived — view only. Unarchive from the grid to edit."
              : "Canceled — read-only."}
          </p>
        ) : null}

        {!readOnly && canWrite ? (
          <section className="mb-5 rounded-xl border border-white/10 bg-zinc-900/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Ticket details
              </p>
              {metaAutosave === "pending" ? (
                <span className="text-[10px] text-zinc-500">Will save…</span>
              ) : metaAutosave === "saving" ? (
                <span className="text-[10px] text-amber-300/90">Saving…</span>
              ) : metaAutosave === "saved" ? (
                <span className="text-[10px] text-emerald-400">Saved</span>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-zinc-500">
                Table / guest name
                <input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  disabled={metaAutosave === "saving"}
                  placeholder="e.g. Table 5, Ahmed"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white placeholder:text-zinc-600"
                />
              </label>
              <label className="text-xs text-zinc-500">
                Guests
                <input
                  type="number"
                  min={1}
                  value={guestDraft}
                  onChange={(e) => setGuestDraft(e.target.value)}
                  disabled={metaAutosave === "saving"}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-zinc-500">
                Payment
                <select
                  value={payDraft}
                  onChange={(e) => setPayDraft(e.target.value)}
                  disabled={metaAutosave === "saving"}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white"
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="ONLINE">Online</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </div>
            <label className="mt-2 block text-xs text-zinc-500">
              Note
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                disabled={metaAutosave === "saving"}
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white"
              />
            </label>

            <div className="mt-3 rounded-lg border border-violet-400/15 bg-violet-500/[0.06] p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={tableReservedDraft}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setTableReservedDraft(on);
                    if (!on) setReservationFeeDraft("");
                  }}
                  disabled={metaAutosave === "saving"}
                  className="mt-0.5 size-4 rounded border-white/20"
                />
                <span>
                  <span className="text-sm font-medium text-zinc-200">
                    Table was reserved
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    Optional — leave the fee empty if the reservation was free.
                  </span>
                </span>
              </label>
              {tableReservedDraft ? (
                <label className="mt-3 block text-xs text-zinc-500">
                  Reservation fee (optional)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={reservationFeeDraft}
                    onChange={(e) => setReservationFeeDraft(e.target.value)}
                    disabled={metaAutosave === "saving"}
                    placeholder="0 = free reservation"
                    className="mt-1 w-full max-w-[10rem] rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </label>
              ) : null}
            </div>
          </section>
        ) : null}

        {!readOnly && !canWrite && selected.tableReserved ? (
          <p className="mb-4 rounded-lg border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-200/90">
            Table reserved
            {selected.reservationFee != null && selected.reservationFee > 0
              ? ` · ${formatMoney(selected.reservationFee)}`
              : " · no reservation charge"}
          </p>
        ) : null}

        <section className="mb-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Line items ({selected.lines.length})
          </p>
          {selected.lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/15 py-6 text-center text-xs text-zinc-500">
              No items yet — add from the menu below.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {selected.lines.map((line) => (
                <OrderLineRow
                  key={line.id}
                  line={line}
                  canEdit={canEditLines}
                  formatMoney={formatMoney}
                  onQtyBlur={(q) => onLineQty(line.id, q)}
                  onPriceBlur={(p) => onLinePrice(line.id, p)}
                  onCancelLine={() => onCancelLine(line.id)}
                  onRemoveLine={() => onRemoveLine(line.id)}
                  onRestoreLine={() => onRestoreLine(line.id)}
                />
              ))}
            </div>
          )}
        </section>

        {canWrite && selected.status === "PENDING" ? (
          <section className="rounded-xl border border-dashed border-emerald-500/25 bg-emerald-500/5 p-3">
            <p className="mb-2 text-xs font-medium text-emerald-200/90">
              Add from menu
            </p>
            <MenuItemPicker
              menu={menu}
              formatMoney={formatMoney}
              disabled={busy}
              onPick={onAddLine}
            />
          </section>
        ) : null}
      </div>

      {canWrite && !selected.archivedAt && selected.status !== "CANCELED" ? (
        <footer className="shrink-0 flex flex-wrap gap-2 border-t border-white/10 bg-zinc-950/50 p-4">
          {selected.status === "PENDING" ? (
            <button
              type="button"
              disabled={busy || !canHandToCustomer}
              onClick={onHandOff}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              <CheckCircle2 size={18} />
              Handed to customer
            </button>
          ) : null}
          {selected.status === "COMPLETED" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onBackToPreparing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5"
            >
              <RotateCcw size={16} />
              Back to preparing
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onCancelOrder}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 px-4 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10"
          >
            <XCircle size={16} />
            Cancel order
          </button>
        </footer>
      ) : null}
    </div>
  );
}
