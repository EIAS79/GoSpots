import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ReservationStripeWebhookRoutingInterceptor } from './reservation-stripe-webhook-routing.interceptor';

function makeContext(payload: unknown, path = '/api/v1/billing/webhooks/stripe') {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const request = {
    method: 'POST',
    originalUrl: path,
    url: path,
    headers: { 'stripe-signature': 'sig_live_test' },
    rawBody,
    body: payload,
  };
  return {
    rawBody,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

describe('ReservationStripeWebhookRoutingInterceptor', () => {
  it('consumes handled reservation Checkout events before SaaS billing', async () => {
    const deposits = {
      handleStripeWebhook: jest.fn().mockResolvedValue({ received: true }),
    };
    const interceptor = new ReservationStripeWebhookRoutingInterceptor(
      deposits as never,
    );
    const { context, rawBody } = makeContext({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            purpose: 'RESERVATION_DEPOSIT',
            reservationId: 'reservation-1',
          },
        },
      },
    });
    const next = { handle: jest.fn(() => of({ billing: true })) } as CallHandler;

    const result = await firstValueFrom(await interceptor.intercept(context, next));

    expect(deposits.handleStripeWebhook).toHaveBeenCalledWith(
      rawBody,
      'sig_live_test',
    );
    expect(next.handle).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });

  it('consumes ancillary reservation provider events by signed metadata', async () => {
    const deposits = {
      handleStripeWebhook: jest
        .fn()
        .mockResolvedValue({ received: true, ignored: true }),
    };
    const interceptor = new ReservationStripeWebhookRoutingInterceptor(
      deposits as never,
    );
    const { context } = makeContext({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          metadata: {
            purpose: 'RESERVATION_DEPOSIT',
            reservationId: 'reservation-1',
          },
        },
      },
    });
    const next = { handle: jest.fn(() => of({ billing: true })) } as CallHandler;

    const result = await firstValueFrom(await interceptor.intercept(context, next));

    expect(next.handle).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });

  it('passes ordinary subscription Stripe events to SaaS billing', async () => {
    const deposits = {
      handleStripeWebhook: jest
        .fn()
        .mockResolvedValue({ received: true, ignored: true }),
    };
    const interceptor = new ReservationStripeWebhookRoutingInterceptor(
      deposits as never,
    );
    const { context } = makeContext({
      type: 'invoice.paid',
      data: { object: { metadata: { shop_id: 'shop-1' } } },
    });
    const next = { handle: jest.fn(() => of({ billing: true })) } as CallHandler;

    const result = await firstValueFrom(await interceptor.intercept(context, next));

    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ billing: true });
  });

  it('does not inspect unrelated API routes', async () => {
    const deposits = { handleStripeWebhook: jest.fn() };
    const interceptor = new ReservationStripeWebhookRoutingInterceptor(
      deposits as never,
    );
    const { context } = makeContext(
      { data: { object: { metadata: { purpose: 'RESERVATION_DEPOSIT' } } } },
      '/api/v1/growth/public/venue/reservations',
    );
    const next = { handle: jest.fn(() => of({ ok: true })) } as CallHandler;

    const result = await firstValueFrom(await interceptor.intercept(context, next));

    expect(deposits.handleStripeWebhook).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });
});
