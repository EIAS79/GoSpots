import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createHash } from 'crypto';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeTerminalConnector } from './connectors/stripe-terminal.connector';
import { PaymentDomainService } from './payment-domain.service';

function webhookState(
  event: Stripe.Event,
): 'CAPTURED' | 'AUTHORIZED' | 'FAILED' | 'CANCELED' | null {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return 'CAPTURED';
    case 'payment_intent.amount_capturable_updated':
      return 'AUTHORIZED';
    case 'payment_intent.payment_failed':
      return 'FAILED';
    case 'payment_intent.canceled':
      return 'CANCELED';
    default:
      return null;
  }
}

@ApiTags('payments')
@Controller('payments/webhooks/stripe-terminal')
export class StripeTerminalWebhookController {
  constructor(
    private readonly connector: StripeTerminalConnector,
    private readonly prisma: PrismaService,
    private readonly payments: PaymentDomainService,
  ) {}

  @Post()
  async ingest(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!request.rawBody?.length) {
      throw new BadRequestException('Raw Stripe webhook body is required');
    }
    if (!signature) {
      throw new BadRequestException('Stripe-Signature header is required');
    }

    let event: Stripe.Event;
    try {
      event = this.connector.constructWebhookEvent(request.rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    const state = webhookState(event);
    if (
      !state ||
      !event.data?.object ||
      typeof event.data.object !== 'object'
    ) {
      return { received: true, applied: false };
    }
    const providerPaymentId =
      'id' in event.data.object && typeof event.data.object.id === 'string'
        ? event.data.object.id
        : null;
    if (!providerPaymentId) return { received: true, applied: false };

    const operation = await this.prisma.paymentOperation.findFirst({
      where: { provider: 'stripe', providerPaymentId },
      select: { id: true, shopId: true },
    });
    // A valid webhook may belong to Stripe billing or another integration. Do not
    // create cross-domain state for PaymentIntents GoSpots Terminal doesn't own.
    if (!operation) return { received: true, applied: false };

    const result = await this.payments.ingestNormalizedWebhook({
      shopId: operation.shopId,
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      payloadHash: createHash('sha256').update(request.rawBody).digest('hex'),
      paymentOperationId: operation.id,
      state,
    });
    return { received: true, applied: true, duplicate: result.duplicate };
  }
}
