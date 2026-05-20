"use client";

import { CalendarCheck, Users, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/cn";
import { OrderStatusBadge } from "@/components/finance/order-status-badge";
import type { ShopOrder } from "@/lib/finance-client";
import {
  getOrderDisplayLabel,
  getOrderShortRef,
  orderHasStaffLabel,
} from "@/lib/order-display-label";

function activeLineCount(o: ShopOrder) {
  return o.lines.filter((l) => l.lineStatus === "ACTIVE" && l.quantity > 0)
    .length;
}

function formatShortTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderGridCard({
  order,
  selected,
  checked,
  onSelect,
  onToggleCheck,
  formatMoney,
  showCheckbox,
}: {
  order: ShopOrder;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
  formatMoney: (n: number) => string;
  showCheckbox: boolean;
}) {
  const lines = activeLineCount(order);
  const title = getOrderDisplayLabel(order);
  const showRef = !orderHasStaffLabel(order);

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl border p-3 transition-all duration-200",
        selected
          ? "border-emerald-400/50 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-400/30"
          : "border-white/10 bg-zinc-900/50 hover:border-white/20 hover:bg-zinc-900/80",
      )}
    >
      {showCheckbox ? (
        <label
          className="absolute left-2 top-2 z-10 flex cursor-pointer items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            className="size-3.5 rounded border-white/30 bg-zinc-950/80 text-emerald-500 focus:ring-emerald-500/40"
          />
        </label>
      ) : null}

      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex min-h-[88px] flex-1 flex-col text-left",
          showCheckbox && "pl-5",
        )}
      >
        <div className="flex items-start justify-between gap-1">
          <h3
            className={cn(
              "line-clamp-2 text-sm font-semibold leading-tight",
              orderHasStaffLabel(order) ? "text-white" : "text-zinc-200",
            )}
            title={title}
          >
            {title}
          </h3>
          <OrderStatusBadge status={order.status} />
        </div>

        <p className="mt-2 text-lg font-bold tabular-nums tracking-tight text-emerald-300">
          {formatMoney(order.total)}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-[10px] text-zinc-500">
          <span className="inline-flex items-center gap-0.5">
            <Users size={11} className="opacity-70" />
            {order.guestCount}
          </span>
          <span className="text-zinc-600">·</span>
          <span className="inline-flex items-center gap-0.5">
            <UtensilsCrossed size={11} className="opacity-70" />
            {lines} {lines === 1 ? "item" : "items"}
          </span>
          {order.tableReserved ? (
            <>
              <span className="text-zinc-600">·</span>
              <span className="inline-flex items-center gap-0.5 text-violet-400/90">
                <CalendarCheck size={11} />
                Reserved
                {order.reservationFee != null && order.reservationFee > 0
                  ? ` ${formatMoney(order.reservationFee)}`
                  : " free"}
              </span>
            </>
          ) : null}
        </div>

        <p className="mt-1 truncate text-[10px] text-zinc-600">
          {formatShortTime(order.createdAt)}
          {showRef ? (
            <span className="text-zinc-500"> · #{getOrderShortRef(order.id)}</span>
          ) : null}
        </p>
      </button>
    </article>
  );
}
