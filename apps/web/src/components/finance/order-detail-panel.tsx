"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { MenuItemPicker } from "@/components/finance/menu-item-picker";
import { OrderStatusBadge } from "@/components/finance/order-status-badge";
import type { FullMenu } from "@/lib/menu-client";
import type { ShopOrder, ShopOrderLine } from "@/lib/finance-client";
import { orderLinesSubtotal } from "@/lib/finance-client";
import { coerceMoney } from "@/lib/money";
import {
  getOrderDisplayLabel,
  getOrderShortRef,
  orderHasStaffLabel,
} from "@/lib/order-display-label";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

type OrdersT = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

function OrderLineRow({
  line,
  canEdit,
  formatMoney,
  t,
  onQtyChange,
  onPriceBlur,
  onRemoveLine,
  onRestoreLine,
}: {
  line: ShopOrderLine;
  canEdit: boolean;
  formatMoney: (n: import("@/lib/money").MoneyWire) => string;
  t: OrdersT;
  onQtyChange: (q: number) => void;
  onPriceBlur: (p: number) => void;
  onRemoveLine: () => void;
  onRestoreLine: () => void;
}) {
  const active = line.lineStatus === "ACTIVE";
  const lineTotal = active ? line.quantity * coerceMoney(line.unitPrice) : 0;

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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {canEdit && active ? (
          <>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-wide text-zinc-500">
                {t("orders.qty")}
              </span>
              <button
                type="button"
                disabled={line.quantity <= 1}
                onClick={() => onQtyChange(line.quantity - 1)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-zinc-900 text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                aria-label={t("orders.decreaseQty")}
              >
                <Minus size={16} />
              </button>
              <span className="min-w-[2rem] text-center text-base font-semibold tabular-nums text-white">
                {line.quantity}
              </span>
              <button
                type="button"
                onClick={() => onQtyChange(line.quantity + 1)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-zinc-900 text-zinc-300 hover:bg-white/5"
                aria-label={t("orders.increaseQty")}
              >
                <Plus size={16} />
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              {t("orders.each")}
              <input
                type="number"
                min={0}
                step="0.01"
                defaultValue={coerceMoney(line.unitPrice)}
                key={`p-${line.id}-${line.unitPrice}`}
                onBlur={(e) => {
                  const p = parseFloat(e.target.value);
                  if (!Number.isNaN(p) && p !== coerceMoney(line.unitPrice))
                    onPriceBlur(p);
                }}
                className="w-16 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
            </label>
          </>
        ) : (
          <span className="text-xs text-zinc-500">
            {line.quantity} × {formatMoney(line.unitPrice)}
          </span>
        )}
        {!active ? (
          <span className="rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
            {t("orders.lineCanceled")}
          </span>
        ) : null}
      </div>
      {canEdit ? (
        <div className="mt-2 flex justify-end">
          {active ? (
            <button
              type="button"
              onClick={onRemoveLine}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-400/20 px-2.5 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/10"
            >
              <Trash2 size={12} />
              {t("orders.remove")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onRestoreLine}
              className="text-[11px] text-emerald-400"
            >
              {t("orders.restore")}
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
  onBack,
  onDeleteOrder,
  onCancelOrder,
  onHandOff,
  onBackToPreparing,
  onAddLine,
  onLineQty,
  onLinePrice,
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
  formatMoney: (n: import("@/lib/money").MoneyWire) => string;
  canHandToCustomer: boolean;
  metaAutosave?: "idle" | "pending" | "saving" | "saved";
  onBack?: () => void;
  onDeleteOrder: () => void;
  onCancelOrder: () => void;
  onHandOff: () => void;
  onBackToPreparing: () => void;
  onAddLine: (itemId: string, qty: number) => void;
  onLineQty: (lineId: string, q: number) => void;
  onLinePrice: (lineId: string, p: number) => void;
  onRemoveLine: (lineId: string) => void;
  onRestoreLine: (lineId: string) => void;
}) {
  const t: OrdersT =
    useVenueSettingsOptional()?.t ?? ((key) => key);
  const readOnly =
    tab === "ARCHIVED" ||
    Boolean(selected.archivedAt) ||
    selected.status === "CANCELED";
  const canEditLines =
    canWrite && !selected.archivedAt && selected.status !== "CANCELED";
  const menuSubtotal = orderLinesSubtotal(selected);
  const reservationCharge =
    selected.tableReserved && selected.reservationFee != null
      ? coerceMoney(selected.reservationFee)
      : 0;
  const takingOrder = canWrite && selected.status === "PENDING" && !readOnly;
  const [mobilePane, setMobilePane] = useState<"menu" | "ticket">("menu");
  const [detailsOpen, setDetailsOpen] = useState(
    () => !orderHasStaffLabel(selected) && selected.lines.length === 0,
  );
  const [linesOpen, setLinesOpen] = useState(
    () => selected.lines.length > 0,
  );
  const prevLineCount = useRef(selected.lines.length);

  useEffect(() => {
    setMobilePane(selected.lines.length > 0 ? "ticket" : "menu");
    setDetailsOpen(
      !orderHasStaffLabel(selected) && selected.lines.length === 0,
    );
    setLinesOpen(selected.lines.length > 0);
    prevLineCount.current = selected.lines.length;
  }, [selected.id]);

  useEffect(() => {
    if (selected.lines.length > prevLineCount.current) {
      setLinesOpen(true);
    }
    prevLineCount.current = selected.lines.length;
  }, [selected.lines.length]);

  const activeLineCount = selected.lines.filter(
    (l) => l.lineStatus === "ACTIVE",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-white/10 bg-zinc-950/40 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 lg:hidden"
              >
                <ArrowLeft size={14} />
                {t("orders.allOrders")}
              </button>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-white">
                {getOrderDisplayLabel(selected)}
              </h2>
              <OrderStatusBadge status={selected.status} />
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                {getOrderShortRef(selected.id)}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {selected.guestCount === 1
                ? t("orders.guestOne", { n: selected.guestCount })
                : t("orders.guestMany", { n: selected.guestCount })}{" "}
              · {selected.paymentMethod}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-emerald-300">
              {formatMoney(selected.total)}
            </p>
            {(menuSubtotal > 0 || reservationCharge > 0) && (
              <p className="mt-1 text-[10px] text-zinc-500">
                {t("orders.menuAmount", {
                  amount: formatMoney(menuSubtotal),
                })}
                {selected.tableReserved ? (
                  <>
                    {" "}
                    ·{" "}
                    {reservationCharge > 0
                      ? t("orders.reservationAmount", {
                          amount: formatMoney(reservationCharge),
                        })
                      : t("orders.reservationFree")}
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
                {t("orders.deletePermanently")}
              </button>
            ) : null}
          </div>
        </div>

        {selected.status === "PENDING" && canWrite ? (
          <p className="mt-3 hidden rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90 ring-1 ring-amber-500/20 sm:block">
            {t("orders.pendingHintBefore")}{" "}
            <strong>{t("orders.pendingHintStrong")}</strong>{" "}
            {t("orders.pendingHintAfter")}
          </p>
        ) : null}

        {takingOrder ? (
          <div className="mt-3 flex gap-1 rounded-xl bg-zinc-950/80 p-1 ring-1 ring-white/10 lg:hidden">
            <button
              type="button"
              onClick={() => setMobilePane("menu")}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium",
                mobilePane === "menu"
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "text-zinc-500",
              )}
            >
              <UtensilsCrossed size={14} />
              {t("orders.menu")}
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("ticket")}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium",
                mobilePane === "ticket"
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "text-zinc-500",
              )}
            >
              {t("orders.ticket")}
              {activeLineCount > 0 ? (
                <span className="rounded-full bg-emerald-500/30 px-1.5 text-[10px]">
                  {activeLineCount}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {readOnly && !canEditLines ? (
          <p className="mb-4 rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
            {tab === "ARCHIVED" || selected.archivedAt
              ? t("orders.archivedReadonly")
              : t("orders.canceledReadonly")}
          </p>
        ) : null}

        {!readOnly && canWrite ? (
          <section
            className={cn(
              "mb-5 rounded-xl border border-white/10 bg-zinc-900/30",
              takingOrder && mobilePane === "menu" && "hidden lg:block",
            )}
          >
            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t("orders.ticketDetails")}
              </span>
              <span className="flex items-center gap-2">
                {metaAutosave === "pending" ? (
                  <span className="text-[10px] text-zinc-500">{t("orders.willSave")}</span>
                ) : metaAutosave === "saving" ? (
                  <span className="text-[10px] text-amber-300/90">{t("orders.saving")}</span>
                ) : metaAutosave === "saved" ? (
                  <span className="text-[10px] text-emerald-400">{t("orders.saved")}</span>
                ) : null}
                <ChevronDown
                  size={16}
                  className={cn(
                    "text-zinc-500 transition-transform",
                    detailsOpen && "rotate-180",
                  )}
                />
              </span>
            </button>
            {detailsOpen ? (
              <div className="border-t border-white/5 px-3 pb-3 pt-1">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-zinc-500">
                {t("orders.tableGuestName")}
                <input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  disabled={metaAutosave === "saving"}
                  placeholder={t("orders.tableGuestPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white placeholder:text-zinc-600"
                />
              </label>
              <label className="text-xs text-zinc-500">
                {t("orders.guests")}
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
                {t("orders.payment")}
                <select
                  value={payDraft}
                  onChange={(e) => setPayDraft(e.target.value)}
                  disabled={metaAutosave === "saving"}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white"
                >
                  <option value="CASH">{t("orders.payCash")}</option>
                  <option value="CARD">{t("orders.payCard")}</option>
                  <option value="ONLINE">{t("orders.payOnline")}</option>
                  <option value="OTHER">{t("orders.payOther")}</option>
                </select>
              </label>
            </div>
            <label className="mt-2 block text-xs text-zinc-500">
              {t("orders.note")}
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
                    {t("orders.tableReserved")}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    {t("orders.tableReservedHint")}
                  </span>
                </span>
              </label>
              {tableReservedDraft ? (
                <label className="mt-3 block text-xs text-zinc-500">
                  {t("orders.reservationFee")}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={reservationFeeDraft}
                    onChange={(e) => setReservationFeeDraft(e.target.value)}
                    disabled={metaAutosave === "saving"}
                    placeholder={t("orders.reservationFeePlaceholder")}
                    className="mt-1 w-full max-w-[10rem] rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-sm text-white placeholder:text-zinc-600"
                  />
                </label>
              ) : null}
            </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!readOnly && !canWrite && selected.tableReserved ? (
          <p className="mb-4 rounded-lg border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-200/90">
            {t("orders.tableReservedReadonly")}
            {selected.reservationFee != null &&
            coerceMoney(selected.reservationFee) > 0
              ? ` · ${formatMoney(selected.reservationFee)}`
              : ` · ${t("orders.noReservationCharge")}`}
          </p>
        ) : null}

        <section
          className={cn(
            "mb-5 rounded-xl border border-white/10 bg-zinc-900/30",
            takingOrder && mobilePane === "menu" && "hidden lg:block",
          )}
        >
          <button
            type="button"
            onClick={() => setLinesOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {t("orders.lineItems", { n: selected.lines.length })}
            </span>
            <span className="flex items-center gap-2">
              {selected.lines.length > 0 ? (
                <span className="text-[10px] tabular-nums text-emerald-400">
                  {formatMoney(menuSubtotal)}
                </span>
              ) : null}
              <ChevronDown
                size={16}
                className={cn(
                  "text-zinc-500 transition-transform",
                  linesOpen && "rotate-180",
                )}
              />
            </span>
          </button>
          {linesOpen ? (
            <div className="border-t border-white/5 px-3 pb-3 pt-1">
              {selected.lines.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/15 py-6 text-center text-xs text-zinc-500">
                  {t("orders.noItemsYet")}
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {selected.lines.map((line) => (
                    <OrderLineRow
                      key={line.id}
                      line={line}
                      canEdit={canEditLines}
                      formatMoney={formatMoney}
                      t={t}
                      onQtyChange={(q) => onLineQty(line.id, q)}
                      onPriceBlur={(p) => onLinePrice(line.id, p)}
                      onRemoveLine={() => onRemoveLine(line.id)}
                      onRestoreLine={() => onRestoreLine(line.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>

        {takingOrder ? (
          <section
            className={cn(
              "flex min-h-0 flex-col rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 lg:min-h-[min(52vh,480px)]",
              mobilePane === "ticket" && "hidden lg:flex",
            )}
          >
            <p className="mb-3 shrink-0 text-sm font-semibold text-emerald-100/95">
              {t("orders.addToOrder")}
            </p>
            <div className="min-h-0 flex-1">
              <MenuItemPicker
                menu={menu}
                formatMoney={formatMoney}
                disabled={busy}
                onPick={(itemId, qty) => {
                  onAddLine(itemId, qty);
                  setMobilePane("ticket");
                }}
              />
            </div>
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
              {t("orders.handedToCustomer")}
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
              {t("orders.backToPreparing")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onCancelOrder}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 px-4 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10"
          >
            <XCircle size={16} />
            {t("orders.cancelOrder")}
          </button>
        </footer>
      ) : null}
    </div>
  );
}
