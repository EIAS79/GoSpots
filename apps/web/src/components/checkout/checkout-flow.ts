import { ApiError } from "@/lib/api";
import type {
  GuestCheck,
  GuestCheckCloseBlocker,
} from "@/lib/guest-check-client";

export type OperationalCheckoutBlocker = GuestCheckCloseBlocker & {
  sourceType: "SHOP_ORDER" | "PLAY_SESSION";
};

export function operationalCheckoutBlockers(
  check: GuestCheck,
): OperationalCheckoutBlocker[] {
  const fromServer = check.closeReadiness?.blockers?.filter(
    (blocker): blocker is OperationalCheckoutBlocker =>
      blocker.sourceType === "SHOP_ORDER" ||
      blocker.sourceType === "PLAY_SESSION",
  );
  if (fromServer) return fromServer;

  const blockers: OperationalCheckoutBlocker[] = [];
  for (const order of check.shopOrders) {
    if (order.status === "COMPLETED" || order.status === "CANCELED") continue;
    blockers.push({
      sourceType: "SHOP_ORDER",
      sourceId: order.id,
      status: order.status,
      label: order.label?.trim() || `Order ${order.id.slice(0, 8)}`,
      reason: "ORDER_OPEN",
    });
  }
  for (const session of check.playSessions) {
    if (session.reservationId) continue;
    if (session.status === "COMPLETED" || session.status === "CANCELED") continue;
    blockers.push({
      sourceType: "PLAY_SESSION",
      sourceId: session.id,
      status: session.status,
      label: session.label?.trim() || `Play session ${session.id.slice(0, 8)}`,
      reason: "PLAY_SESSION_OPEN",
    });
  }
  return blockers;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function checkoutErrorMessage(
  error: unknown,
  fallback = "Checkout could not complete that action.",
): string {
  if (error instanceof ApiError) {
    if (error.code === "GUEST_CHECK_ACTIVITY_OPEN") {
      const envelope = record(error.details);
      const details = record(envelope?.details);
      const stage = typeof details?.stage === "string" ? details.stage : null;
      return stage === "FINALIZE_BILL"
        ? "Finish the open order or play session before taking payment. This keeps the final amount from changing after payment."
        : "This check still has an open order or play session. Finish that activity, refresh, then close the check.";
    }
    if (error.code === "GUEST_CHECK_PAYMENT_INCOMPLETE") {
      return "Payment is not complete yet. Collect the remaining balance before closing the check.";
    }
    if (error.code === "GUEST_CHECK_PAYMENT_LOCKED") {
      return "A payment has already been recorded. The bill is locked so paid allocations cannot be changed or voided.";
    }
    if (error.code === "VERSION_CONFLICT") {
      return "The bill changed after it was calculated. Refresh checkout so GoSpots can recalculate the amount before payment.";
    }
  }

  const message = error instanceof Error ? error.message.trim() : "";
  if (/attached children|children are closed/i.test(message)) {
    return "This check still has an open order or play session. Finish that activity, refresh, then close the check.";
  }
  if (/settlement is stale|guest check changed/i.test(message)) {
    return "Checkout changed in another screen. Refresh this check and try again.";
  }
  return message || fallback;
}

export function paymentMethodLabel(method: string) {
  if (method === "CASH") return "Cash";
  if (method === "MANUAL_CARD") return "Card · recorded manually";
  if (method === "OTHER") return "Other";
  return method.replaceAll("_", " ").toLowerCase();
}
