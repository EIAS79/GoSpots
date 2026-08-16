import type { Request } from 'express';
import { GrowthPublicController } from './growth-public.controller';

const booking = {
  startsAt: '2026-08-17T12:00:00.000Z',
  endsAt: '2026-08-17T13:00:00.000Z',
  partySize: 2,
  guestName: 'Phase 8 Acceptance',
  guestEmail: 'phase8-acceptance@example.invalid',
};

function makeController(options?: { policy?: any; upsertError?: Error }) {
  const created = {
    recurrenceSeriesId: null,
    reservations: [
      {
        reservationId: 'reservation-1',
        resourceId: 'resource-1',
        startsAt: new Date(booking.startsAt),
        endsAt: new Date(booking.endsAt),
        guestToken: 'guest-token',
      },
    ],
  };
  const upsert = options?.upsertError
    ? jest.fn().mockRejectedValue(options.upsertError)
    : jest.fn().mockResolvedValue({ id: 'extension-1' });
  const deleteEvidence = jest.fn().mockResolvedValue({ count: 1 });
  const deleteReservations = jest.fn().mockResolvedValue({ count: 1 });
  const prisma: any = {
    shop: {
      findFirst: jest.fn().mockResolvedValue({ id: 'shop-1', slug: 'venue' }),
    },
    reservationPolicy: {
      findFirst: jest.fn().mockResolvedValue(options?.policy ?? null),
    },
    reservationExtension: { upsert },
    reservationBookingEvidence: { deleteMany: deleteEvidence },
    reservation: { deleteMany: deleteReservations },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  const capacity: any = {
    createPublic: jest.fn().mockResolvedValue(created),
  };
  return {
    controller: new GrowthPublicController(prisma, capacity),
    prisma,
    capacity,
    created,
    upsert,
    deleteEvidence,
    deleteReservations,
  };
}

describe('GrowthPublicController deposit policy', () => {
  const request = { ip: '127.0.0.1' } as Request;

  it('snapshots the latest active venue policy before returning public confirmation', async () => {
    const policy = {
      id: 'policy-1',
      name: 'Public deposit',
      depositKind: 'FIXED',
      depositFixedMinor: 100,
      depositPercentBps: null,
      cancellationWindowMinutes: 60,
      lateCancelForfeitPercent: 50,
      noShowForfeitPercent: 100,
      createdAt: new Date('2026-08-16T10:00:00Z'),
    };
    const { controller, prisma, upsert, created } = makeController({ policy });

    await expect(controller.create('venue', booking, request)).resolves.toEqual(created);

    expect(prisma.reservationPolicy.findFirst).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', active: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { reservationId: 'reservation-1' },
      create: expect.objectContaining({
        shopId: 'shop-1',
        reservationId: 'reservation-1',
        policyId: 'policy-1',
        policySnapshot: expect.objectContaining({
          depositKind: 'FIXED',
          depositFixedMinor: 100,
          source: 'PUBLIC_BOOKING_ACTIVE_POLICY',
        }),
      }),
      update: expect.objectContaining({
        policyId: 'policy-1',
        policySnapshot: expect.objectContaining({ depositFixedMinor: 100 }),
      }),
    });
  });

  it('keeps public booking deposit-free when the venue has no active policy', async () => {
    const { controller, upsert, created } = makeController();

    await expect(controller.create('venue', booking, request)).resolves.toEqual(created);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('compensates a new booking if its policy snapshot cannot be persisted', async () => {
    const policy = {
      id: 'policy-1',
      name: 'Public deposit',
      depositKind: 'FIXED',
      depositFixedMinor: 100,
      depositPercentBps: null,
      cancellationWindowMinutes: 60,
      lateCancelForfeitPercent: 50,
      noShowForfeitPercent: 100,
      createdAt: new Date('2026-08-16T10:00:00Z'),
    };
    const failure = new Error('policy persistence failed');
    const { controller, deleteEvidence, deleteReservations } = makeController({
      policy,
      upsertError: failure,
    });

    await expect(controller.create('venue', booking, request)).rejects.toThrow(failure);
    expect(deleteEvidence).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', reservationId: { in: ['reservation-1'] } },
    });
    expect(deleteReservations).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', id: { in: ['reservation-1'] } },
    });
  });
});
