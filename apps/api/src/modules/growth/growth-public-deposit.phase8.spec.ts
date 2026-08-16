import { GrowthPublicDepositService } from './growth-public-deposit.service';

describe('Phase 8 reservation deposit webhook idempotency', () => {
  afterEach(() => jest.restoreAllMocks());

  it('processes duplicate paid callbacks without creating deposit money twice', async () => {
    let status = 'OPEN';
    const attempt = {
      id: 'attempt-1',
      shopId: 'shop-1',
      reservationId: 'reservation-1',
      amountMinor: 2000,
      currency: 'EUR',
      providerPaymentIntentId: null,
    };
    const ledgerUpsert = jest.fn().mockResolvedValue({ id: 'deposit-1' });
    const update = jest.fn(async ({ data }: any) => {
      status = data.status ?? status;
      return { ...attempt, status };
    });
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationDepositCheckoutAttempt: {
        findUnique: jest.fn(async () => ({ ...attempt, status })),
        update,
      },
      reservationDepositLedgerEntry: { upsert: ledgerUpsert },
    };
    const prisma: any = {
      reservationDepositCheckoutAttempt: {
        findUnique: jest.fn(async () => ({ ...attempt, status })),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const config: any = { get: jest.fn() };
    const service = new GrowthPublicDepositService(prisma, config);
    const session = {
      id: 'cs_paid',
      amount_total: 2000,
      currency: 'eur',
      payment_intent: 'pi_paid',
    };

    await (service as any).captureSucceededSession('evt_first', session);
    await (service as any).captureSucceededSession('evt_duplicate', session);

    expect(ledgerUpsert).toHaveBeenCalledTimes(1);
    expect(ledgerUpsert).toHaveBeenCalledWith({
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
      }),
      update: {},
    });
    expect(status).toBe('SUCCEEDED');
  });
});
