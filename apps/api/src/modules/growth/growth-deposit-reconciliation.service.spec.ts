import { ConfigService } from '@nestjs/config';
import { GrowthDepositReconciliationService } from './growth-deposit-reconciliation.service';

const attempt = {
  id: 'attempt-1',
  shopId: 'shop-1',
  reservationId: 'reservation-1',
  providerSessionId: 'cs_live_phase8',
  providerPaymentIntentId: null,
  amountMinor: 500,
  currency: 'PLN',
  status: 'OPEN',
};

describe('GrowthDepositReconciliationService', () => {
  function makeService(options?: { status?: string; paymentStatus?: string }) {
    const currentStatus = options?.status ?? 'OPEN';
    const prisma: any = {
      reservationDepositCheckoutAttempt: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ ...attempt, status: currentStatus })
          .mockResolvedValueOnce({
            ...attempt,
            status:
              currentStatus === 'SUCCEEDED'
                ? 'SUCCEEDED'
                : options?.paymentStatus === 'unpaid'
                  ? 'OPEN'
                  : 'SUCCEEDED',
          }),
      },
      reservationDepositLedgerEntry: {
        findMany: jest.fn().mockResolvedValue(
          currentStatus === 'SUCCEEDED' || options?.paymentStatus !== 'unpaid'
            ? [
                {
                  amountMinor: 500,
                  type: 'CAPTURE',
                  correlationId: 'stripe-checkout:cs_live_phase8',
                },
              ]
            : [],
        ),
      },
    };
    const deposits: any = {
      handleStripeWebhook: jest.fn().mockResolvedValue({ received: true }),
    };
    const config = new ConfigService({
      STRIPE_SECRET_KEY: 'sk_test_phase8',
      STRIPE_WEBHOOK_SECRET: 'whsec_phase8',
    });
    const service = new GrowthDepositReconciliationService(
      prisma,
      config,
      deposits,
    );
    const retrieve = jest.fn().mockResolvedValue({
      id: 'cs_live_phase8',
      object: 'checkout.session',
      payment_status: options?.paymentStatus ?? 'paid',
      status: 'complete',
      livemode: true,
      metadata: {
        purpose: 'RESERVATION_DEPOSIT',
        shopId: 'shop-1',
        reservationId: 'reservation-1',
      },
    });
    const generateTestHeaderString = jest.fn().mockReturnValue('stripe-signature');
    const stripe = {
      checkout: { sessions: { retrieve } },
      webhooks: { generateTestHeaderString },
    };
    jest.spyOn(service as any, 'stripe').mockReturnValue(stripe);
    jest.spyOn(service as any, 'webhookSecret').mockReturnValue('whsec_phase8');
    return { service, prisma, deposits, retrieve, generateTestHeaderString };
  }

  it('reuses the signed webhook path to recover a paid Checkout session', async () => {
    const { service, deposits, retrieve, generateTestHeaderString } = makeService();

    await expect(service.reconcile('cs_live_phase8')).resolves.toEqual(
      expect.objectContaining({
        reservationId: 'reservation-1',
        attemptStatus: 'SUCCEEDED',
        reconciled: true,
        balanceMinor: 500,
        ledgerEntries: 1,
      }),
    );

    expect(retrieve).toHaveBeenCalledWith('cs_live_phase8');
    expect(generateTestHeaderString).toHaveBeenCalledTimes(1);
    expect(deposits.handleStripeWebhook).toHaveBeenCalledTimes(1);
  });

  it('is idempotent after the deposit is already captured', async () => {
    const { service, deposits, retrieve } = makeService({ status: 'SUCCEEDED' });

    await expect(service.reconcile('cs_live_phase8')).resolves.toEqual(
      expect.objectContaining({
        attemptStatus: 'SUCCEEDED',
        reconciled: true,
        balanceMinor: 500,
        ledgerEntries: 1,
      }),
    );

    expect(retrieve).not.toHaveBeenCalled();
    expect(deposits.handleStripeWebhook).not.toHaveBeenCalled();
  });

  it('never marks an unpaid provider session as paid', async () => {
    const { service, deposits } = makeService({ paymentStatus: 'unpaid' });

    await expect(service.reconcile('cs_live_phase8')).resolves.toEqual(
      expect.objectContaining({
        attemptStatus: 'OPEN',
        reconciled: false,
        balanceMinor: 0,
        ledgerEntries: 0,
      }),
    );

    expect(deposits.handleStripeWebhook).not.toHaveBeenCalled();
  });
});
