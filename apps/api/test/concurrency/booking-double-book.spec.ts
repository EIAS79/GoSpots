import { ConflictException } from '@nestjs/common';
import { PrismaClient, ReservationStatus } from '@prisma/client';
import { withResourceBookingLock } from '../../src/common/booking-lock.util';
import { assertBookingSlotFree } from '../../src/common/booking-overlap.util';
import {
  concurrencyTestsEnabled,
  describeConcurrency,
} from './concurrency.harness';
import {
  conflictStatus,
  createConcurrencyFixture,
  type ConcurrencyFixture,
} from './concurrency.fixtures';

/**
 * Live recipes C1 / C2 — util/lock path (same FOR UPDATE + overlap assert as services).
 * Service-level Nest DI deferred; harness refuses Neon.
 */
describeConcurrency('booking double-book (live Postgres)', () => {
  let prisma: PrismaClient;
  let fixture: ConcurrencyFixture;

  const startsAt = new Date('2030-06-01T14:00:00.000Z');
  const endsAt = new Date('2030-06-01T16:00:00.000Z');
  const N = 16;

  beforeAll(async () => {
    if (!concurrencyTestsEnabled()) return;
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (!concurrencyTestsEnabled()) return;
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    if (!concurrencyTestsEnabled()) return;
    fixture = await createConcurrencyFixture(prisma);
  });

  afterEach(async () => {
    if (!concurrencyTestsEnabled()) return;
    await fixture?.cleanup();
  });

  async function raceCreateReservation(guestIndex: number) {
    return withResourceBookingLock(prisma, fixture.resourceId, async (tx) => {
      await assertBookingSlotFree(
        tx,
        fixture.shopId,
        fixture.resourceId,
        startsAt,
        endsAt,
      );
      return tx.reservation.create({
        data: {
          shopId: fixture.shopId,
          resourceId: fixture.resourceId,
          guestName: `Race Guest ${guestIndex}`,
          guestEmail: `race-${guestIndex}@example.com`,
          partySize: 2,
          startsAt,
          endsAt,
          status: ReservationStatus.PENDING,
        },
      });
    });
  }

  it('C1/C2: parallel book same slot — exactly 1 success; others 409; active overlap count 1', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => raceCreateReservation(i)),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(N - 1);

    for (const r of rejected) {
      if (r.status !== 'rejected') continue;
      const status = conflictStatus(r.reason);
      expect(status).toBe(409);
      expect(r.reason).toBeInstanceOf(ConflictException);
    }

    const active = await prisma.reservation.count({
      where: {
        resourceId: fixture.resourceId,
        status: {
          in: [
            ReservationStatus.PENDING,
            ReservationStatus.CONFIRMED,
            ReservationStatus.CHECKED_IN,
          ],
        },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    expect(active).toBe(1);
  });
});
