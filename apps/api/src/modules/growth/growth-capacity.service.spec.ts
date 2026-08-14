import { GrowthCapacityService } from './growth-capacity.service';

const start = '2026-08-12T10:00:00.000Z';
const end = '2026-08-12T11:00:00.000Z';

function candidate() {
  return {
    id: 'resource-1',
    name: 'Table 1',
    type: 'BILLIARD',
    categoryId: null,
    capacity: 4,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 15,
  };
}

function addBookingConflictDelegates(tx: any) {
  tx.resource = {
    findFirst: jest.fn().mockResolvedValue({
      id: 'resource-1',
      shopId: 'shop-1',
      status: 'AVAILABLE',
    }),
  };
  tx.playSession = {
    findMany: jest.fn().mockResolvedValue([]),
  };
  tx.resourceMaintenancePeriod = {
    findFirst: jest.fn().mockResolvedValue(null),
  };
  tx.operationsSession = {
    findFirst: jest.fn().mockResolvedValue(null),
  };
  tx.eventResourceHold = {
    findFirst: jest.fn().mockResolvedValue(null),
  };
  return tx;
}

describe('GrowthCapacityService public booking flow', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates a public booking under the resource advisory lock and returns the one-time guest token only to the caller', async () => {
    const reservation = {
      id: 'reservation-1',
      resourceId: 'resource-1',
      startsAt: new Date(start),
      endsAt: new Date(end),
    };
    const tx: any = addBookingConflictDelegates({
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          ...reservation,
          ...data,
        })),
      },
      reservationBookingEvidence: {
        create: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
      },
    });
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new GrowthCapacityService(prisma);
    jest.spyOn(service, 'capacityForShop').mockResolvedValue({
      startsAt: new Date(start),
      endsAt: new Date(end),
      partySize: 2,
      requested: {},
      available: [candidate()],
      unavailable: [],
    } as any);
    jest
      .spyOn(service as any, 'assertOperationallyFree')
      .mockResolvedValue(undefined);

    const result = await service.createPublic('shop-1', {
      startsAt: start,
      endsAt: end,
      partySize: 2,
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      sourceChannel: 'PUBLIC_WEB',
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.reservation.create).toHaveBeenCalledTimes(1);
    const persisted = tx.reservation.create.mock.calls[0][0].data;
    expect(persisted.guestTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.guestToken).toBeNull();
    expect(tx.reservationBookingEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceChannel: 'PUBLIC_WEB',
        assignedResourceId: 'resource-1',
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 15,
      }),
    });
    expect(result.reservations[0].guestToken).toEqual(expect.any(String));
    expect(result.reservations[0].guestToken).not.toBe(persisted.guestTokenHash);
  });

  it('locks each resource once for a recurring public series and snapshots the recurrence evidence', async () => {
    const tx: any = addBookingConflictDelegates({
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(async ({ data }: any) => ({ id: `reservation-${data.startsAt.toISOString()}`, ...data })),
      },
      reservationBookingEvidence: {
        create: jest.fn().mockResolvedValue({ id: 'evidence' }),
      },
    });
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new GrowthCapacityService(prisma);
    jest.spyOn(service, 'capacityForShop').mockImplementation(async (_shopId, dto) => ({
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      partySize: 2,
      requested: {},
      available: [candidate()],
      unavailable: [],
    }) as any);
    jest
      .spyOn(service as any, 'assertOperationallyFree')
      .mockResolvedValue(undefined);

    const result = await service.createPublic('shop-1', {
      startsAt: start,
      endsAt: end,
      partySize: 2,
      guestName: 'Recurring Guest',
      sourceChannel: 'PUBLIC_WEB',
      recurrence: { frequency: 'WEEKLY', count: 2 },
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.reservation.create).toHaveBeenCalledTimes(2);
    expect(tx.reservationBookingEvidence.create).toHaveBeenCalledTimes(2);
    expect(result.recurrenceSeriesId).toEqual(expect.any(String));
    const evidenceCalls = tx.reservationBookingEvidence.create.mock.calls;
    expect(evidenceCalls[0][0].data.recurrenceSeriesId).toBe(result.recurrenceSeriesId);
    expect(evidenceCalls[1][0].data.recurrenceSeriesId).toBe(result.recurrenceSeriesId);
  });

  it('reschedules a guest-token booking through the resource row lock and updates booking evidence', async () => {
    const current = {
      id: 'reservation-1',
      resourceId: 'resource-1',
      partySize: 2,
    };
    const tx: any = addBookingConflictDelegates({
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'resource-1' }]),
      reservation: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          ...current,
          ...data,
        })),
      },
      reservationBookingEvidence: {
        upsert: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
      },
    });
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new GrowthCapacityService(prisma);
    jest
      .spyOn(service as any, 'requireGuestReservation')
      .mockResolvedValue(current);
    jest.spyOn(service, 'capacityForShop').mockResolvedValue({
      startsAt: new Date(start),
      endsAt: new Date(end),
      partySize: 2,
      requested: {},
      available: [candidate()],
      unavailable: [],
    } as any);
    jest
      .spyOn(service as any, 'assertOperationallyFree')
      .mockResolvedValue(undefined);

    const result = await service.reschedulePublic(
      'shop-1',
      'reservation-1',
      'guest-token',
      { startsAt: start, endsAt: end, partySize: 2 },
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.reservation.update).toHaveBeenCalledWith({
      where: { id: 'reservation-1' },
      data: {
        resourceId: 'resource-1',
        startsAt: new Date(start),
        endsAt: new Date(end),
        partySize: 2,
        version: { increment: 1 },
      },
    });
    expect(tx.reservationBookingEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          assignedResourceId: 'resource-1',
          bufferBeforeMinutes: 10,
          bufferAfterMinutes: 15,
        }),
      }),
    );
    expect(result.resourceId).toBe('resource-1');
  });

  it('cancels a managed public booking and revokes the guest token in the same transaction', async () => {
    const updateReservation = jest.fn().mockResolvedValue({ id: 'reservation-1' });
    const evidenceUpsert = jest.fn().mockResolvedValue({ id: 'evidence-1' });
    const prisma: any = {
      reservation: { update: updateReservation },
      reservationBookingEvidence: { upsert: evidenceUpsert },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const service = new GrowthCapacityService(prisma);
    jest.spyOn(service as any, 'requireGuestReservation').mockResolvedValue({
      id: 'reservation-1',
      resourceId: 'resource-1',
    });

    const result = await service.cancelPublic(
      'shop-1',
      'reservation-1',
      'guest-token',
      'Plans changed',
    );

    expect(updateReservation).toHaveBeenCalledWith({
      where: { id: 'reservation-1' },
      data: expect.objectContaining({
        status: 'CANCELED',
        guestTokenRevokedAt: expect.any(Date),
      }),
    });
    expect(evidenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          canceledAt: expect.any(Date),
          cancellationReason: 'Plans changed',
        }),
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});
