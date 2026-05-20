import { api } from "./api";

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
  } | null;
  kpis: {
    revenueToday: number;
    revenueWeek: number;
    lossesWeek: number;
    profitWeek: number;
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
    revenueByDay: { day: string; total: number }[];
    ordersByDay: { day: string; count: number; customers: number }[];
    lossesByDay: { day: string; amount: number }[];
  };
  topMenuItems: {
    menuItemId: string | null;
    name: string;
    quantity: number;
    revenue: number;
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

export function fetchSubscription() {
  return api<{
    subscription: {
      tier: string;
      status: string;
      trialEndsAt: string | null;
      currentPeriodEnd: string | null;
    } | null;
    staffUsed: number;
    staffLimit: number;
    effectiveTier: string;
    billedTier: string;
    trialActive: boolean;
    trialExpired: boolean;
    trialDaysRemaining: number;
    features: { key: string; unlocked: boolean }[];
    marketingFeatures: { key: string; unlocked: boolean }[];
  }>("/dashboard/subscription");
}


export type { NotificationRow } from "./notifications-client";
export {
  fetchNotifications,
  fetchNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications-client";
