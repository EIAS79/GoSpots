export type GuestCheckCloseBlockerReason =
  | 'ORDER_OPEN'
  | 'PLAY_SESSION_OPEN'
  | 'PLAY_SESSION_UNPAID'
  | 'RESERVATION_UNBILLED';

export type GuestCheckCloseBlocker = {
  sourceType: 'SHOP_ORDER' | 'PLAY_SESSION' | 'RESERVATION';
  sourceId: string;
  status: string;
  label: string;
  reason: GuestCheckCloseBlockerReason;
};

type GuestCheckCloseInput = {
  shopOrders: Array<{
    id: string;
    status: string;
    label?: string | null;
  }>;
  playSessions: Array<{
    id: string;
    status: string;
    reservationId?: string | null;
    label?: string | null;
    endedAt?: unknown | null;
    completedAt?: unknown | null;
  }>;
  reservations: Array<{
    id: string;
    status: string;
    guestName?: string | null;
    resourceId?: string | null;
    billedAmount?: unknown | null;
  }>;
};

/**
 * Sources whose amount/fulfilment is still operationally mutable. New checkout
 * payments must not be recorded while these remain open, otherwise the immutable
 * settlement snapshot can diverge from the eventual order/session amount.
 *
 * An ended standalone play session is bill-final even though its legacy paid stamp
 * is intentionally deferred until Checkout V2 closes the paid settlement.
 */
export function guestCheckOperationalReadiness(check: GuestCheckCloseInput) {
  const blockers: GuestCheckCloseBlocker[] = [];

  for (const order of check.shopOrders) {
    if (order.status === 'COMPLETED' || order.status === 'CANCELED') continue;
    blockers.push({
      sourceType: 'SHOP_ORDER',
      sourceId: order.id,
      status: order.status,
      label: order.label?.trim() || `Order ${order.id.slice(0, 8)}`,
      reason: 'ORDER_OPEN',
    });
  }

  for (const session of check.playSessions) {
    if (session.reservationId) continue;
    if (session.status === 'COMPLETED' || session.status === 'CANCELED') continue;
    if (session.endedAt != null) continue;
    blockers.push({
      sourceType: 'PLAY_SESSION',
      sourceId: session.id,
      status: session.status,
      label: session.label?.trim() || `Play session ${session.id.slice(0, 8)}`,
      reason: 'PLAY_SESSION_OPEN',
    });
  }

  return {
    ready: blockers.length === 0,
    blockers,
  } as const;
}

/**
 * Full close gate. Orders must be terminal. Standalone play must have its paid
 * completion stamp, and resource reservations must have a billing stamp. Checkout
 * V2 reconciles both stamps from the paid immutable settlement before this gate.
 */
export function guestCheckCloseReadiness(check: GuestCheckCloseInput) {
  const blockers: GuestCheckCloseBlocker[] = [];

  for (const order of check.shopOrders) {
    if (order.status === 'COMPLETED' || order.status === 'CANCELED') continue;
    blockers.push({
      sourceType: 'SHOP_ORDER',
      sourceId: order.id,
      status: order.status,
      label: order.label?.trim() || `Order ${order.id.slice(0, 8)}`,
      reason: 'ORDER_OPEN',
    });
  }

  for (const session of check.playSessions) {
    if (session.reservationId) continue;
    if (session.status === 'COMPLETED' || session.status === 'CANCELED') continue;
    blockers.push({
      sourceType: 'PLAY_SESSION',
      sourceId: session.id,
      status: session.status,
      label: session.label?.trim() || `Play session ${session.id.slice(0, 8)}`,
      reason: session.endedAt != null ? 'PLAY_SESSION_UNPAID' : 'PLAY_SESSION_OPEN',
    });
  }

  for (const reservation of check.reservations) {
    if (reservation.status === 'CANCELED' || reservation.status === 'NO_SHOW') {
      continue;
    }
    if (!reservation.resourceId) continue;
    if (reservation.billedAmount != null) continue;
    blockers.push({
      sourceType: 'RESERVATION',
      sourceId: reservation.id,
      status: reservation.status,
      label:
        reservation.guestName?.trim() ||
        `Reservation ${reservation.id.slice(0, 8)}`,
      reason: 'RESERVATION_UNBILLED',
    });
  }

  return {
    ready: blockers.length === 0,
    blockers,
  } as const;
}
