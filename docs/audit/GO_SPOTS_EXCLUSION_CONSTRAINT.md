# Locora — Reservation GiST exclusion constraint

**Date:** 2026-07-21 (DDL shipped) / 2026-07-22 (operator checklist **CONCUR7-residual-docs**)  
**Status:** **Implemented (ship bar)** — migration on disk + **applied on Neon** (18-folder deploy 2026-07-21); app lock + overlap asserts aligned. Live Docker concurrency proof = operator residual (see [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md)).  
**Bible:** §7 P0 reservation/session concurrency — **DONE** (app belt + DB belt); live C1/C2 **OPERATOR**.  
**Lanes:** **WWWWWW-exclusion-done** (code/migrate), **HHHHHH-concurrency-live** (util bodies), **CONCUR7-residual-docs** (honest residual + gates).

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Code (done)** | `withResourceBookingLock` + half-open overlap asserts; migration `20260721060000_reservation_resource_exclusion`. |
| **Neon (done 2026-07-21)** | Preflight `pnpm detect:reservation-overlaps` = **0** → `migrate deploy` applied constraint. |
| **Post-ship (operator)** | Optional: run live C1/C2 on **local Docker** — [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) Gates 0–3. **Never** point live concurrency tests at Neon. |
| **Future (optional)** | Extend exclusion or add policy for walk-in `PlaySession` ↔ reservation races (C4). |

---

## Problem (bible §7 / legacy #4)

Two concurrent booking attempts for the same `resourceId` and overlapping time window can both pass an application-level “slot free” check if their transactions interleave before either commits. The deep audit flagged this as P0 double-book risk.

**Defense in depth (shipped):**

| Layer | Mechanism |
|-------|-----------|
| App lock | `withResourceBookingLock` → `SELECT … FOR UPDATE` on `Resource` inside `$transaction` |
| App assert | `assertBookingSlotFree` / `booking-overlap.util.ts` — half-open `[)` interval semantics |
| DB belt | GiST `EXCLUDE` on `(resourceId, tsrange(startsAt, endsAt, '[)'))` for active statuses |
| Error map | Postgres `23P01` (exclusion violation) → HTTP 409 under booking lock path |
| Detect | `pnpm detect:reservation-overlaps` — post-hoc audit CLI (SQL matches constraint) |

---

## DDL (shipped migration)

File: `apps/api/prisma/migrations/20260721060000_reservation_resource_exclusion/migration.sql`

- Requires `btree_gist` extension.
- Uses **`tsrange`** on Prisma `timestamp(3)` columns (not `tstzrange` — avoids `42P17` immutability issues with session timezone).
- Partial index predicate: `resourceId IS NOT NULL` AND `status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')`.
- Constraint name: `Reservation_resource_tstzrange_excl`.

**Preflight (mandatory before first apply on any DB):**

```bash
pnpm --filter @gospots/api run detect:reservation-overlaps
# must exit 0 — ALTER fails if overlapping active pairs exist
```

---

## Coverage boundaries (honest)

| Scenario | Covered by exclusion? | Mitigation today |
|----------|----------------------|------------------|
| Reservation ↔ reservation (same resource, overlapping slot) | **Yes** | App lock + EXCLUDE |
| Staff create vs public book (same slot) | **Yes** | Same paths use booking lock |
| Walk-in `PlaySession` ↔ reservation | **No** | App `FOR UPDATE` on resource only — optional C4 in concurrency doc |
| Walk-in ↔ walk-in same unit | **No** | App lock path on play-session create |
| Cross-resource / dining table groups | **No** | Out of v1 exclusion scope |

Do **not** claim walk-in floor occupancy is DB-enforced by this constraint.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| GiST EXCLUDE migration on disk | **DONE** | `20260721060000_reservation_resource_exclusion` |
| Neon migrate applied | **DONE** | 18-folder deploy 2026-07-21; overlaps preflight = **0** |
| App lock + overlap assert + `23P01`→409 | **DONE** | `booking-lock.util.ts`, `booking-overlap.util.ts` (+specs) |
| Overlap detect CLI | **DONE** | `reservation-overlap-detect.util.ts` |
| Unit specs (lock + overlap SQL) | **DONE** | jest booking-lock + reservation-overlap-detect **11** PASS |
| Live Docker C1/C2 concurrency proof | **OPERATOR** | Gates 0–3 [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |
| Walk-in PlaySession in exclusion | **RESIDUAL** | Future app lane / optional C4 |
| CI Postgres concurrency job | **RESIDUAL** | Not wired; optional post-ship |

**Verify (at ship time):** jest booking-lock + overlap-detect PASS; `pnpm detect:reservation-overlaps` = **0** on production after migrate.

---

## Operator verify checklist (post-migrate)

Use after Neon has applied `20260721060000_reservation_resource_exclusion`. These are **read-only** sanity checks — not a substitute for live C1/C2.

### Gate 0 — Constraint present

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'Reservation_resource_tstzrange_excl';
```

Expect one row with `EXCLUDE USING gist`.

### Gate 1 — No active overlaps

```bash
pnpm --filter @gospots/api run detect:reservation-overlaps
```

Must exit **0**. Re-run after bulk imports or manual SQL edits.

### Gate 2 — Manual smoke (when Render resumed)

From [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) §2: public book same slot → second attempt **409**, not double row.

### Gate 3 — Optional live concurrency (local Docker only)

See [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) Gates 0–3 — C1 public + C2 staff double-book recipes.

---

## Relationship to other docs

| Doc | Relationship |
|-----|--------------|
| [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) | Live C1–C3 recipes; Neon-refuse harness; operator Docker gates |
| [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md) | Matrix rows C1–C2 map to booking scenarios |
| [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md) | Notes walk-in still app-lock |
| [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) §7 | Canonical §7 status |
| [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) | Lane **WWWWWW** ship log |

*Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Status: [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) §7 · Operator: [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md)*
