import { ConflictException } from '@nestjs/common';
import { ResourceStatus, type Prisma, type PrismaClient } from '@prisma/client';
import { ACTIVE_RESERVATION } from './booking-floor-status';
import { isWalkInBlockingAt, walkInEffectiveEnd } from './walk-in-block.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function assertResourceBookable(
  prisma: DbClient,
  shopId: string,
  resourceId: string,
) {
  const resource = await prisma.resource.findFirst({
    where: { id: resourceId, shopId },
  });
  if (!resource) {
    throw new ConflictException('Resource not found.');
  }
  if (resource.status === ResourceStatus.MAINTENANCE) {
    throw new ConflictException(
      'This unit is out of service and cannot be booked.',
    );
  }
  return resource;
}

/**
 * Half-open [startsAt, endsAt) — same as Postgres
 * `tstzrange(..., '[)')` on Reservation_resource_tstzrange_excl.
 * Active statuses = ACTIVE_RESERVATION (PENDING / CONFIRMED / CHECKED_IN).
 */
export async function assertNoReservationOverlap(
  prisma: DbClient,
  shopId: string,
  resourceId: string,
  startsAt: Date,
  endsAt: Date,
  excludeReservationId?: string,
) {
  const clash = await prisma.reservation.findFirst({
    where: {
      shopId,
      resourceId,
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      status: { in: ACTIVE_RESERVATION },
      // Half-open: adjacent slots that only touch at an endpoint do not clash.
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (clash) {
    throw new ConflictException(
      'This unit already has a booking that overlaps that time.',
    );
  }
}

export async function assertNoActiveWalkIn(
  prisma: DbClient,
  shopId: string,
  resourceId: string,
  at: Date = new Date(),
) {
  const active = await prisma.playSession.findFirst({
    where: {
      shopId,
      resourceId,
      status: 'ACTIVE',
      archivedAt: null,
    },
  });
  if (active && isWalkInBlockingAt(active, at)) {
    throw new ConflictException(
      'This unit has an active walk-in session right now.',
    );
  }
}

export async function assertNoWalkInOverlap(
  prisma: DbClient,
  shopId: string,
  resourceId: string,
  startsAt: Date,
  endsAt: Date,
  excludeSessionId?: string,
) {
  const sessions = await prisma.playSession.findMany({
    where: {
      shopId,
      resourceId,
      status: 'ACTIVE',
      archivedAt: null,
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
    },
  });
  for (const s of sessions) {
    const wStart = s.startedAt;
    const wEnd = walkInEffectiveEnd(s);
    if (wStart < endsAt && wEnd > startsAt) {
      throw new ConflictException(
        'This unit has a walk-in session that overlaps that time.',
      );
    }
  }
}

/** Full check before creating/updating a timed reservation. */
export async function assertBookingSlotFree(
  prisma: DbClient,
  shopId: string,
  resourceId: string,
  startsAt: Date,
  endsAt: Date,
  excludeReservationId?: string,
) {
  await assertResourceBookable(prisma, shopId, resourceId);
  await assertNoReservationOverlap(
    prisma,
    shopId,
    resourceId,
    startsAt,
    endsAt,
    excludeReservationId,
  );
  await assertNoWalkInOverlap(prisma, shopId, resourceId, startsAt, endsAt);
}
