import type {
  BillingCanonicalPaymentStatus,
  BillingCanonicalSubscriptionStatus,
} from '@prisma/client';

/** Dual-provider runtime ids (Lemon is legacy / feature-flagged). */
export type BillingProviderId = 'STRIPE' | 'MOLLIE';

/** Canonical subscription status — mirrors Prisma enum. */
export type CanonicalSubscriptionState = BillingCanonicalSubscriptionStatus;

/** Canonical payment status — mirrors Prisma enum. */
export type CanonicalPaymentState = BillingCanonicalPaymentStatus;

export type CheckoutResult = {
  url: string;
  mode: 'checkout' | 'portal';
  providerCheckoutId?: string | null;
  providerCustomerId?: string | null;
  providerPaymentId?: string | null;
  providerSubscriptionId?: string | null;
};

export type ProviderCustomer = {
  id: string;
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, string>;
};

export type ProviderSubscription = {
  id: string;
  customerId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  priceId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  metadata?: Record<string, string>;
};

export type ProviderPayment = {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  checkoutUrl?: string | null;
  paidAt?: Date | null;
  metadata?: Record<string, string>;
};

export type RefundResult = {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
};

/**
 * Pause outcome. Mollie has no native pause — adapters cancel the remote
 * subscription and set `localNote: 'PAUSED'` so callers persist PAUSED locally.
 */
export type PauseResult = {
  providerSubscriptionId?: string | null;
  providerStatus?: string | null;
  localNote?: 'PAUSED';
};

export type ResumeResult = {
  providerSubscriptionId: string;
  providerStatus?: string | null;
};

export type PortalResult = {
  url: string;
};

export type AutomaticCheckoutInput = {
  shopId: string;
  email: string;
  name?: string | null;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  amountMinor: number;
  currency: string;
  description: string;
  /** Stripe Price id when catalog map is configured; otherwise price_data. */
  priceId?: string | null;
  metadata: Record<string, string>;
  trialDays?: number;
  interval?: 'month';
};

export type ManualCheckoutInput = {
  shopId: string;
  email: string;
  name?: string | null;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  amountMinor: number;
  currency: string;
  description: string;
  metadata: Record<string, string>;
};

export type UpdateSubscriptionInput = {
  subscriptionId: string;
  customerId?: string;
  priceId?: string | null;
  amountMinor?: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, string>;
  /** Mollie mandate required when recreating / updating recurring. */
  mandateId?: string | null;
};

export type ChangePaymentMethodInput = {
  customerId: string;
  returnUrl: string;
  subscriptionId?: string;
};

export type CustomerManagementSessionInput = {
  customerId: string;
  returnUrl: string;
};

export type RefundPaymentInput = {
  paymentId: string;
  amountMinor?: number;
  reason?: string;
};
