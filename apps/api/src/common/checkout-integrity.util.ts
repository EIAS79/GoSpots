export type CheckoutBillBlockerReason =
  | 'ORDER_OPEN'
  | 'PLAY_SESSION_OPEN';

export type CheckoutBillBlocker = {
  sourceType: 'SHOP_ORDER' | 'PLAY_SESSION';
  sourceId: string;
  status: string;
  label: string;
  reason: CheckoutBillBlockerReason;
};

type CheckoutBillInput = {
  shopOrders?: Array<{
    id: string;
    status: string;
    label?: string | null;
  }>;
  playSessions?: Array<{
    id: string;
    status: string;
    reservationId?: string | null;
    label?: string | null;
    endedAt?: unknown | null;
  }>;
};

/**
 * A checkout snapshot is safe to pay only after mutable bill sources are final.
 *
 * - Shop orders must be handed off or canceled.
 * - Standalone play must have its timer ended (or already be terminal). Ending a
 *   timer freezes the amount without falsely marking the session paid.
 * - Reservation-linked play is priced by the reservation source and is therefore
 *   not a mutable standalone checkout line.
 */
export function checkoutBillReadiness(check: CheckoutBillInput) {
  const blockers: CheckoutBillBlocker[] = [];

  for (const order of check.shopOrders ?? []) {
    if (order.status === 'COMPLETED' || order.status === 'CANCELED') continue;
    blockers.push({
      sourceType: 'SHOP_ORDER',
      sourceId: order.id,
      status: order.status,
      label: order.label?.trim() || `Order ${order.id.slice(0, 8)}`,
      reason: 'ORDER_OPEN',
    });
  }

  for (const play of check.playSessions ?? []) {
    if (play.reservationId) continue;
    if (play.status === 'COMPLETED' || play.status === 'CANCELED') continue;
    if (play.endedAt != null) continue;
    blockers.push({
      sourceType: 'PLAY_SESSION',
      sourceId: play.id,
      status: play.status,
      label: play.label?.trim() || `Play session ${play.id.slice(0, 8)}`,
      reason: 'PLAY_SESSION_OPEN',
    });
  }

  return { ready: blockers.length === 0, blockers } as const;
}
