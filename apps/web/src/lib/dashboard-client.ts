import { api, ensureCsrf } from "./api";
import {
  idempotencyActionKey,
  withIdempotentFinanceCall,
} from "./idempotency-key";
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

export type BillingProvider = "STRIPE" | "MOLLIE";
export type BillingRenewalMode = "AUTOMATIC_RENEWAL" | "MANUAL_MONTHLY";
export type BillingCancelTiming = "IMMEDIATE" | "PERIOD_END";

/** Legacy Lemon status (dual billing off) or dual envelope when enabled. */
export type BillingStatusResponse = {
  provider: "lemon_squeezy" | "dual" | string;
  configured?: boolean;
  currenciesNote?: string;
  lemonEnabled?: boolean;
  /** Present when dual billing is on. */
  enabled?: boolean;
  defaultProvider?: BillingProvider;
  providers?: BillingProvider[];
  gracePeriodDays?: number;
  lemon?: {
    provider: string;
    configured: boolean;
    lemonEnabled?: boolean;
    currenciesNote?: string;
  };
};

export type BillingProvidersResponse = {
  enabled: boolean;
  defaultProvider: BillingProvider;
  providers: BillingProvider[];
  gracePeriodDays: number;
};

export type BillingCatalogEntry = {
  id: string;
  kind: "pack" | "add_on";
  name: string;
  tagline: string;
  monthlyPriceEur: number;
  monthlyPrice: number;
  monthlyPriceMinor: number;
  currency: string;
  pricedPerSeat?: boolean;
  stripePriceId?: string | null;
};

export type BillingCatalogResponse = {
  currency: string;
  packs: BillingCatalogEntry[];
  addOns: BillingCatalogEntry[];
  fxRate: number;
  ratesAt: string;
};

export type BillingPaymentMethodSummary = {
  id: string;
  provider: BillingProvider | string;
  type?: string | null;
  cardBrand?: string | null;
  last4?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  bankName?: string | null;
  mandateStatus?: string | null;
  isDefault?: boolean;
};

export type DualBillingSubscription = {
  id: string;
  shopId: string;
  provider: BillingProvider | string;
  planId: string;
  renewalMode: BillingRenewalMode | string;
  canonicalStatus: string;
  currency: string;
  amountMinor: number;
  seatQuantity: number;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextBillingAt?: string | null;
  trialEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  gracePeriodEndsAt?: string | null;
  pausedAt?: string | null;
  resumeAt?: string | null;
  lastSuccessfulPaymentAt?: string | null;
  lastFailedPaymentAt?: string | null;
  addOns?: { addOnId: string; quantity: number; unitAmountMinor: number }[];
  billingAccount?: {
    id: string;
    provider: BillingProvider | string;
    billingEmail?: string | null;
    paymentMethods?: BillingPaymentMethodSummary[];
  } | null;
};

export type DualBillingSubscriptionResponse = {
  subscription: DualBillingSubscription | null;
};

export type BillingPaymentRow = {
  id: string;
  subscriptionId?: string | null;
  provider: BillingProvider | string;
  canonicalStatus: string;
  amountMinor: number;
  currency: string;
  paidAt?: string | null;
  failedAt?: string | null;
  createdAt: string;
  sequenceType?: string | null;
  actionUrl?: string | null;
  requiresCustomerAction?: boolean;
};

export type BillingCheckoutResult = {
  url: string;
  mode?: string;
  provider?: BillingProvider | string;
  operationId?: string;
  billingSubscriptionId?: string;
  amountMinor?: number;
  amountEur?: number | null;
  currency?: string;
  renewalMode?: BillingRenewalMode | string;
};

export type BillingCheckoutStatus = {
  id: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED" | string;
  operationType: string;
  response?: Record<string, unknown> | null;
  expiresAt?: string | null;
  createdAt: string;
};

export type DualCheckoutBody = {
  provider: BillingProvider;
  renewalMode: BillingRenewalMode;
  /** Venue pack id (API field name is packId). */
  packId: string;
  addOnIds?: string[];
  seatQuantity?: number;
  currency?: string;
  trialDays?: number;
  autoRenewConsent?: boolean;
};

async function billingMutate<T>(
  path: string,
  opts: {
    actionKey: string;
    body?: unknown;
    method?: string;
  },
): Promise<T> {
  await ensureCsrf();
  return withIdempotentFinanceCall(opts.actionKey, (idempotencyKey) =>
    api<T>(path, {
      method: opts.method ?? "POST",
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  );
}

export function fetchBillingStatus() {
  return api<BillingStatusResponse>("/billing/status");
}

export function isDualBillingStatus(
  status: BillingStatusResponse | null | undefined,
): boolean {
  if (!status) return false;
  return status.provider === "dual" || status.enabled === true;
}

export function fetchBillingProviders() {
  return api<BillingProvidersResponse>("/billing/providers");
}

export function fetchBillingCatalog(currency?: string) {
  const q = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return api<BillingCatalogResponse>(`/billing/catalog${q}`);
}

export function fetchDualBillingSubscription() {
  return api<DualBillingSubscriptionResponse>("/billing/subscription");
}

export function fetchBillingPayments(take = 40) {
  return api<{ items: BillingPaymentRow[] }>(
    `/billing/payments?take=${Math.min(Math.max(take, 1), 100)}`,
  );
}

export function fetchBillingCheckoutStatus(operationId: string) {
  return api<BillingCheckoutStatus>(
    `/billing/checkout/${encodeURIComponent(operationId)}/status`,
  );
}

/** Dual-provider checkout (requires BILLING_ENABLED). */
export function startDualBillingCheckout(body: DualCheckoutBody) {
  return billingMutate<BillingCheckoutResult>("/billing/checkout", {
    actionKey: idempotencyActionKey("billing.checkout", body),
    body,
  });
}

/** Legacy Lemon checkout (empty body when dual billing is off). */
export function startBillingCheckout() {
  return api<{
    url: string;
    mode?: "checkout" | "portal";
    amountEur?: number | null;
    currency?: string;
  }>("/billing/checkout", { method: "POST" });
}

/** Legacy Lemon customer portal. */
export function openBillingPortal() {
  return api<{ url: string; mode: "portal" }>("/billing/portal", {
    method: "POST",
  });
}

export function cancelDualSubscription(timing: BillingCancelTiming) {
  return billingMutate<DualBillingSubscriptionResponse>(
    "/billing/subscription/cancel",
    {
      actionKey: idempotencyActionKey("billing.cancel", { timing }),
      body: { timing },
    },
  );
}

export function pauseDualSubscription(resumeAt?: string) {
  return billingMutate<DualBillingSubscriptionResponse>(
    "/billing/subscription/pause",
    {
      actionKey: idempotencyActionKey("billing.pause", { resumeAt: resumeAt ?? null }),
      body: resumeAt ? { resumeAt } : {},
    },
  );
}

export function resumeDualSubscription() {
  return billingMutate<DualBillingSubscriptionResponse>(
    "/billing/subscription/resume",
    {
      actionKey: idempotencyActionKey("billing.resume", {}),
    },
  );
}

export function changeDualPlan(body: {
  packId: string;
  addOnIds: string[];
  seatQuantity?: number;
}) {
  return billingMutate<DualBillingSubscriptionResponse>(
    "/billing/subscription/change-plan",
    {
      actionKey: idempotencyActionKey("billing.change-plan", body),
      body,
    },
  );
}

export function changeDualRenewalMode(body: {
  renewalMode: BillingRenewalMode;
  autoRenewConsent?: boolean;
}) {
  return billingMutate<DualBillingSubscriptionResponse>(
    "/billing/subscription/change-renewal-mode",
    {
      actionKey: idempotencyActionKey("billing.change-renewal-mode", body),
      body,
    },
  );
}

export function switchDualProvider(body: {
  provider: BillingProvider;
  renewalMode?: BillingRenewalMode;
  autoRenewConsent?: boolean;
}) {
  return billingMutate<BillingCheckoutResult>(
    "/billing/subscription/switch-provider",
    {
      actionKey: idempotencyActionKey("billing.switch-provider", body),
      body,
    },
  );
}

export function startManualRenewalCheckout() {
  return billingMutate<BillingCheckoutResult>("/billing/manual-renewal/checkout", {
    actionKey: idempotencyActionKey("billing.manual-renewal", {
      t: Math.floor(Date.now() / 60_000),
    }),
  });
}

export function updateDualPaymentMethod() {
  return billingMutate<{ url: string; mode: "portal" }>(
    "/billing/payment-method/update",
    {
      actionKey: idempotencyActionKey("billing.payment-method", {
        t: Math.floor(Date.now() / 60_000),
      }),
    },
  );
}

export function openStripeCustomerPortal() {
  return billingMutate<{ url: string; mode?: string }>(
    "/billing/stripe/customer-portal",
    {
      actionKey: idempotencyActionKey("billing.stripe-portal", {
        t: Math.floor(Date.now() / 60_000),
      }),
    },
  );
}

const BILLING_OP_STORAGE_KEY = "gospots.billing.pendingOp";

export function storePendingBillingOperation(operationId: string) {
  try {
    sessionStorage.setItem(BILLING_OP_STORAGE_KEY, operationId);
  } catch {
    /* ignore */
  }
}

export function peekPendingBillingOperation(): string | null {
  try {
    return sessionStorage.getItem(BILLING_OP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingBillingOperation() {
  try {
    sessionStorage.removeItem(BILLING_OP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated Prefer peek + clear after confirm. */
export function takePendingBillingOperation(): string | null {
  const id = peekPendingBillingOperation();
  if (id) clearPendingBillingOperation();
  return id;
}

export type { NotificationRow } from "./notifications-client";
export {
  fetchNotifications,
  fetchNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications-client";
