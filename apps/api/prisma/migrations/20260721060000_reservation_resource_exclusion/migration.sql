-- Bible #4 / GO_SPOTS_EXCLUSION_CONSTRAINT.md — reservation↔reservation exclusion.
-- Matches app half-open [) overlap + ACTIVE_RESERVATION statuses.
-- Prisma cannot model EXCLUDE in schema.prisma; SQL-only (no schema.prisma change).
--
-- PREFLIGHT (operator / Neon): `pnpm detect:reservation-overlaps` must exit 0.
-- ALTER fails if any overlapping active pair exists on the same resourceId.
-- Never prisma migrate reset. Walk-in PlaySession rows are NOT covered (app FOR UPDATE).
--
-- Reservation.startsAt/endsAt are Prisma DateTime → timestamp(3) WITHOUT time zone.
-- `tstzrange(timestamp, …)` casts via session TimeZone (STABLE) → 42P17 in GiST.
-- Use `tsrange` on the native timestamp columns (IMMUTABLE).

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
