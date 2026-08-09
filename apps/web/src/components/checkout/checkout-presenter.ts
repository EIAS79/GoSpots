import type { CheckoutChargeLine } from "@/lib/checkout-client";

export type CheckoutGroupKey = "PLAY" | "FOOD_DRINK" | "BOOKING" | "OTHER";
export type CheckoutRole = "OWNER" | "MANAGER" | "STAFF" | undefined;

export type CheckoutIssueKind =
  | "offline"
  | "conflict"
  | "disabled"
  | "unauthorized"
  | "error";

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

type ErrorLike = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
};

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
