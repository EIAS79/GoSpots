import {
  CommercialAdjustmentSource,
  CommercialAdjustmentType,
  ReservationStatus,
} from '@prisma/client';
import { Phase8ReservationService } from './phase8-reservation.service';

const actor: any = {
  sub: 'user-1',
  shopId: 'shop-1',
  shopRole: 'OWNER',
  perms: '',
};

function makeService(tx: any, configValues: Record<string, string> = {}) {
  const prisma: any = {
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };
  const config: any = {
    get: jest.fn((key: string) => configValues[key]),
  };
  const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new Phase8ReservationService(prisma, config, audit),
    prisma,
    audit,
  };
}

function diningArrivalTx(overrides: Record<string, any> = {}) {
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    reservation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'reservation-1',
        shopId: 'shop-1',
        resourceId: 'resource-1',
        guestCheckId: null,
        guestName: 'Guest One',
        notes: null,
        partySize: 4,
        currency: 'EUR',
        status: ReservationStatus.CONFIRMED,
      }),
      update: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
    },
    resource: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'resource-1',
        shopId: 'shop-1',
        type: 'DINING',
        categoryId: 'category-1',
        status: 'RESERVED',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    shop: {
      findUnique: jest.fn().mockResolvedValue({ currency: 'EUR' }),
    },
    guestCheck: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'check-1', status: 'OPEN' }),
    },
    reservationExtension: {
      upsert: jest.fn().mockResolvedValue({ convertedSessionId: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    operationsSession: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    operationsRatePlan: { findMany: jest.fn().mockResolvedValue([]) },
    sessionResourceLink: { create: jest.fn() },
    guestCheckCommercialProfile: {
      upsert: jest.fn().mockResolvedValue({ id: 'profile-1' }),
    },
    reservationDepositLedgerEntry: {
      findMany: jest.fn().mockResolvedValue([
        { amountMinor: 2500, currency: 'EUR' },
      ]),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    reservationDepositApplication: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'application-1',
        amountMinor: 2500,
      }),
    },
    commercialAdjustment: {
      create: jest.fn().mockResolvedValue({ id: 'adjustment-1' }),
    },
    reservationBookingEvidence: {
      upsert: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
    },
    reservationDepositCheckoutAttempt: { findFirst: jest.fn() },
    ...overrides,
  };
  return tx;
}

describe('Phase8ReservationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('atomically converts a dining reservation into a table check and deposit credit', async () => {
    const tx = diningArrivalTx();
    const { service, audit } = makeService(tx);

    const result = await service.arrive(actor, 'reservation-1');

    expect(tx.guestCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: 'shop-1',
        guestName: 'Guest One',
        currency: 'EUR',
      }),
    });
    expect(tx.operationsSession.create).not.toHaveBeenCalled();
    expect(tx.reservationDepositApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reservationId: 'reservation-1',
        guestCheckId: 'check-1',
        amountMinor: 2500,
      }),
    });
    expect(tx.commercialAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: CommercialAdjustmentType.DEPOSIT_APPLICATION,
        source: CommercialAdjustmentSource.DEPOSIT,
        targetSourceType: 'RESERVATION_DEPOSIT',
        targetSourceId: 'reservation-1',
        amountMinor: 2500,
      }),
    });
    expect(tx.reservation.update).toHaveBeenCalledWith({
      where: { id: 'reservation-1' },
      data: expect.objectContaining({
        guestCheckId: 'check-1',
        status: ReservationStatus.CHECKED_IN,
      }),
    });
    expect(tx.resource.updateMany).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        lifecycleState: 'ARRIVED',
        guestCheckId: 'check-1',
        operationsSessionId: null,
        depositApplicationMinor: 2500,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'reservation.arrive' }),
    );
  });

  it('replays an already-arrived reservation without duplicating check or deposit credit', async () => {
    const tx = diningArrivalTx();
    tx.reservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      shopId: 'shop-1',
      resourceId: 'resource-1',
      guestCheckId: 'check-1',
      guestName: 'Guest One',
      notes: null,
      partySize: 4,
      currency: 'EUR',
      status: ReservationStatus.CHECKED_IN,
    });
    tx.guestCheck.findFirst.mockResolvedValue({ id: 'check-1', status: 'OPEN' });
    tx.reservationDepositApplication.findMany.mockResolvedValue([
      { amountMinor: 2500 },
    ]);
    tx.reservationDepositApplication.findFirst.mockResolvedValue({
      id: 'application-1',
      amountMinor: 2500,
    });
    const { service } = makeService(tx);

    const result = await service.arrive(actor, 'reservation-1');

    expect(tx.guestCheck.create).not.toHaveBeenCalled();
    expect(tx.reservationDepositApplication.create).not.toHaveBeenCalled();
    expect(tx.commercialAdjustment.create).not.toHaveBeenCalled();
    expect(result.depositApplicationMinor).toBe(2500);
  });

  it('uses Stripe idempotency and records a provider refund as negative deposit money', async () => {
    const tx = diningArrivalTx();
    tx.reservationDepositLedgerEntry.findFirst.mockResolvedValue(null);
    tx.reservation.findFirst.mockResolvedValue({ id: 'reservation-1' });
    tx.reservationDepositLedgerEntry.findMany.mockResolvedValue([
      { amountMinor: 3000, currency: 'EUR' },
    ]);
    tx.reservationDepositApplication.findMany.mockResolvedValue([]);
    tx.reservationDepositCheckoutAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      providerPaymentIntentId: 'pi_1',
      currency: 'EUR',
      status: 'SUCCEEDED',
    });
    tx.reservationDepositLedgerEntry.create.mockResolvedValue({
      id: 'refund-ledger-1',
      reservationId: 'reservation-1',
      amountMinor: -1000,
      refundId: 're_1',
      correlationId: 'refund-request-1',
    });
    const { service } = makeService(tx, { STRIPE_SECRET_KEY: 'sk_test_dummy' });
    const createRefund = jest.fn().mockResolvedValue({
      id: 're_1',
      status: 'succeeded',
    });
    jest.spyOn(service as any, 'stripe').mockReturnValue({
      refunds: { create: createRefund },
    });

    const result = await service.refundProviderDeposit(actor, 'reservation-1', {
      amountMinor: 1000,
      correlationId: 'refund-request-1',
      reason: 'Guest cancellation',
    });

    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_1',
        amount: 1000,
        metadata: expect.objectContaining({
          purpose: 'RESERVATION_DEPOSIT_REFUND',
          reservationId: 'reservation-1',
        }),
      }),
      {
        idempotencyKey:
          'reservation-deposit-refund:shop-1:reservation-1:refund-request-1',
      },
    );
    expect(tx.reservationDepositLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'REFUND',
        amountMinor: -1000,
        refundId: 're_1',
        correlationId: 'refund-request-1',
      }),
    });
    expect(result.refundId).toBe('re_1');
  });

  it('replays the same refund correlation without calling Stripe twice', async () => {
    const tx = diningArrivalTx();
    tx.reservationDepositLedgerEntry.findFirst.mockResolvedValue({
      id: 'refund-ledger-1',
      reservationId: 'reservation-1',
      type: 'REFUND',
      amountMinor: -1000,
      refundId: 're_1',
      correlationId: 'refund-request-1',
    });
    const { service } = makeService(tx, { STRIPE_SECRET_KEY: 'sk_test_dummy' });
    const createRefund = jest.fn();
    jest.spyOn(service as any, 'stripe').mockReturnValue({
      refunds: { create: createRefund },
    });

    const result = await service.refundProviderDeposit(actor, 'reservation-1', {
      amountMinor: 1000,
      correlationId: 'refund-request-1',
      reason: 'Guest cancellation',
    });

    expect(createRefund).not.toHaveBeenCalled();
    expect(result.refundId).toBe('re_1');
  });
});
