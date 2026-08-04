import { SubscriptionStatus } from '@prisma/client';
import {
  assertPaymentTransition,
  assertSubscriptionTransition,
  canTransitionPayment,
  canTransitionSubscription,
  canonicalToEntitlementStatus,
  InvalidBillingTransitionError,
  PAYMENT_TRANSITIONS,
  SUBSCRIPTION_TRANSITIONS,
} from './billing-state-machine';
import type {
  CanonicalPaymentState,
  CanonicalSubscriptionState,
} from './billing.types';

describe('billing-state-machine', () => {
  describe('assertSubscriptionTransition', () => {
    it('allows no-op same-state transitions', () => {
      expect(() => assertSubscriptionTransition('ACTIVE', 'ACTIVE')).not.toThrow();
    });

    it('allows checkout → active happy path', () => {
      expect(() =>
        assertSubscriptionTransition('DRAFT', 'CHECKOUT_PENDING'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('CHECKOUT_PENDING', 'PROCESSING'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('PROCESSING', 'ACTIVE'),
      ).not.toThrow();
    });

    it('allows pause / resume / cancel-at-period-end', () => {
      expect(() =>
        assertSubscriptionTransition('ACTIVE', 'PAUSE_PENDING'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('PAUSE_PENDING', 'PAUSED'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('PAUSED', 'RESUME_PENDING'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('RESUME_PENDING', 'ACTIVE'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('ACTIVE', 'CANCEL_AT_PERIOD_END'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('CANCEL_AT_PERIOD_END', 'CANCELED'),
      ).not.toThrow();
    });

    it('allows past_due → unpaid grace expiry path', () => {
      expect(() =>
        assertSubscriptionTransition('ACTIVE', 'PAST_DUE'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('PAST_DUE', 'UNPAID'),
      ).not.toThrow();
      expect(() =>
        assertSubscriptionTransition('UNPAID', 'ACTIVE'),
      ).not.toThrow();
    });

    it('rejects illegal jumps', () => {
      expect(() => assertSubscriptionTransition('DRAFT', 'ACTIVE')).toThrow(
        InvalidBillingTransitionError,
      );
      expect(() => assertSubscriptionTransition('CANCELED', 'ACTIVE')).toThrow(
        InvalidBillingTransitionError,
      );
      expect(canTransitionSubscription('EXPIRED', 'PAUSED')).toBe(false);
    });

    it('defines a transition set for every canonical subscription state', () => {
      const states = Object.keys(
        SUBSCRIPTION_TRANSITIONS,
      ) as CanonicalSubscriptionState[];
      expect(states.length).toBeGreaterThanOrEqual(17);
      for (const from of states) {
        expect(SUBSCRIPTION_TRANSITIONS[from]).toBeInstanceOf(Set);
      }
    });
  });

  describe('assertPaymentTransition', () => {
    it('allows created → paid', () => {
      expect(() => assertPaymentTransition('CREATED', 'OPEN')).not.toThrow();
      expect(() => assertPaymentTransition('OPEN', 'PROCESSING')).not.toThrow();
      expect(() => assertPaymentTransition('PROCESSING', 'PAID')).not.toThrow();
    });

    it('allows refund path from paid', () => {
      expect(() =>
        assertPaymentTransition('PAID', 'REFUND_PENDING'),
      ).not.toThrow();
      expect(() =>
        assertPaymentTransition('REFUND_PENDING', 'REFUNDED'),
      ).not.toThrow();
    });

    it('rejects paid → open and terminal → paid', () => {
      expect(() => assertPaymentTransition('PAID', 'OPEN')).toThrow(
        InvalidBillingTransitionError,
      );
      expect(() => assertPaymentTransition('CANCELED', 'PAID')).toThrow(
        InvalidBillingTransitionError,
      );
      expect(canTransitionPayment('CHARGEBACK', 'PAID')).toBe(false);
    });

    it('defines a transition set for every canonical payment state', () => {
      const states = Object.keys(PAYMENT_TRANSITIONS) as CanonicalPaymentState[];
      expect(states.length).toBeGreaterThanOrEqual(15);
      for (const from of states) {
        expect(PAYMENT_TRANSITIONS[from]).toBeInstanceOf(Set);
      }
    });
  });

  describe('canonicalToEntitlementStatus', () => {
    it('maps active-like states to ACTIVE', () => {
      expect(canonicalToEntitlementStatus('TRIALING')).toBe(
        SubscriptionStatus.ACTIVE,
      );
      expect(canonicalToEntitlementStatus('ACTIVE')).toBe(
        SubscriptionStatus.ACTIVE,
      );
      expect(canonicalToEntitlementStatus('CANCEL_AT_PERIOD_END')).toBe(
        SubscriptionStatus.ACTIVE,
      );
      expect(canonicalToEntitlementStatus('RESUME_PENDING')).toBe(
        SubscriptionStatus.ACTIVE,
      );
    });

    it('maps past_due / paused / canceled families', () => {
      expect(canonicalToEntitlementStatus('PAST_DUE')).toBe(
        SubscriptionStatus.PAST_DUE,
      );
      expect(canonicalToEntitlementStatus('PAUSED')).toBe(
        SubscriptionStatus.PAUSED,
      );
      expect(canonicalToEntitlementStatus('PAUSE_PENDING')).toBe(
        SubscriptionStatus.PAUSED,
      );
      expect(canonicalToEntitlementStatus('CANCELED')).toBe(
        SubscriptionStatus.CANCELED,
      );
      expect(canonicalToEntitlementStatus('EXPIRED')).toBe(
        SubscriptionStatus.CANCELED,
      );
      expect(canonicalToEntitlementStatus('UNPAID')).toBe(
        SubscriptionStatus.CANCELED,
      );
    });

    it('maps pre-paid / draft states to legacy TRIAL', () => {
      expect(canonicalToEntitlementStatus('DRAFT')).toBe(
        SubscriptionStatus.TRIAL,
      );
      expect(canonicalToEntitlementStatus('CHECKOUT_PENDING')).toBe(
        SubscriptionStatus.TRIAL,
      );
      expect(canonicalToEntitlementStatus('PROCESSING')).toBe(
        SubscriptionStatus.TRIAL,
      );
      expect(canonicalToEntitlementStatus('PROVIDER_ERROR')).toBe(
        SubscriptionStatus.TRIAL,
      );
    });
  });
});
