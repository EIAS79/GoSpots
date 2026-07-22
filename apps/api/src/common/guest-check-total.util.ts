import {
  addMoney,
  serializeMoney,
  toMoneyNumber,
  type MoneyInput,
  type MoneyWire,
} from './money.util';

/** Line contribution kinds for staff open-tab running total (Option A display). */
export type GuestCheckLineKind = 'MENU' | 'PLAY' | 'FEE' | 'EXCLUDED_PLAY';

export type GuestCheckTotalLine = {
  kind: GuestCheckLineKind;
  sourceType: 'SHOP_ORDER' | 'PLAY_SESSION' | 'RESERVATION';
  sourceId: string;
  label: string;
  /** Amount included in running total (0 when excluded). */
  amount: MoneyWire;
  /** True when amount is shown but not added (anti-double-count). */
  excluded: boolean;
  reason?: string;
};

export type GuestCheckRunningTotalInput = {
  orders: Array<{
    id: string;
    status: string;
    total: MoneyInput;
    label?: string | null;
    reservationFee?: MoneyInput;
  }>;
  playSessions: Array<{
    id: string;
    status: string;
    amount: MoneyInput;
    reservationId?: string | null;
    label?: string | null;
  }>;
  reservations: Array<{
    id: string;
    guestName?: string | null;
    billedAmount?: MoneyInput;
    resourceId?: string | null;
  }>;
};

export type GuestCheckRunningTotalResult = {
  runningTotal: MoneyWire;
  menuTotal: MoneyWire;
  playTotal: MoneyWire;
  reservationTotal: MoneyWire;
  lines: GuestCheckTotalLine[];
};

/**
 * Staff open-tab running total under Option A (ops container).
 * Mirrors finance-contract anti-double-count:
 * - Canceled orders ignored
 * - Linked play (`reservationId` set) never adds play amount
 * - Reservation billedAmount counts once (play channel vs dining by resourceId is display-only here)
 * - `ShopOrder.reservationFee` is already inside `total` — do not add again
 */
export function computeGuestCheckRunningTotal(
  input: GuestCheckRunningTotalInput,
): GuestCheckRunningTotalResult {
  const lines: GuestCheckTotalLine[] = [];
  const menuParts: MoneyInput[] = [];
  const playParts: MoneyInput[] = [];
  const reservationParts: MoneyInput[] = [];

  const reservationIds = new Set(input.reservations.map((r) => r.id));

  for (const o of input.orders) {
    if (o.status === 'CANCELED') continue;
    menuParts.push(o.total);
    lines.push({
      kind: 'MENU',
      sourceType: 'SHOP_ORDER',
      sourceId: o.id,
      label: o.label?.trim() || `Order ${o.id.slice(0, 8)}`,
      amount: serializeMoney(o.total),
      excluded: false,
      reason:
        toMoneyNumber(o.reservationFee) > 0
          ? 'reservationFee_embedded_in_order_total'
          : undefined,
    });
  }

  for (const r of input.reservations) {
    const billed = r.billedAmount;
    if (billed == null || toMoneyNumber(billed) === 0) {
      lines.push({
        kind: 'FEE',
        sourceType: 'RESERVATION',
        sourceId: r.id,
        label: r.guestName?.trim() || `Reservation ${r.id.slice(0, 8)}`,
        amount: serializeMoney(0),
        excluded: false,
        reason: 'unbilled',
      });
      continue;
    }
    reservationParts.push(billed);
    lines.push({
      kind: 'FEE',
      sourceType: 'RESERVATION',
      sourceId: r.id,
      label: r.guestName?.trim() || `Reservation ${r.id.slice(0, 8)}`,
      amount: serializeMoney(billed),
      excluded: false,
      reason: r.resourceId ? 'play_via_reservation_billedAmount' : 'dining_reservation_billedAmount',
    });
  }

  for (const p of input.playSessions) {
    if (p.status === 'CANCELED') continue;
    const linked = p.reservationId != null && p.reservationId !== '';
    if (linked) {
      lines.push({
        kind: 'EXCLUDED_PLAY',
        sourceType: 'PLAY_SESSION',
        sourceId: p.id,
        label: p.label?.trim() || `Play ${p.id.slice(0, 8)}`,
        amount: serializeMoney(0),
        excluded: true,
        reason: reservationIds.has(p.reservationId!)
          ? 'linked_play_excluded_bill_on_reservation'
          : 'linked_play_excluded_even_if_reservation_not_on_check',
      });
      continue;
    }
    playParts.push(p.amount);
    lines.push({
      kind: 'PLAY',
      sourceType: 'PLAY_SESSION',
      sourceId: p.id,
      label: p.label?.trim() || `Play ${p.id.slice(0, 8)}`,
      amount: serializeMoney(p.amount),
      excluded: false,
      reason: 'walk_in_play',
    });
  }

  const menuTotal = addMoney(...menuParts);
  const playTotal = addMoney(...playParts);
  const reservationTotal = addMoney(...reservationParts);
  const runningTotal = addMoney(menuTotal, playTotal, reservationTotal);

  return {
    runningTotal: serializeMoney(runningTotal),
    menuTotal: serializeMoney(menuTotal),
    playTotal: serializeMoney(playTotal),
    reservationTotal: serializeMoney(reservationTotal),
    lines,
  };
}
