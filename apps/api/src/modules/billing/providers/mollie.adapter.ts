import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import createMollieClient, {
  SequenceType,
  type MollieClient,
  type Payment,
  type Subscription as MollieSubscription,
} from '@mollie/api-client';
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

function mollieAmount(amountMinor: number, currency: string): {
  currency: string;
  value: string;
} {
  const major = (Math.max(0, Math.round(amountMinor)) / 100).toFixed(2);
  return { currency: currency.toUpperCase(), value: major };
}

function parseMollieAmountMinor(amount: {
  value: string;
  currency: string;
}): number {
  const n = Number.parseFloat(amount.value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function checkoutUrlFromPayment(payment: Payment): string | null {
  const links = payment._links as {
    checkout?: { href?: string };
  };
  return links?.checkout?.href ?? null;
}

@Injectable()
export class MollieBillingAdapter implements BillingProviderAdapter {
  readonly provider = 'MOLLIE' as const;
  private client: MollieClient | null = null;

  constructor(private readonly config: ConfigService) {}

  private getMollie(): MollieClient {
    const apiKey = this.config.get<string>('MOLLIE_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Mollie is not configured. Set MOLLIE_API_KEY.',
      );
    }
    if (!this.client) {
      this.client = createMollieClient({ apiKey });
    }
    return this.client;
  }

  private webhookUrl(): string | undefined {
    const base =
      this.config.get<string>('API_PUBLIC_URL')?.trim() ||
      this.config.get<string>('API_URL')?.trim();
    if (!base) return undefined;
    return `${base.replace(/\/$/, '')}/billing/webhooks/mollie`;
  }

  /**
   * Automatic renewal: create/reuse Mollie customer, then a first payment
   * (`sequenceType=first`) that establishes a mandate. The subscription is
   * created after the mandate is valid (webhook / resume / follow-up).
   */
  async createAutomaticSubscriptionCheckout(
    input: AutomaticCheckoutInput,
  ): Promise<CheckoutResult> {
    const mollie = this.getMollie();
    const customerId = await this.ensureCustomer(mollie, input);

    const payment = await mollie.customerPayments.create({
      customerId,
      amount: mollieAmount(input.amountMinor, input.currency),
      description: input.description,
      redirectUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      webhookUrl: this.webhookUrl(),
      sequenceType: SequenceType.first,
      metadata: {
        ...input.metadata,
        shop_id: input.shopId,
        renewal_mode: 'AUTOMATIC_RENEWAL',
      },
    });

    const url = checkoutUrlFromPayment(payment);
    if (!url) {
      throw new ServiceUnavailableException(
        'Mollie first payment did not return a checkout URL.',
      );
    }

    return {
      url,
      mode: 'checkout',
      providerCheckoutId: payment.id,
      providerCustomerId: customerId,
      providerPaymentId: payment.id,
    };
  }

  /** Manual monthly: one-off payment (no mandate / subscription). */
  async createManualPaymentCheckout(
    input: ManualCheckoutInput,
  ): Promise<CheckoutResult> {
    const mollie = this.getMollie();
    const customerId = await this.ensureCustomer(mollie, input);

    const payment = await mollie.customerPayments.create({
      customerId,
      amount: mollieAmount(input.amountMinor, input.currency),
      description: input.description,
      redirectUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      webhookUrl: this.webhookUrl(),
      sequenceType: SequenceType.oneoff,
      metadata: {
        ...input.metadata,
        shop_id: input.shopId,
        renewal_mode: 'MANUAL_MONTHLY',
      },
    });

    const url = checkoutUrlFromPayment(payment);
    if (!url) {
      throw new ServiceUnavailableException(
        'Mollie payment did not return a checkout URL.',
      );
    }

    return {
      url,
      mode: 'checkout',
      providerCheckoutId: payment.id,
      providerCustomerId: customerId,
      providerPaymentId: payment.id,
    };
  }

  /**
   * After a successful first payment, create the recurring Mollie subscription
   * against a valid mandate.
   */
  async createSubscriptionAfterMandate(input: {
    customerId: string;
    amountMinor: number;
    currency: string;
    description: string;
    mandateId?: string | null;
    interval?: 'month';
    metadata?: Record<string, string>;
    webhookUrl?: string;
  }): Promise<ProviderSubscription> {
    const mollie = this.getMollie();
    const mandateId =
      input.mandateId ?? (await this.findValidMandateId(mollie, input.customerId));
    if (!mandateId) {
      throw new BadRequestException(
        'No valid Mollie mandate — complete a first payment before creating a subscription.',
      );
    }

    const sub = await mollie.customerSubscriptions.create({
      customerId: input.customerId,
      amount: mollieAmount(input.amountMinor, input.currency),
      interval: input.interval === 'month' || !input.interval ? '1 month' : '1 month',
      description: input.description,
      mandateId,
      webhookUrl: input.webhookUrl ?? this.webhookUrl(),
      metadata: input.metadata,
    });

    return this.mapMollieSubscription(sub, input.customerId);
  }

  async retrieveCustomer(customerId: string): Promise<ProviderCustomer> {
    const customer = await this.getMollie().customers.get(customerId);
    return {
      id: customer.id,
      email: customer.email ?? null,
      name: customer.name ?? null,
      metadata:
        customer.metadata && typeof customer.metadata === 'object'
          ? (customer.metadata as Record<string, string>)
          : undefined,
    };
  }

  async retrieveSubscription(
    subscriptionId: string,
    customerId?: string,
  ): Promise<ProviderSubscription> {
    if (!customerId) {
      throw new BadRequestException(
        'Mollie retrieveSubscription requires customerId.',
      );
    }
    const sub = await this.getMollie().customerSubscriptions.get(subscriptionId, {
      customerId,
    });
    return this.mapMollieSubscription(sub, customerId);
  }

  async retrievePayment(paymentId: string): Promise<ProviderPayment> {
    const payment = await this.getMollie().payments.get(paymentId);
    return this.mapMolliePayment(payment);
  }

  async cancelImmediately(
    subscriptionId: string,
    customerId?: string,
  ): Promise<ProviderSubscription> {
    if (!customerId) {
      throw new BadRequestException(
        'Mollie cancelImmediately requires customerId.',
      );
    }
    const sub = await this.getMollie().customerSubscriptions.cancel(
      subscriptionId,
      { customerId },
    );
    return this.mapMollieSubscription(sub, customerId);
  }

  async cancelAtPeriodEnd(
    subscriptionId: string,
    customerId?: string,
  ): Promise<ProviderSubscription> {
    // Mollie subscriptions cancel at the end of the current period when canceled.
    return this.cancelImmediately(subscriptionId, customerId);
  }

  /**
   * Mollie has no native pause — cancel the remote subscription and signal
   * callers to persist local canonical status PAUSED.
   */
  async pause(
    subscriptionId: string,
    customerId?: string,
  ): Promise<PauseResult> {
    if (!customerId) {
      throw new BadRequestException('Mollie pause requires customerId.');
    }
    const sub = await this.getMollie().customerSubscriptions.cancel(
      subscriptionId,
      { customerId },
    );
    return {
      providerSubscriptionId: sub.id,
      providerStatus: sub.status,
      localNote: 'PAUSED',
    };
  }

  /**
   * Recreate a Mollie subscription when a valid mandate still exists.
   */
  async resume(input: {
    subscriptionId?: string | null;
    customerId: string;
    amountMinor: number;
    currency: string;
    description: string;
    interval?: 'month';
    mandateId?: string | null;
    metadata?: Record<string, string>;
    webhookUrl?: string;
  }): Promise<ResumeResult> {
    const created = await this.createSubscriptionAfterMandate({
      customerId: input.customerId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      description: input.description,
      mandateId: input.mandateId,
      interval: input.interval,
      metadata: input.metadata,
      webhookUrl: input.webhookUrl,
    });
    return {
      providerSubscriptionId: created.id,
      providerStatus: created.status,
    };
  }

  async updateSubscription(
    input: UpdateSubscriptionInput,
  ): Promise<ProviderSubscription> {
    if (!input.customerId) {
      throw new BadRequestException(
        'Mollie updateSubscription requires customerId.',
      );
    }
    const mollie = this.getMollie();
    const patch: {
      customerId: string;
      amount?: { currency: string; value: string };
      description?: string;
      mandateId?: string;
      metadata?: Record<string, unknown>;
    } = { customerId: input.customerId };

    if (input.amountMinor != null && input.currency) {
      patch.amount = mollieAmount(input.amountMinor, input.currency);
    }
    if (input.description) patch.description = input.description;
    if (input.mandateId) patch.mandateId = input.mandateId;
    if (input.metadata) patch.metadata = input.metadata;

    const sub = await mollie.customerSubscriptions.update(
      input.subscriptionId,
      patch,
    );
    return this.mapMollieSubscription(sub, input.customerId);
  }

  async changePaymentMethod(
    input: ChangePaymentMethodInput,
  ): Promise<PortalResult> {
    // Mollie: collect a new first payment to refresh the mandate.
    const mollie = this.getMollie();
    const payment = await mollie.customerPayments.create({
      customerId: input.customerId,
      amount: mollieAmount(100, 'EUR'),
      description: 'Update payment method',
      redirectUrl: input.returnUrl,
      webhookUrl: this.webhookUrl(),
      sequenceType: SequenceType.first,
      metadata: {
        purpose: 'payment_method_update',
        subscription_id: input.subscriptionId ?? '',
      },
    });
    const url = checkoutUrlFromPayment(payment);
    if (!url) {
      throw new ServiceUnavailableException(
        'Mollie could not create a payment-method update checkout.',
      );
    }
    return { url };
  }

  async createCustomerManagementSession(
    input: CustomerManagementSessionInput,
  ): Promise<PortalResult> {
    return this.changePaymentMethod({
      customerId: input.customerId,
      returnUrl: input.returnUrl,
    });
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const mollie = this.getMollie();
    const payment = await mollie.payments.get(input.paymentId);
    const amount =
      input.amountMinor != null
        ? mollieAmount(input.amountMinor, payment.amount.currency)
        : payment.amount;
    const refund = await mollie.paymentRefunds.create({
      paymentId: input.paymentId,
      amount,
      description: input.reason,
    });
    return {
      id: refund.id,
      status: refund.status,
      amountMinor: parseMollieAmountMinor(refund.amount),
      currency: refund.amount.currency.toUpperCase(),
    };
  }

  mapSubscriptionState(providerStatus: string): CanonicalSubscriptionState {
    switch (providerStatus.toLowerCase()) {
      case 'pending':
        return 'PROCESSING';
      case 'active':
        return 'ACTIVE';
      case 'suspended':
        return 'PAST_DUE';
      case 'canceled':
      case 'cancelled':
        return 'CANCELED';
      case 'completed':
        return 'EXPIRED';
      default:
        return 'PROVIDER_ERROR';
    }
  }

  mapPaymentState(providerStatus: string): CanonicalPaymentState {
    switch (providerStatus.toLowerCase()) {
      case 'open':
        return 'OPEN';
      case 'pending':
        return 'PENDING';
      case 'authorized':
        return 'AUTHORIZED';
      case 'paid':
        return 'PAID';
      case 'canceled':
      case 'cancelled':
        return 'CANCELED';
      case 'expired':
        return 'EXPIRED';
      case 'failed':
        return 'FAILED';
      default:
        return 'UNKNOWN';
    }
  }

  private async ensureCustomer(
    mollie: MollieClient,
    input: {
      customerId?: string | null;
      email: string;
      name?: string | null;
      shopId: string;
      metadata?: Record<string, string>;
    },
  ): Promise<string> {
    if (input.customerId) return input.customerId;
    const customer = await mollie.customers.create({
      email: input.email,
      name: input.name ?? undefined,
      metadata: {
        shop_id: input.shopId,
        ...(input.metadata ?? {}),
      },
    });
    return customer.id;
  }

  private async findValidMandateId(
    mollie: MollieClient,
    customerId: string,
  ): Promise<string | null> {
    const page = await mollie.customerMandates.page({ customerId });
    const valid = page.find(
      (m) => String(m.status).toLowerCase() === 'valid',
    );
    return valid?.id ?? null;
  }

  private mapMollieSubscription(
    sub: MollieSubscription,
    customerId: string,
  ): ProviderSubscription {
    return {
      id: sub.id,
      customerId,
      status: sub.status,
      cancelAtPeriodEnd: false,
      currentPeriodStart: sub.startDate ? new Date(sub.startDate) : null,
      currentPeriodEnd: sub.nextPaymentDate
        ? new Date(sub.nextPaymentDate)
        : null,
      trialEndsAt: null,
      priceId: null,
      amountMinor: parseMollieAmountMinor(sub.amount),
      currency: sub.amount.currency.toUpperCase(),
      metadata:
        sub.metadata && typeof sub.metadata === 'object'
          ? (sub.metadata as Record<string, string>)
          : undefined,
    };
  }

  private mapMolliePayment(payment: Payment): ProviderPayment {
    return {
      id: payment.id,
      status: payment.status,
      amountMinor: parseMollieAmountMinor(payment.amount),
      currency: payment.amount.currency.toUpperCase(),
      customerId: payment.customerId ?? null,
      subscriptionId: payment.subscriptionId ?? null,
      checkoutUrl: checkoutUrlFromPayment(payment),
      paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
      metadata:
        payment.metadata && typeof payment.metadata === 'object'
          ? (payment.metadata as Record<string, string>)
          : undefined,
    };
  }
}
