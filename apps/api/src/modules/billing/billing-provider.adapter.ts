import type {
  AutomaticCheckoutInput,
  BillingProviderId,
  CanonicalPaymentState,
  CanonicalSubscriptionState,
  ChangePaymentMethodInput,
  CheckoutResult,
  CustomerManagementSessionInput,
  ManualCheckoutInput,
  PauseResult,
  PortalResult,
  ProviderCustomer,
  ProviderPayment,
  ProviderSubscription,
  RefundPaymentInput,
  RefundResult,
  ResumeResult,
  UpdateSubscriptionInput,
} from './billing.types';

/**
 * Provider adapter contract — Stripe Checkout / Customer Portal and Mollie
 * first-payment + subscription / one-off payment flows.
 */
export interface BillingProviderAdapter {
  readonly provider: BillingProviderId;

  createAutomaticSubscriptionCheckout(
    input: AutomaticCheckoutInput,
  ): Promise<CheckoutResult>;

  createManualPaymentCheckout(
    input: ManualCheckoutInput,
  ): Promise<CheckoutResult>;

  retrieveCustomer(customerId: string): Promise<ProviderCustomer>;

  retrieveSubscription(
    subscriptionId: string,
    customerId?: string,
  ): Promise<ProviderSubscription>;

  retrievePayment(paymentId: string): Promise<ProviderPayment>;

  cancelImmediately(
    subscriptionId: string,
    customerId?: string,
  ): Promise<ProviderSubscription>;

  cancelAtPeriodEnd(
    subscriptionId: string,
    customerId?: string,
  ): Promise<ProviderSubscription>;

  pause(
    subscriptionId: string,
    customerId?: string,
  ): Promise<PauseResult>;

  resume(input: {
    subscriptionId?: string | null;
    customerId: string;
    amountMinor: number;
    currency: string;
    description: string;
    interval?: 'month';
    mandateId?: string | null;
    metadata?: Record<string, string>;
    webhookUrl?: string;
  }): Promise<ResumeResult>;

  updateSubscription(
    input: UpdateSubscriptionInput,
  ): Promise<ProviderSubscription>;

  changePaymentMethod(
    input: ChangePaymentMethodInput,
  ): Promise<PortalResult>;

  /** Optional customer billing portal / management session. */
  createCustomerManagementSession?(
    input: CustomerManagementSessionInput,
  ): Promise<PortalResult>;

  refundPayment(input: RefundPaymentInput): Promise<RefundResult>;

  mapSubscriptionState(providerStatus: string): CanonicalSubscriptionState;

  mapPaymentState(providerStatus: string): CanonicalPaymentState;
}
