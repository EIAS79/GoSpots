import { coerceMoneyOrNull, type MoneyWire } from "./money";

/** Staff-facing ticket title — never a raw order id prefix. */
export function getOrderDisplayLabel(order: {
  label?: string | null;
  guestCount?: number;
}): string {
  const custom = order.label?.trim();
  if (custom) return custom;

  const guests = order.guestCount ?? 1;
  if (guests <= 1) return "Walk-in";
  return `Walk-in · ${guests} guests`;
}

/** Short disambiguator when several tickets share the same label (or none). */
export function getOrderShortRef(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}

export function orderHasStaffLabel(order: { label?: string | null }): boolean {
  return Boolean(order.label?.trim());
}

export function orderMetaDraftMatches(
  order: {
    label?: string | null;
    note?: string | null;
    paymentMethod?: string;
    guestCount?: number;
    tableReserved?: boolean;
    reservationFee?: MoneyWire | null;
  },
  labelDraft: string,
  noteDraft: string,
  payDraft: string,
  guestDraft: string,
  tableReservedDraft: boolean,
  reservationFeeDraft: string,
): boolean {
  const label = labelDraft.trim() || null;
  const note = noteDraft.trim() || null;
  const guests = parseInt(guestDraft, 10) || 1;
  const feeRaw = reservationFeeDraft.trim();
  const fee =
    !tableReservedDraft || feeRaw === ""
      ? null
      : Math.max(0, parseFloat(feeRaw) || 0);
  const orderFee =
    order.tableReserved && order.reservationFee != null
      ? coerceMoneyOrNull(order.reservationFee)
      : null;
  return (
    (order.label?.trim() || null) === label &&
    (order.note?.trim() || null) === note &&
    (order.paymentMethod ?? "CASH") === payDraft &&
    (order.guestCount ?? 1) === guests &&
    Boolean(order.tableReserved) === tableReservedDraft &&
    (orderFee ?? null) === fee
  );
}
