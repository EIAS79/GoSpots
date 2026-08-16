import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, of } from 'rxjs';
import { GrowthPublicDepositService } from './growth-public-deposit.service';

type RawStripeRequest = Request & { rawBody?: Buffer };

/**
 * Reuse the production SaaS Stripe webhook endpoint for reservation deposits.
 *
 * Stripe is already configured to deliver Checkout and PaymentIntent events to
 * /billing/webhooks/stripe using STRIPE_WEBHOOK_SECRET. Reservation deposits use
 * the same Stripe account and secret, so this interceptor routes events carrying
 * reservation metadata into the reservation ledger before billing subscription
 * processing sees them. Non-reservation events continue unchanged.
 */
@Injectable()
export class ReservationStripeWebhookRoutingInterceptor
  implements NestInterceptor
{
  constructor(private readonly deposits: GrowthPublicDepositService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<RawStripeRequest>();
    if (!this.isSharedStripeWebhook(request)) return next.handle();

    const signatureHeader = request.headers['stripe-signature'];
    const signature = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;
    if (!signature) return next.handle();

    const raw =
      request.rawBody ??
      Buffer.from(
        typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body ?? {}),
      );

    // This verifies the existing shared Stripe signature before we inspect the
    // payload. Invalid signatures fail closed and never reach billing handling.
    const result = await this.deposits.handleStripeWebhook(raw, signature);
    if (!result.ignored) return of(result);

    // Checkout completion/expiry is handled directly by the deposit service.
    // Ancillary Stripe events (for example PaymentIntent/Charge events) still
    // belong to the reservation flow when metadata says so; consume them here
    // so the SaaS subscription processor does not misclassify/dead-letter them.
    if (this.isReservationDepositPayload(raw)) {
      return of({ received: true });
    }

    return next.handle();
  }

  private isSharedStripeWebhook(request: Request) {
    if (request.method !== 'POST') return false;
    const rawPath = request.originalUrl ?? request.url ?? '';
    const path = rawPath.split('?')[0] ?? rawPath;
    return /\/billing\/webhooks\/stripe\/?$/.test(path);
  }

  private isReservationDepositPayload(raw: Buffer) {
    try {
      const event = JSON.parse(raw.toString('utf8')) as {
        data?: {
          object?: {
            metadata?: Record<string, unknown>;
          };
        };
      };
      const metadata = event.data?.object?.metadata;
      return (
        metadata?.purpose === 'RESERVATION_DEPOSIT' ||
        typeof metadata?.reservationId === 'string'
      );
    } catch {
      return false;
    }
  }
}
