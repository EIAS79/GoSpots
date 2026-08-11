import {
  assertNoOperationalOverlap,
  assertNoReservationOverlap,
} from './booking-overlap.util';

const from = new Date('2026-08-11T10:00:00Z');
const to = new Date('2026-08-11T11:00:00Z');

function operationalPrisma(input: {
  maintenance?: unknown;
  session?: unknown;
  eventHold?: unknown;
}) {
  return {
    resourceMaintenancePeriod: {
      findFirst: jest.fn().mockResolvedValue(input.maintenance ?? null),
    },
    operationsSession: {
      findFirst: jest.fn().mockResolvedValue(input.session ?? null),
    },
    eventResourceHold: {
      findFirst: jest.fn().mockResolvedValue(input.eventHold ?? null),
    },
  } as any;
}

describe('Resource Engine 2.0 booking blockers', () => {
  it('blocks a reservation when maintenance overlaps inside the write transaction', async () => {
    const prisma = operationalPrisma({ maintenance: { id: 'maintenance-1' } });

    await expect(
      assertNoOperationalOverlap(prisma, 'shop-1', 'resource-1', from, to),
    ).rejects.toThrow('maintenance block');
  });

  it('blocks a reservation when an active operations session overlaps', async () => {
    const prisma = operationalPrisma({ session: { id: 'session-1' } });

    await expect(
      assertNoOperationalOverlap(prisma, 'shop-1', 'resource-1', from, to),
    ).rejects.toThrow('active operations session');
  });

  it('blocks a reservation when another event hold overlaps', async () => {
    const prisma = operationalPrisma({ eventHold: { id: 'hold-1' } });

    await expect(
      assertNoOperationalOverlap(prisma, 'shop-1', 'resource-1', from, to),
    ).rejects.toThrow('event hold');
  });

  it('allows the write path when maintenance, sessions and event holds are all clear', async () => {
    const prisma = operationalPrisma({});

    await expect(
      assertNoOperationalOverlap(prisma, 'shop-1', 'resource-1', from, to),
    ).resolves.toBeUndefined();
  });

  it('uses half-open reservation overlap semantics so adjacent slots do not collide', async () => {
    const prisma: any = {
      reservation: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await assertNoReservationOverlap(
      prisma,
      'shop-1',
      'resource-1',
      from,
      to,
      'reservation-current',
    );

    expect(prisma.reservation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        shopId: 'shop-1',
        resourceId: 'resource-1',
        id: { not: 'reservation-current' },
        startsAt: { lt: to },
        endsAt: { gt: from },
      }),
    });
  });
});
