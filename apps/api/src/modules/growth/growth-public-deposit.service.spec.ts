import { ServiceUnavailableException } from '@nestjs/common';
import { GrowthPublicDepositService } from './growth-public-deposit.service';

function makeService(prismaOverrides: Record<string, any> = {}, configValues: Record<string, string> = {}) {
  const prisma: any = { ...prismaOverrides };
  const config: any = {
    get: jest.fn((key: string) => configValues[key]),
  };
  return { service: new GrowthPublicDepositService(prisma, config), prisma, config };
}

const reservation = {
  id: 'reservation-1',
  status: 'CONFIRMED',
  billingBaseAmount: null,
  billedAmount: null,
};
const numbers = {
  requiredMinor: 2000,
  balanceMinor: 0,
  appliedMinor: 0,
  unappliedMinor: 0,
  remainingMinor: 2000,
  currency: 'EUR',
};

describe('GrowthPublicDepositService Stripe gates', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reuses an existing live Stripe Checkout session instead of opening a duplicate', async () => {
    const openAttempt = {
      id: 'attempt-1',
      providerSessionId: 'cs_existing',
      expiresAt: new Date('2099-08-11T12:00:00Z'),
    };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationDepositCheckoutAttempt: {
        findFirst: jest.fn().mockResolvedValue(openAttempt),
        update: jest.fn(),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const { service } = makeService(prisma);
    jest.spyOn(service as any, 'requireGuestReservation').mockResolvedValue({
      shopId: 'shop-1',
      reservation,
    });
    jest.spyOn(service as any, 'statusForReservation').mockResolvedValue(numbers);
    jest.spyOn(service as any, 'depositNumbers').mockResolvedValue(numbers);
    jest.spyOn(service as any, 'webBaseUrl').mockReturnValue('https://app.example.com');
    const create = jest.fn();
    jest.spyOn(service as any, 'stripe').mockReturnValue({
      checkout: {
        sessions: {
          retrieve: jest.fn().mockResolvedValue({
            id: 'cs_existing',
            status: 'open',
            url: 'https://checkout.stripe.com/existing',
          }),
          create,
        },
      },
    });

    const result = await service.createCheckout('venue', 'reservation-1', 'guest-token');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        checkoutRequired: true,
        checkoutSessionId: 'cs_existing',
        checkoutUrl: 'https://checkout.stripe.com/existing',
      }),
    );
  });

  it('creates a server-idempotent Checkout session with controlled return URLs and persists only a URL hash', async () => {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationDepositCheckoutAttempt: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn().mockResolvedValue({ id: 'attempt-3' }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const { service } = makeService(prisma);
    jest.spyOn(service as any, 'requireGuestReservation').mockResolvedValue({
      shopId: 'shop-1',
      reservation,
    });
    jest.spyOn(service as any, 'statusForReservation').mockResolvedValue(numbers);
    jest.spyOn(service as any, 'depositNumbers').mockResolvedValue(numbers);
    jest.spyOn(service as any, 'webBaseUrl').mockReturnValue('https://app.example.com');
    const create = jest.fn().mockResolvedValue({
      id: 'cs_new',
      url: 'https://checkout.stripe.com/new-secret-url',
      payment_intent: 'pi_1',
    });
    jest.spyOn(service as any, 'stripe').mockReturnValue({
      checkout: { sessions: { create, retrieve: jest.fn() } },
    });

    const result = await service.createCheckout('venue', 'reservation-1', 'guest-token');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        metadata: {
          purpose: 'RESERVATION_DEPOSIT',
          shopId: 'shop-1',
          reservationId: 'reservation-1',
        },
        success_url: 'https://app.example.com/deposit-return?status=success',
        cancel_url: 'https://app.example.com/deposit-return?status=canceled',
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              currency: 'eur',
              unit_amount: 2000,
            }),
          }),
        ],
      }),
      { idempotencyKey: 'reservation-deposit:reservation-1:0:3' },
    );
    expect(tx.reservationDepositCheckoutAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerSessionId: 'cs_new',
        providerPaymentIntentId: 'pi_1',
        amountMinor: 2000,
        currency: 'EUR',
        status: 'OPEN',
        checkoutUrlHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    const stored = tx.reservationDepositCheckoutAttempt.create.mock.calls[0][0].data;
    expect(stored.checkoutUrl).toBeUndefined();
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/new-secret-url');
  });

  it('rejects webhook processing when no webhook secret is configured', async () => {
    const { service } = makeService();

    await expect(
      service.handleStripeWebhook(Buffer.from('{}'), 'signature'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('dispatches only paid reservation-deposit Checkout completion events to capture', async () => {
    const { service } = makeService({}, {
      STRIPE_RESERVATION_DEPOSIT_WEBHOOK_SECRET: 'whsec_test',
    });
    const capture = jest
      .spyOn(service as any, 'captureSucceededSession')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'stripe').mockReturnValue({
      webhooks: {
        constructEvent: jest.fn().mockReturnValue({
          id: 'evt_1',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_1',
              payment_status: 'paid',
              metadata: { purpose: 'RESERVATION_DEPOSIT' },
            },
          },
        }),
      },
    });

    const result = await service.handleStripeWebhook(
      Buffer.from('{}'),
      'stripe-signature',
    );

    expect(capture).toHaveBeenCalledWith(
      'evt_1',
      expect.objectContaining({ id: 'cs_1' }),
    );
    expect(result).toEqual({ received: true });
  });

  it('marks provider amount/currency mismatch without creating deposit money', async () => {
    const attempt = {
      id: 'attempt-1',
      shopId: 'shop-1',
      reservationId: 'reservation-1',
      status: 'OPEN',
      amountMinor: 2000,
      currency: 'EUR',
      providerPaymentIntentId: null,
    };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationDepositCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(attempt),
        update: jest.fn().mockResolvedValue({ ...attempt, status: 'PROVIDER_MISMATCH' }),
      },
      reservationDepositLedgerEntry: { upsert: jest.fn() },
    };
    const prisma: any = {
      reservationDepositCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(attempt),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const { service } = makeService(prisma);

    await (service as any).captureSucceededSession('evt_mismatch', {
      id: 'cs_1',
      amount_total: 1999,
      currency: 'eur',
      payment_intent: 'pi_1',
    });

    expect(tx.reservationDepositLedgerEntry.upsert).not.toHaveBeenCalled();
    expect(tx.reservationDepositCheckoutAttempt.update).toHaveBeenCalledWith({
      where: { id: 'attempt-1' },
      data: expect.objectContaining({
        status: 'PROVIDER_MISMATCH',
        lastProviderEvent: 'evt_mismatch',
        failureCode: 'AMOUNT_OR_CURRENCY_MISMATCH',
      }),
    });
  });

  it('captures a matching paid session once and marks the checkout succeeded', async () => {
    const attempt = {
      id: 'attempt-1',
      shopId: 'shop-1',
      reservationId: 'reservation-1',
      status: 'OPEN',
      amountMinor: 2000,
      currency: 'EUR',
      providerPaymentIntentId: null,
    };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationDepositCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(attempt),
        update: jest.fn().mockResolvedValue({ ...attempt, status: 'SUCCEEDED' }),
      },
      reservationDepositLedgerEntry: {
        upsert: jest.fn().mockResolvedValue({ id: 'deposit-1' }),
      },
    };
    const prisma: any = {
      reservationDepositCheckoutAttempt: {
        findUnique: jest.fn().mockResolvedValue(attempt),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const { service } = makeService(prisma);

    await (service as any).captureSucceededSession('evt_paid', {
      id: 'cs_paid',
      amount_total: 2000,
      currency: 'eur',
      payment_intent: 'pi_paid',
    });

    expect(tx.reservationDepositLedgerEntry.upsert).toHaveBeenCalledWith({
      where: {
        shopId_correlationId: {
          shopId: 'shop-1',
          correlationId: 'stripe-checkout:cs_paid',
        },
      },
      create: expect.objectContaining({
        reservationId: 'reservation-1',
        type: 'CAPTURE',
        amountMinor: 2000,
        currency: 'EUR',
      }),
      update: {},
    });
    expect(tx.reservationDepositCheckoutAttempt.update).toHaveBeenCalledWith({
      where: { id: 'attempt-1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        providerPaymentIntentId: 'pi_paid',
        lastProviderEvent: 'evt_paid',
      }),
    });
  });
});
