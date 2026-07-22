/**
 * Read-only detection of overlapping active reservations.
 * Used by scripts/detect-reservation-overlaps.ts and docs —
 * never deletes or mutates rows.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Statuses that participate in floor blocking + future exclusion WHERE. */
export const OVERLAP_ACTIVE_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
] as const;

/**
 * Exact DDL shipped in `20260721060000_reservation_resource_exclusion`.
 * Kept here so detect tooling, docs, and migration stay aligned.
 * Operator: run detect script (exit 0) before `migrate deploy` on Neon.
 */
export const RESERVATION_EXCLUSION_CONSTRAINT_SQL = `
CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP FUNCTION IF EXISTS reservation_tstzrange(timestamptz, timestamptz);

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_resource_tstzrange_excl"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (
    "resourceId" IS NOT NULL
    AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
  );
`.trim();

/** Self-join detection — half-open [) matches app assertNoReservationOverlap. */
export const RESERVATION_OVERLAP_DETECTION_SQL = `
SELECT
  a.id AS "aId",
  b.id AS "bId",
  a."shopId",
  a."resourceId",
  a."startsAt" AS "aStartsAt",
  a."endsAt" AS "aEndsAt",
  a.status AS "aStatus",
  b."startsAt" AS "bStartsAt",
  b."endsAt" AS "bEndsAt",
  b.status AS "bStatus"
FROM "Reservation" a
JOIN "Reservation" b
  ON a."resourceId" = b."resourceId"
 AND a."shopId" = b."shopId"
 AND a.id < b.id
 AND a."resourceId" IS NOT NULL
 AND a.status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
 AND b.status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
 AND tsrange(a."startsAt", a."endsAt", '[)')
  && tsrange(b."startsAt", b."endsAt", '[)')
`.trim();

export type ReservationOverlapPair = {
  aId: string;
  bId: string;
  shopId: string;
  resourceId: string;
  aStartsAt: Date;
  aEndsAt: Date;
  aStatus: string;
  bStartsAt: Date;
  bEndsAt: Date;
  bStatus: string;
};

/** Read-only: list overlapping active reservation pairs. Never mutates. */
export async function listReservationOverlapPairs(
  prisma: DbClient,
): Promise<ReservationOverlapPair[]> {
  return prisma.$queryRawUnsafe<ReservationOverlapPair[]>(
    RESERVATION_OVERLAP_DETECTION_SQL,
  );
}
