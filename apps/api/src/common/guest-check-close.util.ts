export type GuestCheckCloseBlockerReason =
  | 'ORDER_OPEN'
  | 'PLAY_SESSION_OPEN'
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
 * One close-readiness contract shared by the GuestCheck serializer and settle gate.
 *
 * Operational rules:
 * - Orders must be handed off (COMPLETED) or canceled.
 * - Standalone play sessions must be completed/canceled. Reservation-linked play is
 *   billed by its reservation and must not be counted twice.
 * - Resource reservations need a billing stamp unless canceled/no-show. Plain
 *   non-resource reservations have no checkout charge and therefore do not block.
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
      reason: 'PLAY_SESSION_OPEN',
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
