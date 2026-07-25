import { api } from "./api";
import type { MoneyWire } from "./money";

export type DashboardOverview = {
  shop: {
    id?: string;
    name?: string;
    slug?: string;
    isPublished?: boolean;
  };
  subscription: {
    tier: string;
    status: string;
    trialEndsAt: string | null;
    staffLimit: number;
    staffUsed: number;
    features: { key: string; unlocked: boolean }[];
    packId?: string | null;
    addOns?: string;
  } | null;
  kpis: {
    revenueToday: MoneyWire;
    revenueWeek: MoneyWire;
    lossesWeek: MoneyWire;
    profitWeek: MoneyWire;
    ordersToday: number;
    completedOrdersWeek: number;
    customersWeek: number;
    reservationsToday: number;
    reservationsPending: number;
    menuItems: number;
    venueViews7d: number;
    menuViews7d: number;
    reservationClicks7d: number;
  };
  charts: {
    venueViewsByDay: { day: string; count: number }[];
    revenueByDay: { day: string; total: MoneyWire }[];
    ordersByDay: { day: string; count: number; customers: number }[];
    lossesByDay: { day: string; amount: MoneyWire }[];
  };
  topMenuItems: {
    menuItemId: string | null;
    name: string;
    quantity: number;
    revenue: MoneyWire;
  }[];
  recentReservations: {
    id: string;
    guestName: string;
    resource: string | null | undefined;
    startsAt: string;
    status: string;
  }[];
  recentAudit: {
    id: string;
    action: string;
    createdAt: string;
    meta: string | null;
  }[];
};

export function fetchDashboardOverview() {
  return api<DashboardOverview>("/dashboard/overview");
}

export type SubscriptionResponse = {
  subscription: {
    tier: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    packId?: string | null;
    addOns?: string | null;
    pendingPackId?: string | null;
    pendingAddOns?: string | null;
    pendingStaffSeatQuantity?: number | null;
  } | null;
  staffUsed: number;
  staffLimit: number;
  staffSeatQuantity?: number;
  effectiveTier: string;
  billedTier: string;
  trialActive: boolean;
  trialExpired: boolean;
  trialDaysRemaining: number;
  packId: string | null;
  addOns: string;
  pendingPackId?: string | null;
  pendingAddOns?: string | null;
  pendingStaffSeatQuantity?: number | null;
  hasPendingChanges?: boolean;
  pendingAppliesAt?: string | null;
  pendingMonthlyTotal?: number | null;
  trialStaffSeatLimit?: number;
  dataRetentionNote?: string;
  enabledModules: string[];
  monthlyTotal: number;
  billingConfigured?: boolean;
  /** Missing Lemon env var names (never values). */
  billingMissingEnv?: string[];
  lemonSubscriptionId?: string | null;
  features: { key: string; unlocked: boolean }[];
  marketingFeatures: { key: string; unlocked: boolean }[];
  packs: {
    id: string;
    name: string;
    tagline: string;
    monthlyPrice: number;
    currency: string;
    recommendedFeatures?: string[];
    showsGaming: boolean;
    showsDining: boolean;
  }[];
  addOnCatalog: {
    id: string;
    name: string;
    tagline: string;
    details?: string;
    monthlyPrice: number;
    currency: string;
    modules: string[];
    unlocksGaming?: boolean;
    unlocksDining?: boolean;
    pricedPerSeat?: boolean;
    recommendedFor?: string[];
  }[];
};

export function fetchSubscription() {
  return api<SubscriptionResponse>("/dashboard/subscription");
}

export function updateVenuePack(body: {
  packId?: string;
  addOns?: string[];
  staffSeatQuantity?: number;
}) {
  return api<SubscriptionResponse>("/dashboard/subscription/pack", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchBillingStatus() {
  return api<{
    provider: string;
    configured: boolean;
    currenciesNote: string;
  }>("/billing/status");
}

export function startBillingCheckout() {
  return api<{
    url: string;
    mode?: "checkout" | "portal";
    amountEur?: number | null;
    currency?: string;
  }>("/billing/checkout", { method: "POST" });
}

export function openBillingPortal() {
  return api<{ url: string; mode: "portal" }>("/billing/portal", {
    method: "POST",
  });
}

export type { NotificationRow } from "./notifications-client";
export {
  fetchNotifications,
  fetchNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications-client";
