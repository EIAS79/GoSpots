import { ResourceStatus, type Prisma, type PrismaClient } from '@prisma/client';
import { ApiDomainErrorCode } from './api-error.codes';
import { apiConflictException } from './api-error.util';
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
    throw apiConflictException(
      ApiDomainErrorCode.RESOURCE_NOT_BOOKABLE,
      'Resource not found.',
    );
  }
  if (resource.status === ResourceStatus.MAINTENANCE) {
    throw apiConflictException(
      ApiDomainErrorCode.RESOURCE_MAINTENANCE,
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
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (clash) {
    throw apiConflictException(
      ApiDomainErrorCode.RESERVATION_OVERLAP,
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
    throw apiConflictException(
      ApiDomainErrorCode.WALK_IN_ACTIVE,
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
      throw apiConflictException(
        ApiDomainErrorCode.WALK_IN_OVERLAP,
        'This unit has a walk-in session that overlaps that time.',
      );
    }
  }
}

/**
 * Resource Engine 2.0 blockers that must participate in the same transaction
 * as a reservation write. This closes the waitlist/public/staff race where a
 * resource becomes unavailable after a preflight capacity read.
 */
export async function assertNoOperationalOverlap(
  prisma: DbClient,
  shopId: string,
  resourceId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const now = new Date();
  const [maintenance, operationsSession, eventHold] = await Promise.all([
    prisma.resourceMaintenancePeriod.findFirst({
      where: {
        shopId,
        resourceId,
        startsAt: { lt: endsAt },
        OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
      },
      select: { id: true },
    }),
    prisma.operationsSession.findFirst({
      where: {
        shopId,
        resourceId,
        status: { in: ['ACTIVE', 'PAUSED'] },
        startedAt: { lt: endsAt },
        OR: [{ finishedAt: null }, { finishedAt: { gt: startsAt } }],
      },
      select: { id: true },
    }),
    prisma.eventResourceHold.findFirst({
      where: {
        shopId,
        resourceId,
        status: { in: ['HOLD', 'CONFIRMED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    }),
  ]);

  if (maintenance) {
    throw apiConflictException(
      ApiDomainErrorCode.RESOURCE_MAINTENANCE,
      'This unit has a maintenance block that overlaps that time.',
    );
  }
  if (operationsSession) {
    throw apiConflictException(
      ApiDomainErrorCode.WALK_IN_OVERLAP,
      'This unit has an active operations session that overlaps that time.',
    );
  }
  if (eventHold) {
    throw apiConflictException(
      ApiDomainErrorCode.RESERVATION_OVERLAP,
      'This unit has an event hold that overlaps that time.',
    );
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
  await assertNoOperationalOverlap(prisma, shopId, resourceId, startsAt, endsAt);
}
