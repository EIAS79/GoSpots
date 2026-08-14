import type { CheckoutChargeLine } from "@/lib/checkout-client";
import type { GuestCheck } from "@/lib/guest-check-client";
import type { ShopRole } from "@/lib/auth-client";

export type CheckoutGroupKey = "PLAY" | "FOOD_DRINK" | "BOOKING" | "OTHER";
export type CheckoutRole = ShopRole | undefined;

export type CheckoutIssueKind =
  | "offline"
  | "conflict"
  | "disabled"
  | "unauthorized"
  | "error";

export type CheckoutOperationalBlocker = {
  kind: "ORDER" | "PLAY_SESSION";
  id: string;
  label: string;
  status: string;
  action: "orders" | "sessions";
  message: string;
};

export const CHECKOUT_GROUPS: ReadonlyArray<{
  key: CheckoutGroupKey;
  label: string;
}> = [
  { key: "PLAY", label: "Play" },
  { key: "FOOD_DRINK", label: "Food & Drink" },
  { key: "BOOKING", label: "Booking" },
  { key: "OTHER", label: "Event / Other" },
];

export function checkoutGroupForSource(
  sourceType: string,
): CheckoutGroupKey {
  if (sourceType === "PLAY_SESSION") return "PLAY";
  if (sourceType === "SHOP_ORDER") return "FOOD_DRINK";
  if (sourceType === "RESERVATION") return "BOOKING";
  return "OTHER";
}

export function groupCheckoutLines(lines: readonly CheckoutChargeLine[]) {
  const grouped: Record<CheckoutGroupKey, CheckoutChargeLine[]> = {
    PLAY: [],
    FOOD_DRINK: [],
    BOOKING: [],
    OTHER: [],
  };

  for (const line of lines) {
    grouped[checkoutGroupForSource(line.sourceType)].push(line);
  }
  return grouped;
}

function permissionSet(permissions: string): Set<string> {
  return new Set(
    permissions
      .split(",")
      .map((permission) => permission.trim())
      .filter(Boolean),
  );
}

export function checkoutAccess(role: CheckoutRole, permissions: string) {
  if (role === "OWNER") return { read: true, write: true } as const;
  const permissionsSet = permissionSet(permissions);
  const wildcard = permissionsSet.has("*");
  return {
    read: wildcard || permissionsSet.has("checkout.read"),
    write: wildcard || permissionsSet.has("checkout.write"),
  } as const;
}

/**
 * Sources that can still change the amount and therefore block a NEW payment.
 * An ended standalone play timer is bill-final even though Checkout has not yet
 * stamped it paid; the authoritative close endpoint does that after payment.
 */
export function checkoutBillBlockers(
  check: GuestCheck,
): CheckoutOperationalBlocker[] {
  const blockers: CheckoutOperationalBlocker[] = [];

  for (const order of check.shopOrders) {
    if (order.status === "COMPLETED" || order.status === "CANCELED") continue;
    const label = order.label?.trim() || `Order ${order.id.slice(0, 8)}`;
    blockers.push({
      kind: "ORDER",
      id: order.id,
      label,
      status: order.status,
      action: "orders",
      message: `${label} is still ${order.status.toLowerCase()}. Hand it off or cancel it so the bill is final before payment.`,
    });
  }

  for (const play of check.playSessions) {
    if (play.reservationId) continue;
    if (play.status === "COMPLETED" || play.status === "CANCELED") continue;
    if (play.endedAt) continue;
    const label = play.label?.trim() || `Play session ${play.id.slice(0, 8)}`;
    blockers.push({
      kind: "PLAY_SESSION",
      id: play.id,
      label,
      status: play.status,
      action: "sessions",
      message: `${label} is still running. End the timer first so its final amount is frozen before payment.`,
    });
  }

  return blockers;
}

/**
 * Live operational work that still blocks closing a PAID check. Ended standalone
 * play is not a blocker because authoritative close reconciles its paid stamp from
 * the immutable settlement. Reservation-linked live play still needs to be ended.
 */
export function checkoutOperationalBlockers(
  check: GuestCheck,
): CheckoutOperationalBlocker[] {
  const blockers: CheckoutOperationalBlocker[] = [];

  for (const order of check.shopOrders) {
    if (order.status === "COMPLETED" || order.status === "CANCELED") continue;
    const label = order.label?.trim() || `Order ${order.id.slice(0, 8)}`;
    blockers.push({
      kind: "ORDER",
      id: order.id,
      label,
      status: order.status,
      action: "orders",
      message: `${label} is still ${order.status.toLowerCase()}. Complete or cancel the order before closing this check.`,
    });
  }

  for (const play of check.playSessions) {
    if (play.status === "COMPLETED" || play.status === "CANCELED") continue;
    if (!play.reservationId && play.endedAt) continue;
    const label = play.label?.trim() || `Play session ${play.id.slice(0, 8)}`;
    blockers.push({
      kind: "PLAY_SESSION",
      id: play.id,
      label,
      status: play.status,
      action: "sessions",
      message: `${label} is still active. End or cancel the play session before closing this check.`,
    });
  }

  return blockers;
}

export function checkoutFlowStep(input: {
  lineCount: number;
  paymentStarted: boolean;
  fullyPaid: boolean;
  blockerCount: number;
  billBlockerCount?: number;
}): 1 | 2 | 3 | 4 {
  if (input.lineCount === 0) return 1;
  const billBlockers = input.billBlockerCount ?? input.blockerCount;
  if (!input.fullyPaid && billBlockers > 0) return 2;
  if (!input.fullyPaid) return 3;
  return 4;
}

type ErrorLike = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function checkoutErrorMessage(
  error: unknown,
  fallback = "Checkout could not complete that action. Refresh and try again.",
): string {
  const value =
    error && typeof error === "object" ? (error as ErrorLike) : undefined;

  const outer = asRecord(value?.details);
  const nested = asRecord(outer?.details) ?? outer;
  const stage = typeof nested?.stage === "string" ? nested.stage : null;
  if (stage === "FINALIZE_BILL") {
    return "Finish the open order or end the running play timer before taking payment. GoSpots blocks payment until the amount is final.";
  }
  if (stage === "SOURCE_CHANGED") {
    return "The bill changed after it was calculated. Refresh checkout so GoSpots can recalculate it before payment.";
  }

  if (nested && Array.isArray(nested.blockers) && nested.blockers.length > 0) {
    return "Payment is complete, but a live order or play session is still open. Finish it first, then close the check.";
  }
  if (nested && typeof nested.message === "string" && nested.message.trim()) {
    return nested.message;
  }

  if (typeof value?.message === "string" && value.message.trim()) {
    const message = value.message;
    const lower = message.toLowerCase();
    if (lower.includes("attached children")) {
      return "Payment is complete, but a live order or play session is still open. Finish it first, then close the check.";
    }
    if (lower.includes("finalize open orders") || lower.includes("standalone play")) {
      return "Finish the open order or end the running play timer before taking payment. GoSpots blocks payment until the amount is final.";
    }
    if (lower.includes("linked activity changed")) {
      return "The bill changed after it was calculated. Refresh checkout so GoSpots can recalculate it before payment.";
    }
    return message;
  }

  return fallback;
}

export function checkoutCloseErrorMessage(error: unknown): string {
  return checkoutErrorMessage(
    error,
    "The check could not be closed. Refresh the checkout and try again.",
  );
}

export function classifyCheckoutError(error: unknown): CheckoutIssueKind {
  const value =
    error && typeof error === "object" ? (error as ErrorLike) : undefined;
  const status = typeof value?.status === "number" ? value.status : undefined;
  const code = typeof value?.code === "string" ? value.code : undefined;
  const message =
    typeof value?.message === "string" ? value.message.toLowerCase() : "";

  if (status === 0) return "offline";
  if (code === "VERSION_CONFLICT") return "conflict";
  if (status === 403 && message.includes("not enabled")) return "disabled";
  if (status === 403) return "unauthorized";
  return "error";
}

/** Display-only formatting. Authoritative arithmetic remains on the API. */
export function formatCheckoutMoney(
  amount: string,
  currency: string,
  locale = "en",
): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${amount} ${currency}`;
  }
}
