# Postgres exclusion constraint — booking overlaps

**Status:** Migration **on disk** (`20260721060000_reservation_resource_exclusion`). App path aligned (half-open `[)` + `ACTIVE_RESERVATION`). Neon / shared deploy = **operator** after `detect:reservation-overlaps` = 0.  
**Date:** 2026-07-21 (ship lane **WWWWWW**)  
**Related:** `booking-lock.util.ts` (FOR UPDATE + 23P01→409), `booking-overlap.util.ts`, `reservation-overlap-detect.util.ts`.

---

## 1. Why this exists

App-level mitigation:

- `withResourceBookingLock` → `SELECT … FROM "Resource" … FOR UPDATE`
- then `assertBookingSlotFree` / overlap helpers → create/update
- exclusion violation (`23P01` on `Reservation_resource_tstzrange_excl`) → same `ConflictException` 409

Row locks serialize check+write for a resource. The Postgres `EXCLUDE` is defense-in-depth for reservation↔reservation races (and for any code path that forgets the lock).

---

## 2. Shipped SQL (migration)

Match app overlap semantics: half-open `[)` so adjacent slots that only touch at an endpoint do **not** conflict (`startsAt < other.endsAt AND endsAt > other.startsAt`).

Active statuses must match `ACTIVE_RESERVATION` in `booking-floor-status.ts`: `PENDING`, `CONFIRMED`, `CHECKED_IN`.

File: `apps/api/prisma/migrations/20260721060000_reservation_resource_exclusion/migration.sql`

```sql
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
```

Same string: `RESERVATION_EXCLUSION_CONSTRAINT_SQL` in `reservation-overlap-detect.util.ts`.

**If this migration failed mid-deploy (P3018 / 42P17):** mark rolled back, then re-deploy (fixed SQL is in the same folder — do not reset):

```bash
pnpm --filter @gospots/api exec prisma migrate resolve --rolled-back 20260721060000_reservation_resource_exclusion
pnpm --filter @gospots/api migrate:deploy
```

**Rollback (forward-only preferred):**

```sql
ALTER TABLE "Reservation"
  DROP CONSTRAINT IF EXISTS "Reservation_resource_tstzrange_excl";
```

**Notes:**

- `btree_gist` is required so `=` on `text`/`cuid` can participate in a GiST exclusion with ranges.
- Columns are Prisma `DateTime` → `timestamp(3)` **without** time zone. Use **`tsrange`** (IMMUTABLE). Do **not** use `tstzrange` (casts via session TZ → STABLE → **42P17** on Neon).
- Constraint name keeps `…tstzrange_excl` for app `23P01` matching — range type underneath is `tsrange`.
- Partial `WHERE` keeps canceled / completed / no-show / null-`resourceId` rows out of the constraint.
- This does **not** cover `PlaySession` walk-ins (see §5).
- Prisma does **not** model `EXCLUDE` in `schema.prisma` — SQL-only migration is intentional.

---

## 3. Detection query (existing overlaps)

Self-join on the same active statuses and half-open overlap. Safe to run read-only anytime.

```sql
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
 AND tstzrange(a."startsAt", a."endsAt", '[)')
  && tstzrange(b."startsAt", b."endsAt", '[)');
```

**Read-only script:** from `apps/api`:

```bash
pnpm detect:reservation-overlaps
```

Uses `DATABASE_URL`. Prints pairs; **never deletes or updates**. Exit code `1` if any pair found. Jest: `reservation-overlap-detect.util.spec.ts`.

---

## 4. Deploy gate (Neon / prod)

1. Run `pnpm detect:reservation-overlaps` on the target DB; `overlapPairs = 0`.
2. Manually resolve any pairs (cancel or move — venue ops). **Never** auto-wipe / migrate reset.
3. Re-run detection until clean.
4. `prisma migrate deploy` only — never reset.
5. Keep app locks; constraint is belt-and-suspenders.
6. Live concurrency recipes: local Docker / ephemeral Postgres only (`RUN_CONCURRENCY_TESTS=1`); harness **refuses Neon** hosts.

CI ephemeral `api-migrate` applies this migration on an empty DB (always clean).

---

## 5. Walk-ins / PlaySession (out of this DDL)

Active walk-ins use `PlaySession` (`status = ACTIVE`, effective end via `walkInEffectiveEnd`). Exclusion on `Reservation` does not see them.

Options later:

- Keep app locks + `assertNoWalkInOverlap` / `assertNoReservationOverlap` under `FOR UPDATE` (current intent).
- Or a separate exclusion / generated range column on `PlaySession` (harder: open-ended sessions use a 24h effective end in app code).

---

## 6. Booking-lock coverage

| Path | Lock today? | Notes |
|------|-------------|--------|
| Public create (`createPublic` / gaming+dining) | Yes | `withResourceBookingLock` + `assertBookingSlotFree` |
| Staff create with `resourceId` | Yes | Same |
| Staff create **without** `resourceId` | No | Unassigned booking; no resource to lock / exclude |
| Staff update with `resourceId` | Yes | Locks **target** resource only (not previous, if reassigned) |
| Staff update **without** `resourceId` | No | Unassigned / cleared unit |
| Walk-in `createPlaySession` with `resourceId` | Yes | Overlap asserts under lock |
| Walk-in create without `resourceId` | No | No unit |
| **`updatePlaySession`** resource / duration / end / clearPaid | Yes | Same lock path as create; locks **target** resource; excludes self from walk-in overlap |
| Walk-in update without `resourceId` (or status-only / amount-only) | No | No unit, or interval unchanged |
| Walk-in `markPlaySessionPaid` / cancel / status→COMPLETED | Conditional `updateMany` (no resource lock) | Money/status claim in one txn; cancel only unpaid `ACTIVE` |
| Guest cancel / reservation billing mark-paid | No | Not create-slot paths; lower risk for double-book |

Primary overlap gap closed: `updatePlaySession` uses `withResourceBookingLock` + overlap asserts when `resourceId`, `durationMinutes`, or `endSession` changes while remaining `ACTIVE` (and on `clearPaid` reopen with a resource). Pay/cancel races closed via conditional status claims.
