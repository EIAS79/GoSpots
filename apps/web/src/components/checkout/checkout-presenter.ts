import type { CheckoutChargeLine } from "@/lib/checkout-client";
import type { GuestCheck } from "@/lib/guest-check-client";

export type CheckoutGroupKey = "PLAY" | "FOOD_DRINK" | "BOOKING" | "OTHER";
export type CheckoutRole = "OWNER" | "MANAGER" | "STAFF" | undefined;

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
    const label = play.label?.trim() || `Play session ${play.id.slice(0, 8)}`;
    blockers.push({
      kind: "PLAY_SESSION",
      id: play.id,
      label,
      status: play.status,
      action: "sessions",
      message: `${label} is still ${play.status.toLowerCase()}. End or cancel the play session before closing this check.`,
    });
  }

  return blockers;
}

export function checkoutFlowStep(input: {
  lineCount: number;
  paymentStarted: boolean;
  fullyPaid: boolean;
  blockerCount: number;
}): 1 | 2 | 3 | 4 {
  if (input.lineCount === 0) return 1;
  if (!input.fullyPaid) return 2;
  if (input.blockerCount > 0) return 3;
  return 4;
}

type ErrorLike = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

export function checkoutCloseErrorMessage(error: unknown): string {
  const value =
    error && typeof error === "object" ? (error as ErrorLike) : undefined;

  const details = value?.details;
  if (details && typeof details === "object") {
    const body = details as Record<string, unknown>;
    if (Array.isArray(body.blockers) && body.blockers.length > 0) {
      return "Payment is complete, but a live order or play session is still open. Finish it first, then close the check.";
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  }

  if (typeof value?.message === "string" && value.message.trim()) {
    const message = value.message;
    if (message.toLowerCase().includes("attached children")) {
      return "Payment is complete, but a live order or play session is still open. Finish it first, then close the check.";
    }
    return message;
  }

  return "The check could not be closed. Refresh the checkout and try again.";
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
