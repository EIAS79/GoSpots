import { ConflictException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

/** Postgres exclusion_violation — matches Reservation_resource_tstzrange_excl. */
export const PG_EXCLUSION_VIOLATION = '23P01';

export const RESERVATION_EXCLUSION_CONSTRAINT_NAME =
  'Reservation_resource_tstzrange_excl';

/**
 * True when Prisma/driver surfaced the reservation tstzrange exclusion.
 * Defense-in-depth when FOR UPDATE + assert miss a race (or lock forgotten).
 */
export function isReservationExclusionViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    meta?: { code?: string; driverAdapterError?: { cause?: { code?: string } } };
    message?: string;
    cause?: { code?: string; message?: string };
  };
  const code =
    e.code === PG_EXCLUSION_VIOLATION ||
    e.meta?.code === PG_EXCLUSION_VIOLATION ||
    e.meta?.driverAdapterError?.cause?.code === PG_EXCLUSION_VIOLATION ||
    e.cause?.code === PG_EXCLUSION_VIOLATION;
  if (code) return true;
  const msg = `${e.message ?? ''} ${e.cause?.message ?? ''}`;
  return (
    msg.includes(RESERVATION_EXCLUSION_CONSTRAINT_NAME) ||
    (msg.includes('exclusion') && msg.includes('Reservation'))
  );
}

/** Map exclusion to the same 409 copy as assertNoReservationOverlap. */
export function rethrowIfReservationExclusion(err: unknown): never {
  if (isReservationExclusionViolation(err)) {
    throw new ConflictException(
      'This unit already has a booking that overlaps that time.',
    );
  }
  throw err;
}

/**
 * Serialize booking / walk-in mutations for one resource via row lock.
 * Callers must run overlap checks + create/update inside `fn`.
 * Maps Reservation exclusion (23P01) → ConflictException (409).
 */
export async function withResourceBookingLock<T>(
  prisma: PrismaClient,
  resourceId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Resource" WHERE id = ${resourceId} FOR UPDATE
        `;
        if (!locked[0]) {
          // Resource missing — let caller assertBookable throw Conflict/NotFound.
          return fn(tx);
        }
        return fn(tx);
      },
      {
        // Default ReadCommitted + FOR UPDATE is enough to serialize check+create.
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  } catch (err) {
    rethrowIfReservationExclusion(err);
  }
}

/** Optional nested use when already inside a transaction. */
export async function lockResourceRow(
  tx: PrismaClientLike,
  resourceId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "Resource" WHERE id = ${resourceId} FOR UPDATE
  `;
}
