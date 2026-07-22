# Locora — Live Postgres concurrency test suite

**Date:** 2026-07-21 (design + scaffold) / 2026-07-22 (operator checklist **CONCUR7-residual-docs**)  
**Status:** **Ship bar met** — app lock + GiST exclusion (#4 **DONE**); stock atomic paths (#5 **DONE**); opt-in harness + Neon-refuse + **live C1–C3 util/lock bodies on disk** (Lanes **XXX**, **HHHHHH**). **Live proof = operator residual** (local Docker only).  
**Bible:** **#2** (automated testing — **DONE** via Lane **GGGGGG** + live bodies **HHHHHH**), **#4** (booking concurrency — **DONE**), **#5** (inventory oversell — **DONE**).  
**Ship timing:** Run with local Docker / ephemeral only (`RUN_CONCURRENCY_TESTS=1`; **not** Neon from `.env`).  
**#2 ship bar (Lane GGGGGG + HHHHHH):** API unit suite + CI + opt-in concurrency scaffold + util/lock C1–C3 bodies. Nest service wrappers optional residual.  
**#5 ship bar (Lane BBBBBB + HHHHHH):** conditional stock SQL + atomic SALE + claim-before-delete/cancel + unit race specs + live C3 util body.  
**Exclusion DDL:** [`GO_SPOTS_EXCLUSION_CONSTRAINT.md`](./GO_SPOTS_EXCLUSION_CONSTRAINT.md) — applied on Neon 2026-07-21.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| App booking lock (`FOR UPDATE`) + overlap asserts | **DONE** | `booking-lock.util.ts`, `booking-overlap.util.ts` (+specs) |
| GiST EXCLUDE on active reservations | **DONE** on disk + Neon | `20260721060000_reservation_resource_exclusion` |
| Conditional stock decrement + claim-before-delete | **DONE** | `menu-stock-db.util.ts`, `shop-order-stock.util.ts` (+specs) |
| Concurrency skip gate + Neon-refuse harness | **DONE** | `test/concurrency/concurrency.harness.ts`, gate unit specs |
| Live C1/C2/C3 util/lock bodies (`Promise.allSettled`) | **DONE** on disk | `booking-double-book.spec.ts`, `stock-last-unit.spec.ts`, fixtures |
| Default `pnpm test` unchanged (mock-only) | **DONE** | Dedicated `jest-concurrency.json` |
| Operator live Docker run (C1–C3 green) | **OPERATOR** | Gates 0–3 below — **not started** until local Postgres up |
| Nest service-level C1–C3 wrappers | **RESIDUAL** (optional) | Util path sufficient for ship bar |
| Walk-in PlaySession ↔ reservation (C4) | **RESIDUAL** (optional) | Exclusion does not cover walk-ins |
| CI Postgres concurrency job | **RESIDUAL** | Not wired; optional post-ship |

**Verify (no local Docker):** `pnpm test:concurrency` → gate **6** PASS; live describes **skipped**.

**Verify (with local Docker):** Gates 0–3 below → C1 + C2 + C3 all **PASS**.

---

## Operator cutover checklist (live Docker C1–C3)

Use when you want **proactive** proof that two real Postgres connections cannot double-book or oversell last unit. **Not required** for §37 code ship bar (unit specs + exclusion on Neon already met). **Never** run against production Neon — harness refuses Neon URLs from `.env`.

### Gate 0 — Local Postgres + migrations

- [ ] Local Docker Postgres (or throwaway ephemeral DB) — **not** Neon production/branch from committed `.env`.
- [ ] `DATABASE_URL` points at local instance (e.g. `postgresql://gospots:gospots_dev@127.0.0.1:5432/gospots?schema=public`).
- [ ] `pnpm --filter @gospots/api migrate:deploy` applied once on that DB (includes exclusion migration).

### Gate 1 — Opt-in flag

- [ ] `export RUN_CONCURRENCY_TESTS=1` (or set in `apps/api/.env` — do not commit).
- [ ] Confirm harness does **not** refuse URL (Neon hostnames are blocked).

### Gate 2 — Run suite

```bash
cd apps/api
export RUN_CONCURRENCY_TESTS=1
export DATABASE_URL='postgresql://…local…'
pnpm test:concurrency
```

Expect: gate specs **PASS**; C1 public double-book **PASS**; C2 staff double-book **PASS**; C3 last-unit stock **PASS**.

### Gate 3 — Post-run sanity (long-lived dev DB only)

- [ ] `pnpm detect:reservation-overlaps` exit **0** after C1/C2 runs (see [`GO_SPOTS_EXCLUSION_CONSTRAINT.md`](./GO_SPOTS_EXCLUSION_CONSTRAINT.md)).

---

## Why this exists

The deep audit and implementation report flagged P0 race domains:

| Risk | Mitigation shipped | What mocks cannot prove |
|------|-------------------|-------------------------|
| **Double-book** same `resourceId` + overlapping slot | `withResourceBookingLock` → `SELECT … FOR UPDATE` + overlap asserts ([`booking-lock.util.ts`](../../apps/api/src/common/booking-lock.util.ts)) | Two real DB connections interleaving check+insert |
| **Oversell** last menu unit | `adjustMenuItemStockBy` conditional `UPDATE … WHERE stock >= delta` inside `$transaction` with SALE row ([`menu-stock-db.util.ts`](../../apps/api/src/common/menu-stock-db.util.ts), [`finance.service.ts`](../../apps/api/src/modules/finance/finance.service.ts)) | Parallel decrements on `stock = 1` from separate connections |

Today:

- **51 Jest suites / 352 unit tests** — including mocked lock ordering (`booking-lock.util.spec.ts`) and conditional stock SQL (`menu-stock-db.util.spec.ts`).
- **Zero** tests hit a live Postgres with concurrent writers.
- Overlap **detection** exists (`pnpm detect:reservation-overlaps`); exclusion constraint migration **applied on Neon**.

This suite closes the gap between “lock helper unit tests pass” and “two HTTP clients cannot corrupt prod data.”

---

## Scope (v1)

| # | Scenario | Entry point | Pass criteria |
|---|----------|-------------|---------------|
| **C1** | Public gaming book — same slot | `ReservationsService.createPublicGamingBooking` (or `POST /api/v1/public/.../gaming-reservations`) | Exactly **1** success among **N** parallel attempts; others `409 Conflict`; active overlap count **0** for fixture window |
| **C2** | Staff reservation create — same slot | `ReservationsService.create` with `resourceId` | Same as C1 |
| **C3** | Quick SALE — last unit | `FinanceService.createTransaction` (`kind: SALE`, qty 1) | Exactly **1** success; final `MenuItem.stock === 0`; no row with `stock < 0`; SALE count for fixture item **≤ 1** (or equals successes) |
| **C4** *(optional v1.1)* | Walk-in + reservation same unit | `createPlaySession` + `createPublicGamingBooking` in parallel | At most one ACTIVE occupant of slot (reservation **or** walk-in) |

**Out of v1:** Playwright browser races, multi-instance cron, webhook replay, order-line patch races, exclusion-constraint DDL verification (separate rollout in [`GO_SPOTS_EXCLUSION_CONSTRAINT.md`](./GO_SPOTS_EXCLUSION_CONSTRAINT.md)).

---

## Architecture choice: service-level integration first

Prefer **Nest service + real `PrismaClient`** over full HTTP for v1:

| Approach | Pros | Cons |
|----------|------|------|
| **Service + Prisma** (recommended) | No throttling/CORS/CSRF noise; fast fixture; hits same `$transaction` + `FOR UPDATE` paths | Skips controller validation layer (covered by existing unit tests) |
| **Supertest / HTTP** (v1.1) | End-to-end request path | Public routes hit `publicThrottle()`; needs published shop + slug; slower |

HTTP layer can be added later as a thin wrapper once service tests are green on a branch DB.

---

## File layout (scaffold shipped — Lane XXX)

```
apps/api/
  test/
    jest-concurrency.json
    concurrency/
      setup-env.ts                # TZ only
      concurrency.harness.ts      # skip gate + describeConcurrency
      concurrency-gate.spec.ts    # unit tests for the gate (no DB)
      booking-double-book.spec.ts # C1 + C2 live util/lock (skipped unless opted in)
      stock-last-unit.spec.ts     # C3 live util/lock (skipped unless opted in)
  package.json                    # script: test:concurrency
```

**Live recipes shipped (Lane HHHHHH):** fixtures + C1–C3 util/lock `Promise.allSettled` bodies. Nest service-level wrappers remain **optional** residual.

**Naming:** specs under `test/concurrency/**/*.spec.ts` with a dedicated Jest config so default `pnpm test` (`rootDir: src`) stays mock-only and fast.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **`DATABASE_URL`** | Real Postgres (local Docker, Neon **branch**, or ephemeral CI service). **Not** the CI placeholder used for `prisma generate`. |
| **Migrations applied** | `pnpm migrate:deploy` (or `prisma migrate dev` on a throwaway DB). **Never** `prisma migrate reset` on shared/prod. |
| **Opt-in flag** | `RUN_CONCURRENCY_TESTS=1` **or** non-placeholder `DATABASE_URL` + explicit npm script — tests **skip** with a clear message when unset (same pattern as Playwright smoke skipping without Next). |

```env
# Local example (apps/api/.env — do not commit secrets)
DATABASE_URL=postgresql://gospots:gospots_dev@127.0.0.1:5432/gospots?schema=public
RUN_CONCURRENCY_TESTS=1
```

---

## Harness sketch

### Skip gate

```typescript
const enabled =
  process.env.RUN_CONCURRENCY_TESTS === '1' &&
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes('@localhost:5432/ci');

describe.skipIf(!enabled)('booking double-book (live Postgres)', () => {
  // ...
});
```

Use `describe.skip` / conditional wrapper so CI unit job without Postgres stays green.

### Prisma client

- One `PrismaClient` per worker file; disconnect in `afterAll`.
- **`--runInBand`** for concurrency specs (serial files, parallel attempts *inside* each test) to avoid fixture shops stomping each other when Jest uses multiple workers.

### Fixture prefix

- Create an isolated shop per test: slug `concurrency-${randomUUID().slice(0, 8)}`, `isPublished: true`.
- One `Resource` (`status: AVAILABLE`), one tracked `MenuItem` with `stock: 1`, `trackStock: true`.
- Minimal `Subscription` / membership so `assertShopFeature` and finance gates pass (mirror seed shapes from `prisma/seed.ts`).
- Opening-hours exception or weekly row so `assertWithinOpeningHours` accepts the fixture slot (fixed UTC window far in the future, e.g. `2030-06-01T14:00:00Z`–`16:00:00Z`).

### Cleanup

- `afterEach` / `afterAll`: delete by `shopId` (cascade where schema allows) or delete child rows then shop.
- **Do not** rely on transaction rollback across concurrent connections — each attempt commits independently.

### Actor helper

Build a minimal `JwtAccessPayload` for finance/reservation staff paths (`shopId`, `sub`, `perms` string with `transaction.write`, `reservation.write`).

---

## Test recipes

### C1 — Public double-book (`Promise.all`)

```typescript
const N = 20;
const dto = {
  resourceId,
  guestName: 'Race Guest',
  guestEmail: 'race@example.com',
  partySize: 2,
  startsAt: '2030-06-01T14:00:00.000Z',
  endsAt: '2030-06-01T16:00:00.000Z',
};

const results = await Promise.allSettled(
  Array.from({ length: N }, (_, i) =>
    reservations.createPublicGamingBooking(shop.slug, {
      ...dto,
      guestEmail: `race-${i}@example.com`,
    }, 'gaming'),
  ),
);

const fulfilled = results.filter((r) => r.status === 'fulfilled');
const rejected = results.filter((r) => r.status === 'rejected');
expect(fulfilled).toHaveLength(1);
expect(rejected.length).toBe(N - 1);
// All rejects should be ConflictException (409) — not 500
for (const r of rejected) {
  expect(r.reason?.status ?? r.reason?.getStatus?.()).toBe(409);
}

// DB invariant: at most one active reservation on resource for window
const active = await prisma.reservation.count({
  where: {
    resourceId,
    status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
    startsAt: { lt: new Date(dto.endsAt) },
    endsAt: { gt: new Date(dto.startsAt) },
  },
});
expect(active).toBe(1);
```

**Why `Promise.allSettled`:** `Promise.all` fails fast on first rejection and hides how many losers ran; we need counts.

**Why distinct emails:** avoids unique constraint collisions if any exist on guest email per shop.

### C3 — Last-unit stock (`Promise.all`)

```typescript
const N = 15;
const dto = {
  kind: 'SALE' as const,
  method: 'CASH' as const,
  lines: [{ menuItemId, name: 'Race Cola', quantity: 1, unitPrice: 3.5 }],
};

const results = await Promise.allSettled(
  Array.from({ length: N }, () => finance.createTransaction(actor, dto)),
);

expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
expect(results.filter((r) => r.status === 'rejected')).toHaveLength(N - 1);

const row = await prisma.menuItem.findUniqueOrThrow({ where: { id: menuItemId } });
expect(row.stock).toBe(0);
expect(row.stock).toBeGreaterThanOrEqual(0);

const saleCount = await prisma.transaction.count({
  where: { shopId, kind: 'SALE', lines: { some: { menuItemId } } },
});
expect(saleCount).toBe(1);
```

Re-run detection script on the shop after C1 if exercising many booking tests against a long-lived dev DB.

---

## npm scripts (target)

Add to `apps/api/package.json`:

```json
{
  "scripts": {
    "test:concurrency": "jest --config ./test/jest-concurrency.json --runInBand --passWithNoTests"
  }
}
```

`test/jest-concurrency.json` (config lives under `test/`, so `rootDir` is that folder):

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testMatch": ["<rootDir>/concurrency/**/*.spec.ts"],
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "testEnvironment": "node",
  "setupFiles": ["<rootDir>/concurrency/setup-env.ts"]
}
```

**Operator run (post-impl):**

```bash
cd apps/api
export DATABASE_URL='postgresql://…'
export RUN_CONCURRENCY_TESTS=1
pnpm migrate:deploy   # once per DB
pnpm test:concurrency
```

Root convenience (optional later): `pnpm --filter @gospots/api test:concurrency`.

---

## CI strategy (optional, post-Friday)

| Phase | When | Behavior |
|-------|------|----------|
| **0** | **Now / Friday** | Not in CI. Default `pnpm test` remains mock-only. Document in [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) as post-submit hardening. |
| **1** | Post-submit | Optional workflow job `concurrency` with `services: postgres:16` + `migrate deploy` + `RUN_CONCURRENCY_TESTS=1`. Job **allowed to fail** initially (`continue-on-error: true`) until flakes are zero. |
| **2** | Pre exclusion constraint | Make job **required** on `main`; pair with `pnpm detect:reservation-overlaps` exit 0 on staging. |
| **3** | Neon branch per PR | Use Neon branch URL secret for PR concurrency job (avoids Docker Postgres drift from prod extensions). |

**Never** point CI concurrency tests at production Neon. Use ephemeral DB or branch.

CI snippet sketch (not wired):

```yaml
concurrency-tests:
  if: github.event_name == 'pull_request' && vars.RUN_CONCURRENCY_CI == 'true'
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: ci
        POSTGRES_PASSWORD: ci
        POSTGRES_DB: gospots
      ports: ['5432:5432']
  steps:
    - uses: actions/checkout@v4
    # … pnpm install, prisma generate …
    - run: pnpm migrate:deploy
      working-directory: apps/api
      env:
        DATABASE_URL: postgresql://ci:ci@localhost:5432/gospots?schema=public
    - run: pnpm test:concurrency
      working-directory: apps/api
      env:
        DATABASE_URL: postgresql://ci:ci@localhost:5432/gospots?schema=public
        RUN_CONCURRENCY_TESTS: '1'
```

---

## Relationship to other work

| Doc / tool | Relationship |
|------------|--------------|
| [`GO_SPOTS_EXCLUSION_CONSTRAINT.md`](./GO_SPOTS_EXCLUSION_CONSTRAINT.md) | Run overlap detect → **0** before DDL; step 7 of rollout is “add concurrency integration test” — this doc is that test spec. |
| [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md) | Items **C1–C2** (booking) and **C3** (stock) map directly to matrix rows 79–80. |
| [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) | Pooled RLS tests reuse the same harness pattern (session var + parallel tenants). |
| Lane **QQ** Playwright smoke | Orthogonal — browser smokes do not replace DB races. |
| `detect:reservation-overlaps` | Post-run sanity on long-lived dev DBs; not a substitute for proactive race tests. |

---

## Failure interpretation

| Symptom | Likely cause |
|---------|--------------|
| **>1 fulfilled** booking | Lock not taken on path under test; overlap assert bypass; check `withResourceBookingLock` wraps create |
| **0 fulfilled** | Fixture hours/horizon rejection; shop not published; feature gate |
| **>1 fulfilled** stock | Decrement not in same txn as SALE; missing `shopId` on `adjustMenuItemStockBy`; pre-check without conditional UPDATE |
| **Flakes** | Shared shop slug across tests; Jest workers without `--runInBand`; clock skew on `startsAt` |
| **Timeouts** | `maxWait` / `timeout` on booking txn too low for N=20 — increase for test env only |

---

## Phased implementation checklist

1. ~~Add `test/concurrency/concurrency.harness.ts` (skip gate) + `test:concurrency`.~~ **Done (Lane XXX)** — gate + live bodies (**HHHHHH**).
2. ~~Implement **C3** first~~ **Done (util path)** — operator Gate 2 above.
3. ~~Implement **C1** public double-book.~~ **Done (util path)**.
4. ~~Add **C2** staff create.~~ **Done (util path)**.
5. Document operator run — **Done (CONCUR7-residual-docs)** — Gates 0–3 above.
6. Optional: Neon **branch** (not prod) before enabling CI job.
7. Optional **C4** walk-in vs reservation.
8. Optional Supertest variant for public HTTP + throttle disabled in test env only.

**Ship bar:** unit specs + exclusion on Neon + opt-in harness + util bodies on disk. **Operator residual:** Gate 2 green on local Docker. **Not CI-gated.**

---

## Files

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_CONCURRENCY_TESTS.md` | Design + operator Gates 0–3 + shipped vs residual |
| `docs/audit/GO_SPOTS_EXCLUSION_CONSTRAINT.md` | GiST exclusion DDL + operator verify Gates 0–3 |
| `apps/api/test/concurrency/**` | Lane XXX harness + gate; Lane **HHHHHH** fixtures + C1–C3 util/lock bodies |
| `apps/api/test/jest-concurrency.json` | Dedicated Jest config |
| `apps/api/package.json` | `test:concurrency` script |
| `apps/api/.env.example` | `RUN_CONCURRENCY_TESTS` comment |
| `docs/audit/BIBLE_STATUS.md` | #2 **DONE**; #4/#5 **DONE** (OPERATOR local Docker run residual) |
| `docs/audit/BIBLE_FINISHED.md` | Lane CCC + XXX + **GGGGGG** + **HHHHHH** |
| `docs/audit/AGENT_COORDINATION.md` | Lanes CCC / XXX / GGGGGG / HHHHHH |

**Verify (scaffold / no Neon):**

```bash
cd apps/api
pnpm test:concurrency
# expect: concurrency-gate.spec PASS; booking/stock describes skipped
```

*Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) #2 #4 #5 · Finished log: [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) · Operator: [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md)*
