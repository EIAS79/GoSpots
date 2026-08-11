import { ConflictException } from '@nestjs/common';
import { ReservationGrowthService } from './reservation-growth.service';

const actor = { sub: 'user-1', shopId: 'shop-1' } as any;

function makeService(prismaOverrides: Record<string, any> = {}, capacityOverrides: Record<string, any> = {}) {
  const prisma: any = {
    reservation: { findFirst: jest.fn() },
    shop: { findUnique: jest.fn().mockResolvedValue({ currency: 'EUR' }) },
    ...prismaOverrides,
  };
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
    recordForShop: jest.fn().mockResolvedValue(undefined),
  } as any;
  const capacity = {
    expireWaitlist: jest.fn().mockResolvedValue({ expired: 0 }),
    capacityForShop: jest.fn(),
    ...capacityOverrides,
  } as any;
  const service = new ReservationGrowthService(prisma, audit, capacity);
  return { service, prisma, audit, capacity };
}

describe('ReservationGrowthService concurrency and deposit gates', () => {
  afterEach(() => jest.restoreAllMocks());

  it('locks both the waitlist offer and resource before converting exactly once', async () => {
    const waitlist = {
      id: 'wait-1',
      status: 'OFFERED',
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      guestPhone: null,
      partySize: 2,
      resourceId: 'resource-1',
      desiredStartsAt: new Date('2026-08-12T10:00:00Z'),
      desiredEndsAt: new Date('2026-08-12T11:00:00Z'),
      offerExpiresAt: new Date('2099-08-12T09:00:00Z'),
      note: null,
    };
    const created = { id: 'reservation-1', resourceId: 'resource-1' };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationWaitlistEntry: {
        findFirst: jest.fn().mockResolvedValue(waitlist),
        update: jest.fn().mockResolvedValue({ ...waitlist, status: 'CLAIMED' }),
      },
      resource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'resource-1', status: 'AVAILABLE' }),
      },
      reservation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
      playSession: { findMany: jest.fn().mockResolvedValue([]) },
      resourceMaintenancePeriod: { findFirst: jest.fn().mockResolvedValue(null) },
      operationsSession: { findFirst: jest.fn().mockResolvedValue(null) },
      eventResourceHold: { findFirst: jest.fn().mockResolvedValue(null) },
      reservationBookingEvidence: { create: jest.fn().mockResolvedValue({ id: 'evidence-1' }) },
    };
    const { service, prisma, capacity } = makeService(
      {
        reservationWaitlistEntry: { findFirst: jest.fn().mockResolvedValue(waitlist) },
        $transaction: jest.fn(async (callback: any) => callback(tx)),
      },
      {
        capacityForShop: jest.fn().mockResolvedValue({
          available: [
            {
              id: 'resource-1',
              bufferBeforeMinutes: 10,
              bufferAfterMinutes: 15,
            },
          ],
        }),
      },
    );

    const result = await service.convertWaitlist(actor, 'wait-1');

    expect(capacity.expireWaitlist).toHaveBeenCalledWith('shop-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.reservation.create).toHaveBeenCalledTimes(1);
    expect(tx.reservationBookingEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reservationId: 'reservation-1',
        sourceChannel: 'WAITLIST',
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 15,
      }),
    });
    expect(tx.reservationWaitlistEntry.update).toHaveBeenCalledWith({
      where: { id: 'wait-1' },
      data: {
        status: 'CLAIMED',
        resourceId: 'resource-1',
        reservationId: 'reservation-1',
      },
    });
    expect(result).toEqual(created);
  });

  it('rejects a second waitlist claimant after the locked offer is consumed', async () => {
    const waitlist = {
      id: 'wait-1',
      status: 'OFFERED',
      guestName: 'Guest',
      partySize: 2,
      resourceId: 'resource-1',
      desiredStartsAt: new Date('2026-08-12T10:00:00Z'),
      desiredEndsAt: new Date('2026-08-12T11:00:00Z'),
      offerExpiresAt: new Date('2099-08-12T09:00:00Z'),
    };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationWaitlistEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const { service } = makeService(
      {
        reservationWaitlistEntry: { findFirst: jest.fn().mockResolvedValue(waitlist) },
        $transaction: jest.fn(async (callback: any) => callback(tx)),
      },
      {
        capacityForShop: jest.fn().mockResolvedValue({
          available: [{ id: 'resource-1', bufferBeforeMinutes: 0, bufferAfterMinutes: 0 }],
        }),
      },
    );

    await expect(service.convertWaitlist(actor, 'wait-1')).rejects.toThrow(
      'Waitlist offer was already claimed.',
    );
  });

  it('serializes deposit movements and rejects refund overdrafts', async () => {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationDepositLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ amountMinor: 500 }]),
        create: jest.fn(),
      },
      refund: {
        findFirst: jest.fn().mockResolvedValue({ id: 'refund-1', state: 'SUCCEEDED' }),
      },
    };
    const { service } = makeService({
      reservation: { findFirst: jest.fn().mockResolvedValue({ id: 'reservation-1' }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    });

    await expect(
      service.recordDeposit(actor, 'reservation-1', {
        type: 'REFUND',
        amountMinor: 600,
        refundId: 'refund-1',
        correlationId: 'refund-correlation-1',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.reservationDepositLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('returns the existing correlation row instead of duplicating a deposit movement', async () => {
    const existing = {
      id: 'deposit-1',
      reservationId: 'reservation-1',
      amountMinor: 1000,
      type: 'CAPTURE',
    };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservationDepositLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const { service } = makeService({
      reservation: { findFirst: jest.fn().mockResolvedValue({ id: 'reservation-1' }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    });
    jest.spyOn(service, 'depositSummary').mockResolvedValue({ balanceMinor: 1000 } as any);

    const result = await service.recordDeposit(actor, 'reservation-1', {
      type: 'CAPTURE',
      amountMinor: 1000,
      paymentId: 'payment-1',
      correlationId: 'capture-correlation-1',
    } as any);

    expect(tx.reservationDepositLedgerEntry.create).not.toHaveBeenCalled();
    expect(result.entry).toEqual(existing);
  });

  it('reuses an already converted operations session idempotently', async () => {
    const existingSession = { id: 'session-1', status: 'ACTIVE' };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reservation-1',
          resourceId: 'resource-1',
          guestCheckId: 'check-1',
        }),
      },
      reservationExtension: {
        findFirst: jest.fn().mockResolvedValue({ convertedSessionId: 'session-1' }),
        upsert: jest.fn(),
      },
      operationsSession: {
        findFirst: jest.fn().mockResolvedValue(existingSession),
        create: jest.fn(),
      },
    };
    const { service } = makeService({
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    });

    const result = await service.convertReservation(actor, 'reservation-1');

    expect(result).toEqual(existingSession);
    expect(tx.operationsSession.create).not.toHaveBeenCalled();
    expect(tx.reservationExtension.upsert).not.toHaveBeenCalled();
  });
});
