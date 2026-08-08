import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { BillingProviderAdapter } from '../billing-provider.adapter';
import type {
  AutomaticCheckoutInput,
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
} from '../billing.types';

function unixToDate(sec: number | null | undefined): Date | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  return new Date(sec * 1000);
}

function metaStrings(
  meta: Stripe.Metadata | null | undefined,
): Record<string, string> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

@Injectable()
export class StripeBillingAdapter implements BillingProviderAdapter {
  readonly provider = 'STRIPE' as const;
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  private getStripe(): Stripe {
    const key = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }
    if (!this.client) {
      const configuredApiVersion = this.config
        .get<string>('STRIPE_API_VERSION')
        ?.trim();
      this.client = new Stripe(key, {
        ...(configuredApiVersion
          ? { apiVersion: configuredApiVersion as Stripe.LatestApiVersion }
          : {}),
        typescript: true,
      });
    }
    return this.client;
  }

  async createAutomaticSubscriptionCheckout(
    input: AutomaticCheckoutInput,
  ): Promise<CheckoutResult> {
    const stripe = this.getStripe();
    const customerId = await this.ensureCustomer(stripe, input);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = input.priceId
      ? [{ price: input.priceId, quantity: 1 }]
      : [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: Math.max(0, Math.round(input.amountMinor)),
              recurring: { interval: input.interval ?? 'month' },
              product_data: { name: input.description },
            },
          },
        ];

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: lineItems,
      client_reference_id: input.shopId,
      metadata: input.metadata,
      subscription_data: {
        metadata: input.metadata,
        ...(input.trialDays && input.trialDays > 0
          ? { trial_period_days: input.trialDays }
          : {}),
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'Stripe Checkout Session did not return a URL.',
      );
    }

    return {
      url: session.url,
      mode: 'checkout',
      providerCheckoutId: session.id,
      providerCustomerId: customerId,
      providerSubscriptionId:
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null,
    };
  }

  async createManualPaymentCheckout(
    input: ManualCheckoutInput,
  ): Promise<CheckoutResult> {
    const stripe = this.getStripe();
    const customerId = await this.ensureCustomer(stripe, input);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.shopId,
      metadata: input.metadata,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: Math.max(0, Math.round(input.amountMinor)),
            product_data: { name: input.description },
          },
        },
      ],
      payment_intent_data: {
        metadata: input.metadata,
        setup_future_usage: undefined,
      },
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'Stripe Checkout Session did not return a URL.',
      );
    }

    return {
      url: session.url,
      mode: 'checkout',
      providerCheckoutId: session.id,
      providerCustomerId: customerId,
      providerPaymentId:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
    };
  }

  async retrieveCustomer(customerId: string): Promise<ProviderCustomer> {
    const customer = await this.getStripe().customers.retrieve(customerId);
    if (customer.deleted) {
      throw new ServiceUnavailableException(
        `Stripe customer ${customerId} has been deleted.`,
      );
    }
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      metadata: metaStrings(customer.metadata),
    };
  }

  async retrieveSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription> {
    const sub = await this.getStripe().subscriptions.retrieve(subscriptionId);
    return this.mapStripeSubscription(sub);
  }

  async retrievePayment(paymentId: string): Promise<ProviderPayment> {
    const stripe = this.getStripe();
    if (paymentId.startsWith('pi_')) {
      const pi = await stripe.paymentIntents.retrieve(paymentId);
      return {
        id: pi.id,
        status: pi.status,
        amountMinor: pi.amount,
        currency: pi.currency.toUpperCase(),
        customerId:
          typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null,
        paidAt: pi.status === 'succeeded' ? unixToDate(pi.created) : null,
        metadata: metaStrings(pi.metadata),
      };
    }
    const charge = await stripe.charges.retrieve(paymentId);
    return {
      id: charge.id,
      status: charge.status,
      amountMinor: charge.amount,
      currency: charge.currency.toUpperCase(),
      customerId:
        typeof charge.customer === 'string'
          ? charge.customer
          : charge.customer?.id ?? null,
      paidAt: charge.paid ? unixToDate(charge.created) : null,
      metadata: metaStrings(charge.metadata),
    };
  }

  async cancelImmediately(
    subscriptionId: string,
  ): Promise<ProviderSubscription> {
    const sub = await this.getStripe().subscriptions.cancel(subscriptionId);
    return this.mapStripeSubscription(sub);
  }

  async cancelAtPeriodEnd(
    subscriptionId: string,
  ): Promise<ProviderSubscription> {
    const sub = await this.getStripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    return this.mapStripeSubscription(sub);
  }

  async pause(subscriptionId: string): Promise<PauseResult> {
    const sub = await this.getStripe().subscriptions.update(subscriptionId, {
      pause_collection: { behavior: 'mark_uncollectible' },
    });
    return {
      providerSubscriptionId: sub.id,
      providerStatus: sub.status,
    };
  }

  async resume(input: {
    subscriptionId?: string | null;
    customerId: string;
  }): Promise<ResumeResult> {
    if (!input.subscriptionId) {
      throw new ServiceUnavailableException(
        'Stripe resume requires an existing subscription id.',
      );
    }
    const sub = await this.getStripe().subscriptions.update(
      input.subscriptionId,
      {
        pause_collection: '',
        cancel_at_period_end: false,
      },
    );
    return {
      providerSubscriptionId: sub.id,
      providerStatus: sub.status,
    };
  }

  async updateSubscription(
    input: UpdateSubscriptionInput,
  ): Promise<ProviderSubscription> {
    const stripe = this.getStripe();
    const existing = await stripe.subscriptions.retrieve(input.subscriptionId);
    const itemId = existing.items.data[0]?.id;
    if (!itemId) {
      throw new ServiceUnavailableException(
        'Stripe subscription has no items to update.',
      );
    }

    const items: Stripe.SubscriptionUpdateParams.Item[] = input.priceId
      ? [{ id: itemId, price: input.priceId }]
      : input.amountMinor != null && input.currency
        ? [
            {
              id: itemId,
              price_data: {
                currency: input.currency.toLowerCase(),
                unit_amount: Math.max(0, Math.round(input.amountMinor)),
                recurring: { interval: 'month' },
                product:
                  typeof existing.items.data[0]?.price.product === 'string'
                    ? existing.items.data[0].price.product
                    : existing.items.data[0]?.price.product?.id,
              },
            },
          ]
        : [{ id: itemId }];

    const sub = await stripe.subscriptions.update(input.subscriptionId, {
      items,
      metadata: input.metadata,
      proration_behavior: 'create_prorations',
    });
    return this.mapStripeSubscription(sub);
  }

  async changePaymentMethod(
    input: ChangePaymentMethodInput,
  ): Promise<PortalResult> {
    return this.createCustomerManagementSession({
      customerId: input.customerId,
      returnUrl: input.returnUrl,
    });
  }

  async createCustomerManagementSession(
    input: CustomerManagementSessionInput,
  ): Promise<PortalResult> {
    const session = await this.getStripe().billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const stripe = this.getStripe();
    const params: Stripe.RefundCreateParams = input.paymentId.startsWith('pi_')
      ? { payment_intent: input.paymentId }
      : { charge: input.paymentId };
    if (input.amountMinor != null) {
      params.amount = Math.max(0, Math.round(input.amountMinor));
    }
    if (input.reason) {
      params.reason = 'requested_by_customer';
      params.metadata = { reason: input.reason };
    }
    const refund = await stripe.refunds.create(params);
    return {
      id: refund.id,
      status: refund.status ?? 'pending',
      amountMinor: refund.amount,
      currency: refund.currency.toUpperCase(),
    };
  }

  mapSubscriptionState(providerStatus: string): CanonicalSubscriptionState {
    switch (providerStatus.toLowerCase()) {
      case 'trialing':
        return 'TRIALING';
      case 'active':
        return 'ACTIVE';
      case 'past_due':
        return 'PAST_DUE';
      case 'unpaid':
        return 'UNPAID';
      case 'canceled':
      case 'cancelled':
        return 'CANCELED';
      case 'incomplete':
        return 'INCOMPLETE';
      case 'incomplete_expired':
        return 'INCOMPLETE_EXPIRED';
      case 'paused':
        return 'PAUSED';
      default:
        return 'PROVIDER_ERROR';
    }
  }

  mapPaymentState(providerStatus: string): CanonicalPaymentState {
    switch (providerStatus.toLowerCase()) {
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return 'REQUIRES_ACTION';
      case 'processing':
        return 'PROCESSING';
      case 'requires_capture':
        return 'AUTHORIZED';
      case 'succeeded':
      case 'paid':
        return 'PAID';
      case 'canceled':
      case 'cancelled':
        return 'CANCELED';
      case 'failed':
        return 'FAILED';
      case 'pending':
        return 'PENDING';
      case 'open':
        return 'OPEN';
      default:
        return 'UNKNOWN';
    }
  }

  /** Verify Stripe webhook signature and parse the event (throws on failure). */
  constructWebhookEvent(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): Stripe.Event {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET is not configured.',
      );
    }
    if (!signature) {
      throw new UnauthorizedException('Missing Stripe-Signature header.');
    }
    const payload =
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    return this.getStripe().webhooks.constructEvent(payload, signature, secret);
  }

  /** Re-fetch a previously verified event by id (processor path). */
  async retrieveWebhookEvent(eventId: string): Promise<Stripe.Event> {
    return this.getStripe().events.retrieve(eventId);
  }

  private async ensureCustomer(
    stripe: Stripe,
    input: {
      customerId?: string | null;
      email: string;
      name?: string | null;
      shopId: string;
      metadata?: Record<string, string>;
    },
  ): Promise<string> {
    if (input.customerId) return input.customerId;
    const customer = await stripe.customers.create({
      email: input.email,
      name: input.name ?? undefined,
      metadata: {
        shop_id: input.shopId,
        ...(input.metadata ?? {}),
      },
    });
    return customer.id;
  }

  private mapStripeSubscription(
    sub: Stripe.Subscription,
  ): ProviderSubscription {
    const item = sub.items.data[0];
    const price = item?.price;
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

    // Stripe SDK typings vary by API version for period fields.
    const periodStart =
      (sub as { current_period_start?: number }).current_period_start ??
      item?.current_period_start;
    const periodEnd =
      (sub as { current_period_end?: number }).current_period_end ??
      item?.current_period_end;

    return {
      id: sub.id,
      customerId,
      status: sub.status,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      currentPeriodStart: unixToDate(periodStart),
      currentPeriodEnd: unixToDate(periodEnd),
      trialEndsAt: unixToDate(sub.trial_end),
      priceId: price?.id ?? null,
      amountMinor: price?.unit_amount ?? null,
      currency: price?.currency?.toUpperCase() ?? null,
      metadata: metaStrings(sub.metadata),
    };
  }
}
