import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentConnectorRegistry } from './payment-connector.registry';
import type {
  ConnectorHealth,
  ConnectorPaymentLookup,
  ConnectorPaymentResult,
  ConnectorRefundRequest,
  ConnectorRefundResult,
  CreateConnectorPaymentRequest,
  PaymentConnector,
  PaymentConnectorCapabilities,
} from './payment-connector';

type StripePaymentIntentLike = {
  id: string;
  status: string;
  amount_received?: number;
  amount_capturable?: number;
  last_payment_error?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

type StripeReaderLike = {
  id: string;
  status?: string | null;
  action?: {
    status?: string | null;
    failure_code?: string | null;
    failure_message?: string | null;
  } | null;
};

type StripeRefundLike = { id: string; status?: string | null };

type StripeTerminalApi = {
  paymentIntents: {
    create(
      params: Record<string, unknown>,
      options?: { idempotencyKey?: string },
    ): Promise<StripePaymentIntentLike>;
    retrieve(id: string): Promise<StripePaymentIntentLike>;
    cancel(id: string): Promise<StripePaymentIntentLike>;
  };
  terminal: {
    readers: {
      processPaymentIntent(
        readerId: string,
        params: {
          payment_intent: string;
          process_config?: Record<string, unknown>;
        },
        options?: { idempotencyKey?: string },
      ): Promise<StripeReaderLike>;
      cancelAction(readerId: string): Promise<StripeReaderLike>;
    };
    locations: { list(params: { limit: number }): Promise<unknown> };
  };
  refunds: {
    create(
      params: Record<string, unknown>,
      options?: { idempotencyKey?: string },
    ): Promise<StripeRefundLike>;
  };
  webhooks: {
    constructEvent(
      payload: Buffer,
      signature: string,
      secret: string,
    ): Stripe.Event;
  };
};

function plnMinorUnits(amount: string): number {
  const normalized = amount.trim();
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(normalized);
  if (!match) {
    throw new Error('Stripe Terminal amount must be a positive decimal');
  }
  const whole = BigInt(match[1]);
  const fraction4 = (match[2] ?? '').padEnd(4, '0');
  if (fraction4.slice(2) !== '00') {
    throw new Error('PLN terminal payments support at most 2 decimal places');
  }
  const minor = whole * 100n + BigInt(fraction4.slice(0, 2) || '0');
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Stripe Terminal amount is outside the supported range');
  }
  return Number(minor);
}

function paymentState(
  intent: StripePaymentIntentLike,
): ConnectorPaymentResult['state'] {
  switch (intent.status) {
    case 'succeeded':
      return 'CAPTURED';
    case 'requires_capture':
      return 'AUTHORIZED';
    case 'requires_action':
      return 'REQUIRES_ACTION';
    case 'processing':
      return 'PROCESSING';
    case 'canceled':
      return 'CANCELED';
    case 'requires_payment_method':
      return intent.last_payment_error ? 'FAILED' : 'PROCESSING';
    default:
      return 'UNKNOWN';
  }
}

function errorSummary(error: unknown): {
  code: string;
  message: string;
  uncertain: boolean;
} {
  if (!error || typeof error !== 'object') {
    return {
      code: 'STRIPE_TERMINAL_ERROR',
      message: 'Stripe Terminal request failed',
      uncertain: false,
    };
  }
  const value = error as {
    code?: unknown;
    type?: unknown;
    message?: unknown;
    statusCode?: unknown;
  };
  const code =
    typeof value.code === 'string' ? value.code : 'STRIPE_TERMINAL_ERROR';
  const message =
    typeof value.message === 'string'
      ? value.message
      : 'Stripe Terminal request failed';
  const status = typeof value.statusCode === 'number' ? value.statusCode : null;
  const uncertain =
    (status !== null && status >= 500) ||
    value.type === 'StripeConnectionError' ||
    value.type === 'StripeAPIError';
  return { code, message, uncertain };
}

@Injectable()
export class StripeTerminalConnector implements PaymentConnector, OnModuleInit {
  readonly provider = 'stripe';
  private client: Stripe | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: PaymentConnectorRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  capabilities(): PaymentConnectorCapabilities {
    return {
      payments: true,
      cancel: true,
      refunds: true,
      terminal: true,
      requiresAction: true,
    };
  }

  private enabled(): boolean {
    return (
      this.config
        .get<string>('STRIPE_TERMINAL_ENABLED')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  private stripe(): StripeTerminalApi {
    if (!this.enabled()) {
      throw new Error(
        'Stripe Terminal is disabled by STRIPE_TERMINAL_ENABLED',
      );
    }
    const key = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    if (!key) {
      throw new Error(
        'Stripe Terminal is not configured: STRIPE_SECRET_KEY is missing',
      );
    }
    if (!this.client) this.client = new Stripe(key, { typescript: true });
    return this.client as unknown as StripeTerminalApi;
  }

  async createPayment(
    request: CreateConnectorPaymentRequest,
  ): Promise<ConnectorPaymentResult> {
    if (!request.terminalExternalId) {
      return {
        providerPaymentId: `stripe-unassigned:${request.operationId}`,
        state: 'FAILED',
        errorCode: 'TERMINAL_NOT_ASSIGNED',
        errorMessage: 'Stripe Terminal reader is not assigned',
      };
    }
    if (request.currency.toUpperCase() !== 'PLN') {
      return {
        providerPaymentId: `stripe-currency:${request.operationId}`,
        state: 'FAILED',
        errorCode: 'UNSUPPORTED_TERMINAL_CURRENCY',
        errorMessage: 'The Poland Stripe Terminal connector accepts PLN only',
      };
    }

    let amountMinor: number;
    try {
      amountMinor = plnMinorUnits(request.amount);
    } catch (error) {
      return {
        providerPaymentId: `stripe-validation:${request.operationId}`,
        state: 'FAILED',
        errorCode: 'INVALID_TERMINAL_AMOUNT',
        errorMessage:
          error instanceof Error ? error.message : 'Invalid terminal amount',
      };
    }

    const stripe = this.stripe();
    let intent: StripePaymentIntentLike;
    try {
      intent = await stripe.paymentIntents.create(
        {
          amount: amountMinor,
          currency: 'pln',
          payment_method_types: ['card_present'],
          capture_method: 'automatic',
          metadata: {
            gospots_operation_id: request.operationId,
            ...(request.metadata ?? {}),
          },
        },
        { idempotencyKey: `gospots:terminal:pi:${request.idempotencyKey}` },
      );
    } catch (error) {
      const summary = errorSummary(error);
      return {
        providerPaymentId: `stripe-create-failed:${request.operationId}`,
        state: summary.uncertain ? 'UNKNOWN' : 'FAILED',
        errorCode: summary.code,
        errorMessage: summary.message,
      };
    }

    try {
      const reader = await stripe.terminal.readers.processPaymentIntent(
        request.terminalExternalId,
        {
          payment_intent: intent.id,
          process_config: { enable_customer_cancellation: true },
        },
        { idempotencyKey: `gospots:terminal:reader:${request.idempotencyKey}` },
      );
      if (reader.action?.status === 'failed') {
        return {
          providerPaymentId: intent.id,
          state: 'FAILED',
          providerPayload: {
            readerId: reader.id,
            readerStatus: reader.status,
            actionStatus: reader.action.status,
          },
          errorCode: reader.action.failure_code ?? 'READER_ACTION_FAILED',
          errorMessage:
            reader.action.failure_message ?? 'Stripe reader action failed',
        };
      }
      return {
        providerPaymentId: intent.id,
        state: 'PROCESSING',
        providerPayload: {
          readerId: reader.id,
          readerStatus: reader.status,
          actionStatus: reader.action?.status ?? null,
        },
      };
    } catch (error) {
      const summary = errorSummary(error);
      // The PaymentIntent exists. Never create another payment after an uncertain
      // reader handoff; persist UNKNOWN and reconcile this exact PaymentIntent.
      return {
        providerPaymentId: intent.id,
        state: summary.uncertain ? 'UNKNOWN' : 'FAILED',
        errorCode: summary.code,
        errorMessage: summary.message,
      };
    }
  }

  async getPayment(
    request: ConnectorPaymentLookup,
  ): Promise<ConnectorPaymentResult> {
    try {
      const intent = await this.stripe().paymentIntents.retrieve(
        request.providerPaymentId,
      );
      return {
        providerPaymentId: intent.id,
        state: paymentState(intent),
        providerPayload: {
          status: intent.status,
          amountReceived: intent.amount_received ?? 0,
          amountCapturable: intent.amount_capturable ?? 0,
        },
        errorCode: intent.last_payment_error?.code ?? null,
        errorMessage: intent.last_payment_error?.message ?? null,
      };
    } catch (error) {
      const summary = errorSummary(error);
      return {
        providerPaymentId: request.providerPaymentId,
        state: summary.uncertain ? 'UNKNOWN' : 'FAILED',
        errorCode: summary.code,
        errorMessage: summary.message,
      };
    }
  }

  async cancelPayment(
    request: ConnectorPaymentLookup,
  ): Promise<ConnectorPaymentResult> {
    const stripe = this.stripe();
    try {
      if (request.terminalExternalId) {
        try {
          await stripe.terminal.readers.cancelAction(
            request.terminalExternalId,
          );
        } catch {
          // Reader action may already be complete; PaymentIntent cancellation
          // below is the authoritative provider result.
        }
      }
      const intent = await stripe.paymentIntents.cancel(
        request.providerPaymentId,
      );
      return {
        providerPaymentId: intent.id,
        state: paymentState(intent),
        providerPayload: { status: intent.status },
      };
    } catch (error) {
      const summary = errorSummary(error);
      return {
        providerPaymentId: request.providerPaymentId,
        state: summary.uncertain ? 'UNKNOWN' : 'FAILED',
        errorCode: summary.code,
        errorMessage: summary.message,
      };
    }
  }

  async refundPayment(
    request: ConnectorRefundRequest,
  ): Promise<ConnectorRefundResult> {
    if (request.currency.toUpperCase() !== 'PLN') {
      return {
        providerRefundId: `stripe-refund-validation:${request.refundId}`,
        state: 'FAILED',
        errorCode: 'UNSUPPORTED_TERMINAL_CURRENCY',
        errorMessage: 'The Poland Stripe Terminal connector refunds PLN only',
      };
    }

    let amountMinor: number;
    try {
      amountMinor = plnMinorUnits(request.amount);
    } catch (error) {
      return {
        providerRefundId: `stripe-refund-validation:${request.refundId}`,
        state: 'FAILED',
        errorCode: 'INVALID_TERMINAL_AMOUNT',
        errorMessage:
          error instanceof Error ? error.message : 'Invalid refund amount',
      };
    }

    try {
      const refund = await this.stripe().refunds.create(
        {
          payment_intent: request.paymentProviderId,
          amount: amountMinor,
          metadata: { gospots_refund_id: request.refundId },
        },
        { idempotencyKey: `gospots:terminal:refund:${request.idempotencyKey}` },
      );
      return {
        providerRefundId: refund.id,
        state:
          refund.status === 'failed' || refund.status === 'canceled'
            ? 'FAILED'
            : 'SUCCEEDED',
        providerPayload: { status: refund.status ?? null },
      };
    } catch (error) {
      const summary = errorSummary(error);
      return {
        providerRefundId: `stripe-refund-unknown:${request.refundId}`,
        state: summary.uncertain ? 'UNKNOWN' : 'FAILED',
        errorCode: summary.code,
        errorMessage: summary.message,
      };
    }
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    const secret = this.config
      .get<string>('STRIPE_TERMINAL_WEBHOOK_SECRET')
      ?.trim();
    if (!secret) throw new Error('STRIPE_TERMINAL_WEBHOOK_SECRET is missing');
    return this.stripe().webhooks.constructEvent(payload, signature, secret);
  }

  async health(): Promise<ConnectorHealth> {
    try {
      await this.stripe().terminal.locations.list({ limit: 1 });
      return { ok: true, message: 'Stripe Terminal API reachable' };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Stripe Terminal unavailable',
      };
    }
  }
}
