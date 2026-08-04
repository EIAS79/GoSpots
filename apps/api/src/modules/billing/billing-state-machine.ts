import { SubscriptionStatus } from '@prisma/client';
import type {
  CanonicalPaymentState,
  CanonicalSubscriptionState,
} from './billing.types';

export class InvalidBillingTransitionError extends Error {
  constructor(
    readonly kind: 'subscription' | 'payment',
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${kind} transition: ${from} → ${to}`);
    this.name = 'InvalidBillingTransitionError';
  }
}

const S = {
  DRAFT: 'DRAFT',
  CHECKOUT_PENDING: 'CHECKOUT_PENDING',
  INCOMPLETE: 'INCOMPLETE',
  REQUIRES_ACTION: 'REQUIRES_ACTION',
  PROCESSING: 'PROCESSING',
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  UNPAID: 'UNPAID',
  PAUSE_PENDING: 'PAUSE_PENDING',
  PAUSED: 'PAUSED',
  RESUME_PENDING: 'RESUME_PENDING',
  CANCEL_AT_PERIOD_END: 'CANCEL_AT_PERIOD_END',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
  INCOMPLETE_EXPIRED: 'INCOMPLETE_EXPIRED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
} as const satisfies Record<CanonicalSubscriptionState, CanonicalSubscriptionState>;

const P = {
  CREATED: 'CREATED',
  OPEN: 'OPEN',
  REQUIRES_ACTION: 'REQUIRES_ACTION',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
  REFUND_PENDING: 'REFUND_PENDING',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
  CHARGEBACK: 'CHARGEBACK',
  UNKNOWN: 'UNKNOWN',
} as const satisfies Record<CanonicalPaymentState, CanonicalPaymentState>;

/** Allowed next statuses keyed by current subscription status. */
export const SUBSCRIPTION_TRANSITIONS: Readonly<
  Record<CanonicalSubscriptionState, ReadonlySet<CanonicalSubscriptionState>>
> = {
  [S.DRAFT]: new Set([S.CHECKOUT_PENDING, S.CANCELED, S.PROVIDER_ERROR]),
  [S.CHECKOUT_PENDING]: new Set([
    S.INCOMPLETE,
    S.REQUIRES_ACTION,
    S.PROCESSING,
    S.TRIALING,
    S.ACTIVE,
    S.CANCELED,
    S.EXPIRED,
    S.INCOMPLETE_EXPIRED,
    S.PROVIDER_ERROR,
  ]),
  [S.INCOMPLETE]: new Set([
    S.REQUIRES_ACTION,
    S.PROCESSING,
    S.TRIALING,
    S.ACTIVE,
    S.CANCELED,
    S.INCOMPLETE_EXPIRED,
    S.PROVIDER_ERROR,
  ]),
  [S.REQUIRES_ACTION]: new Set([
    S.PROCESSING,
    S.TRIALING,
    S.ACTIVE,
    S.PAST_DUE,
    S.CANCELED,
    S.INCOMPLETE_EXPIRED,
    S.PROVIDER_ERROR,
  ]),
  [S.PROCESSING]: new Set([
    S.TRIALING,
    S.ACTIVE,
    S.PAST_DUE,
    S.REQUIRES_ACTION,
    S.CANCELED,
    S.PROVIDER_ERROR,
  ]),
  [S.TRIALING]: new Set([
    S.ACTIVE,
    S.PAST_DUE,
    S.CANCEL_AT_PERIOD_END,
    S.PAUSE_PENDING,
    S.CANCELED,
    S.EXPIRED,
    S.PROVIDER_ERROR,
  ]),
  [S.ACTIVE]: new Set([
    S.PAST_DUE,
    S.UNPAID,
    S.CANCEL_AT_PERIOD_END,
    S.PAUSE_PENDING,
    S.CANCELED,
    S.EXPIRED,
    S.PROVIDER_ERROR,
  ]),
  [S.PAST_DUE]: new Set([
    S.ACTIVE,
    S.UNPAID,
    S.CANCEL_AT_PERIOD_END,
    S.PAUSE_PENDING,
    S.CANCELED,
    S.EXPIRED,
    S.PROVIDER_ERROR,
  ]),
  [S.UNPAID]: new Set([
    S.ACTIVE,
    S.PAST_DUE,
    S.CANCELED,
    S.EXPIRED,
    S.PROVIDER_ERROR,
  ]),
  [S.PAUSE_PENDING]: new Set([
    S.PAUSED,
    S.ACTIVE,
    S.CANCELED,
    S.PROVIDER_ERROR,
  ]),
  [S.PAUSED]: new Set([
    S.RESUME_PENDING,
    S.ACTIVE,
    S.CANCELED,
    S.EXPIRED,
    S.PROVIDER_ERROR,
  ]),
  [S.RESUME_PENDING]: new Set([
    S.ACTIVE,
    S.PAUSED,
    S.CANCELED,
    S.PROVIDER_ERROR,
  ]),
  [S.CANCEL_AT_PERIOD_END]: new Set([
    S.ACTIVE,
    S.CANCELED,
    S.EXPIRED,
    S.PAST_DUE,
    S.PROVIDER_ERROR,
  ]),
  [S.CANCELED]: new Set([S.CHECKOUT_PENDING, S.PROVIDER_ERROR]),
  [S.EXPIRED]: new Set([S.CHECKOUT_PENDING, S.PROVIDER_ERROR]),
  [S.INCOMPLETE_EXPIRED]: new Set([S.CHECKOUT_PENDING, S.PROVIDER_ERROR]),
  [S.PROVIDER_ERROR]: new Set([
    S.DRAFT,
    S.CHECKOUT_PENDING,
    S.INCOMPLETE,
    S.REQUIRES_ACTION,
    S.PROCESSING,
    S.TRIALING,
    S.ACTIVE,
    S.PAST_DUE,
    S.UNPAID,
    S.PAUSE_PENDING,
    S.PAUSED,
    S.RESUME_PENDING,
    S.CANCEL_AT_PERIOD_END,
    S.CANCELED,
    S.EXPIRED,
    S.INCOMPLETE_EXPIRED,
  ]),
};

/** Allowed next statuses keyed by current payment status. */
export const PAYMENT_TRANSITIONS: Readonly<
  Record<CanonicalPaymentState, ReadonlySet<CanonicalPaymentState>>
> = {
  [P.CREATED]: new Set([
    P.OPEN,
    P.REQUIRES_ACTION,
    P.PENDING,
    P.PROCESSING,
    P.AUTHORIZED,
    P.PAID,
    P.FAILED,
    P.CANCELED,
    P.EXPIRED,
    P.UNKNOWN,
  ]),
  [P.OPEN]: new Set([
    P.REQUIRES_ACTION,
    P.PENDING,
    P.PROCESSING,
    P.AUTHORIZED,
    P.PAID,
    P.FAILED,
    P.CANCELED,
    P.EXPIRED,
    P.UNKNOWN,
  ]),
  [P.REQUIRES_ACTION]: new Set([
    P.PENDING,
    P.PROCESSING,
    P.AUTHORIZED,
    P.PAID,
    P.FAILED,
    P.CANCELED,
    P.EXPIRED,
    P.UNKNOWN,
  ]),
  [P.PENDING]: new Set([
    P.REQUIRES_ACTION,
    P.PROCESSING,
    P.AUTHORIZED,
    P.PAID,
    P.FAILED,
    P.CANCELED,
    P.EXPIRED,
    P.UNKNOWN,
  ]),
  [P.PROCESSING]: new Set([
    P.AUTHORIZED,
    P.PAID,
    P.FAILED,
    P.CANCELED,
    P.EXPIRED,
    P.UNKNOWN,
  ]),
  [P.AUTHORIZED]: new Set([
    P.PAID,
    P.FAILED,
    P.CANCELED,
    P.REFUND_PENDING,
    P.UNKNOWN,
  ]),
  [P.PAID]: new Set([
    P.REFUND_PENDING,
    P.PARTIALLY_REFUNDED,
    P.REFUNDED,
    P.DISPUTED,
    P.CHARGEBACK,
  ]),
  [P.FAILED]: new Set([P.OPEN, P.PENDING, P.REQUIRES_ACTION, P.UNKNOWN]),
  [P.CANCELED]: new Set([]),
  [P.EXPIRED]: new Set([P.OPEN, P.CREATED]),
  [P.REFUND_PENDING]: new Set([
    P.PARTIALLY_REFUNDED,
    P.REFUNDED,
    P.PAID,
    P.FAILED,
  ]),
  [P.PARTIALLY_REFUNDED]: new Set([
    P.REFUND_PENDING,
    P.REFUNDED,
    P.DISPUTED,
    P.CHARGEBACK,
  ]),
  [P.REFUNDED]: new Set([P.DISPUTED, P.CHARGEBACK]),
  [P.DISPUTED]: new Set([P.CHARGEBACK, P.PAID, P.REFUNDED]),
  [P.CHARGEBACK]: new Set([]),
  [P.UNKNOWN]: new Set([
    P.CREATED,
    P.OPEN,
    P.REQUIRES_ACTION,
    P.PENDING,
    P.PROCESSING,
    P.AUTHORIZED,
    P.PAID,
    P.FAILED,
    P.CANCELED,
    P.EXPIRED,
    P.REFUND_PENDING,
    P.PARTIALLY_REFUNDED,
    P.REFUNDED,
    P.DISPUTED,
    P.CHARGEBACK,
  ]),
};

export function assertSubscriptionTransition(
  from: CanonicalSubscriptionState,
  to: CanonicalSubscriptionState,
): void {
  if (from === to) return;
  const allowed = SUBSCRIPTION_TRANSITIONS[from];
  if (!allowed?.has(to)) {
    throw new InvalidBillingTransitionError('subscription', from, to);
  }
}

export function assertPaymentTransition(
  from: CanonicalPaymentState,
  to: CanonicalPaymentState,
): void {
  if (from === to) return;
  const allowed = PAYMENT_TRANSITIONS[from];
  if (!allowed?.has(to)) {
    throw new InvalidBillingTransitionError('payment', from, to);
  }
}

/**
 * Map canonical billing subscription status → entitlement `Subscription.status`.
 *
 * - TRIALING / ACTIVE / CANCEL_AT_PERIOD_END / RESUME_PENDING → ACTIVE
 * - PAST_DUE → PAST_DUE
 * - PAUSED / PAUSE_PENDING → PAUSED
 * - CANCELED / EXPIRED / UNPAID / INCOMPLETE_EXPIRED → CANCELED
 * - Pre-paid / draft / processing / error → TRIAL (legacy entitlement until paid)
 */
export function canonicalToEntitlementStatus(
  canonical: CanonicalSubscriptionState,
): SubscriptionStatus {
  switch (canonical) {
    case 'TRIALING':
    case 'ACTIVE':
    case 'CANCEL_AT_PERIOD_END':
    case 'RESUME_PENDING':
      return SubscriptionStatus.ACTIVE;
    case 'PAST_DUE':
      return SubscriptionStatus.PAST_DUE;
    case 'PAUSED':
    case 'PAUSE_PENDING':
      return SubscriptionStatus.PAUSED;
    case 'CANCELED':
    case 'EXPIRED':
    case 'UNPAID':
    case 'INCOMPLETE_EXPIRED':
      return SubscriptionStatus.CANCELED;
    case 'DRAFT':
    case 'CHECKOUT_PENDING':
    case 'INCOMPLETE':
    case 'REQUIRES_ACTION':
    case 'PROCESSING':
    case 'PROVIDER_ERROR':
      return SubscriptionStatus.TRIAL;
    default: {
      const _exhaustive: never = canonical;
      return _exhaustive;
    }
  }
}

/** Whether a transition is allowed (does not throw). */
export function canTransitionSubscription(
  from: CanonicalSubscriptionState,
  to: CanonicalSubscriptionState,
): boolean {
  if (from === to) return true;
  return SUBSCRIPTION_TRANSITIONS[from]?.has(to) ?? false;
}

export function canTransitionPayment(
  from: CanonicalPaymentState,
  to: CanonicalPaymentState,
): boolean {
  if (from === to) return true;
  return PAYMENT_TRANSITIONS[from]?.has(to) ?? false;
}
