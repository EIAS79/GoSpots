# GoSpots — Performance residual plan (Bible §35)

**Date:** 2026-07-22 (residual docs lane **PERF35-residual-docs**)  
**Status:** Index inventory + Node smoke script ship bar **DONE** (Lane **PERF35-light**). **Phase 0** N+1/pagination inventory **DONE** (Lane **PERF35-phase0-inventory** — [`artifacts/perf/n1-pagination-inventory.md`](./artifacts/perf/n1-pagination-inventory.md)). **Phase 1** k6 public read stub **DONE** (Lane **PERF35-k6-stub** — [`perf-read-smoke.js`](../../apps/api/scripts/perf-read-smoke.js)). **Phase 2** k6 write/contention stub **PARTIAL** (Lane **PERF35-k6-write-stub** — gated [`perf-write-smoke.js`](../../apps/api/scripts/perf-write-smoke.js); staff create + finance-under-write **residual**). Staff read mix, live EXPLAIN snapshots, Phase 3 query fixes, and CI perf gate remain **explicitly deferred** — phased plan below. **Do not claim production load-tested until Phases 1–2 exit.**  
**Bible:** P2 **§35** — performance review.  
**Script:** [`apps/api/scripts/perf-smoke.mjs`](../../apps/api/scripts/perf-smoke.mjs)

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Index inventory note (known hot paths) | **DONE** | This doc § Known indexes |
| Runnable smoke for `/api/v1/ready` | **DONE** | `pnpm perf:smoke`; exits non-zero if ready fails |
| Public read hotspot stub | **DONE** | Sequential p50/p95 on `GET /api/v1/public/venues` (`WARN` only on hotspot fail) |
| GiST reservation overlap exclusion | **DONE** | migration `20260721060000_reservation_resource_exclusion` |
| Core `shopId` / list-scan indexes | **DONE** | `schema.prisma` (reservations, orders, finance, chat, menu, …) |
| Booking overlap preflight CLI | **DONE** | `pnpm detect:reservation-overlaps` |
| k6 / Artillery / sustained load matrix | **PARTIAL** (Phase 1 read + Phase 2 write stub) | k6 read [`perf-read-smoke.js`](../../apps/api/scripts/perf-read-smoke.js); gated write [`perf-write-smoke.js`](../../apps/api/scripts/perf-write-smoke.js); staff reads + staff/finance write mix **residual** |
| Systematic N+1 / pagination inventory artifact | **DONE** (Phase 0) | [`artifacts/perf/n1-pagination-inventory.md`](./artifacts/perf/n1-pagination-inventory.md) — **0 HIGH** remaining (was 6; play billing + schedule **PARTIAL** Lanes **PERF35-play-billing-page** / **PERF35-schedule-take**; notification badges **FIXED** Lane **PERF35-notif-badges**; dashboard analytics **PARTIAL FIXED** Lane **PERF35-dashboard-analytics**) |
| Dashboard analytics take caps | **PARTIAL FIXED** (Phase 3) | Lane **PERF35-dashboard-analytics** — `FINANCE_ANALYTICS_ROW_TAKE` (5000) on all analytics `findMany`; `Logger.warn` + optional `summary.analyticsTruncatedSources`; SQL aggregation **residual** |
| Play billing list pagination | **PARTIAL FIXED** (Phase 3) | Lane **PERF35-play-billing-page** — bounded `take` (500/source), default 30-day window, tab SQL push-down, `count()` totals |
| Schedule day reservation/walk-in take caps | **PARTIAL** (Phase 3) | Lane **PERF35-schedule-take** — `SCHEDULE_DAY_QUERY_TAKE` (2000) + `Logger.warn` on cap hit; category `select` trim **DONE** (Lane **PERF35-schedule-select**) |
| Notification badge/tab-read SQL aggregation | **DONE** (Phase 3 partial) | Lane **PERF35-notif-badges** — `count` + tab-filtered `updateMany` |
| Staff menu full load take caps | **FIXED** (Phase 3) | Lane **PERF35-menu-take** — `MENU_SECTION_TAKE` (200), `MENU_TAG_TAKE` (200), `MENU_ITEM_TAKE` (2000) on `getFullMenu`; `Logger.warn` on cap hit; `{ sections, tags, items }` shape unchanged |
| Live `EXPLAIN (ANALYZE, BUFFERS)` snapshots | **RESIDUAL** | Top-5 staff reads flagged **needs operator EXPLAIN** in artifact; no plans checked in |
| CI perf job (ephemeral API smoke or load) | **RESIDUAL** | No `api-perf-*` job in `.github/workflows/ci.yml` |
| Multi-instance scale-out load test | **RESIDUAL** | In-process SSE/cron/throttle maps — see [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md) |
| Ledger-read analytics profiling | **RESIDUAL** | `LEDGER_READS` day-bucket queries not profiled |
| Walk-in `PlaySession` race load | **RESIDUAL** | Exclusion covers reservation↔reservation only — [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |

**§35 classification:** **PARTIAL** — light smoke ship bar met; full load suite and query audit residuals documented here, not hidden.

---

## Ship bar (Lane PERF35-light)

| In scope (DONE) | Explicit residual |
|-----------------|-------------------|
| Index inventory for highest-risk query shapes | Full schema index audit |
| `perf:smoke` sequential p50/p95 on `/ready` + public venues | Concurrent writers + POST storms |
| Non-zero exit if readiness probe fails | SLO thresholds enforced in CI |
| Hotspot stub logs `WARN` only (does not fail exit) | Hotspot failures fail merge bar |
| Document prod dependency (DB ping in `/ready`) | Staging/prod load baselines checked in |

---

## Known indexes (already in repo)

These cover the highest-risk query shapes called out in the audit — **not** a full schema audit.

| Domain | Coverage | Evidence |
|--------|----------|----------|
| **Booking overlap** | GiST `EXCLUDE` on `(resourceId, tsrange(startsAt, endsAt))` for active statuses | migration `20260721060000_reservation_resource_exclusion` |
| **Reservation lists** | `(shopId, startsAt)` for day/agenda scans | `schema.prisma` `Reservation` |
| **Tenant scope** | `@@index([shopId])` / `(shopId, …)` on core shop-scoped tables (orders, chat, menu, resources, finance, etc.) | `schema.prisma` |
| **Play billing / finance** | `(shopId, status, createdAt)` on orders; `(shopId, currency, billedAt)` on reservations | `schema.prisma` |
| **Guest tokens** | unique `guestTokenHash` (lookup by hash, not plaintext scan) | `schema.prisma` |
| **Idempotency / mail** | `(shopId, scope, key)` unique; outbox `(status, nextAttemptAt)` | `schema.prisma` |

**Preflight:** overlapping active reservations must be zero before exclusion DDL applies — `pnpm detect:reservation-overlaps`.

---

## What exists today (code truth)

### Automated perf tooling

| Piece | Role | Limit |
|-------|------|-------|
| `apps/api/scripts/perf-smoke.mjs` | Node fetch loop; p50/p95 per URL | **Sequential** — no concurrency, no writes |
| `apps/api/scripts/perf-read-smoke.js` | k6 ramping-VU read mix (`/ready` + public venues) | Requires **k6 CLI** installed locally; not in CI |
| `apps/api/scripts/perf-write-smoke.js` | k6 gated POST storm (public gaming booking create) | **Opt-in** (`PERF_WRITE_SMOKE=1`); **destructive** — staging/local throwaway shop only; default no-op |
| `apps/api/package.json` → `perf:smoke` | Local / operator entry | Requires API + Postgres up |
| `apps/api/package.json` → `perf:k6` | k6 wrapper (`k6 run scripts/perf-read-smoke.js`) | Same; fails if `k6` not on PATH |
| `apps/api/package.json` → `perf:k6:write` | k6 write stub wrapper | Same; **no writes** unless `PERF_WRITE_SMOKE=1` + slug + resource id |
| Root `package.json` → `perf:smoke` | Monorepo shortcut | Same constraints |
| `.github/workflows/ci.yml` | api/web/migrate gates | **No** perf job today |

### What smoke actually measures

| Target | Handler shape | DB? |
|--------|---------------|-----|
| `GET /api/v1/ready` | `HealthController` → `SELECT 1` | Yes |
| `GET /api/v1/public/venues` | Public directory + review stats aggregation | Yes |

**Not measured today:** staff schedule reads, finance list panels, notification inbox, public booking POST, concurrent reservation writers, SSE fan-out, cron/mail worker contention.

### Index / concurrency evidence (not load-tested)

| Area | On disk | Gap |
|------|---------|-----|
| Reservation overlap | GiST EXCLUDE + app `FOR UPDATE` lock | No sustained concurrent booking POST load |
| Walk-in play | App lock only (no exclusion) | C4 race optional — [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |
| Stock | Conditional SQL in `menu-stock-db.util.ts` | No menu-order storm profile |
| Tenant lists | `shopId` indexes widespread | Phase 0 inventory catalogued offenders — [`artifacts/perf/n1-pagination-inventory.md`](./artifacts/perf/n1-pagination-inventory.md) |

---

## Residual risks (honest)

- **Load suite partial:** Node `perf-smoke` is sequential; k6 read stub adds concurrent public GETs; k6 write stub adds **opt-in** public gaming POST contention — staff paths + finance-under-write not covered yet.
- **N+1 not catalogued:** ~~list endpoints~~ **Phase 0 inventory DONE** — see [`artifacts/perf/n1-pagination-inventory.md`](./artifacts/perf/n1-pagination-inventory.md) (**6 HIGH**); fixes deferred Phase 3.
- **Walk-in PlaySession:** exclusion constraint covers reservation↔reservation only; walk-in races still rely on app-level `FOR UPDATE`.
- **Analytics / ledger reads:** heavy day-bucket queries when `LEDGER_READS` is enabled — not profiled here.
- **Multi-instance:** SSE, cron, throttling maps are in-process; scale-out behavior not load-tested — [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md).
- **Prod dependency:** `/ready` includes a DB ping; local smoke needs Postgres + API up (Render suspend → 503 until Resume).

---

## Why full load suite is deferred

| Constraint | Detail |
|------------|--------|
| Ephemeral DB in CI | Meaningful load needs seeded shop + reservations + finance rows — not wired in Actions today |
| Write scenarios need auth | Staff schedule/finance routes need cookie JWT + venue bind + permission matrix |
| CAPTCHA / throttles | Public booking POST under load triggers abuse gates — [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) |
| Render suspend | Staging/prod baselines blocked until operator Resume — [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) |
| Cost / flake | k6 at realistic VUs against Neon + Render is operator-scheduled, not PR-default |

**Interim:** run `pnpm perf:smoke` for quick sequential checks; run `pnpm perf:k6` (k6 CLI required) for concurrent public read baseline; spot-check slow staff pages manually. Staff read mix + write scenarios remain Phase 2+.

---

## Phased residual plan

### Phase 0 — Query audit baseline — **DONE** (inventory; EXPLAIN operator follow-up)

| Work | Status | Evidence |
|------|--------|----------|
| **N+1 + pagination inventory** | **DONE** | [`artifacts/perf/n1-pagination-inventory.md`](./artifacts/perf/n1-pagination-inventory.md) — 24 hotspot rows; **6 HIGH** unbounded / in-memory pagination offenders |
| **Top-5 staff read EXPLAIN** | **RESIDUAL (operator)** | Same artifact § EXPLAIN candidates — **needs operator EXPLAIN** on seeded shop; no live DB in lane |
| **Service fixes** | **Deferred Phase 3** | No `apps/**` edits in Phase 0 lane |

**Exit (met):** Markdown table of ≥5 hot reads with risk tier, `take`/cursor status, N+1 yes/no, suggested fix; pagination offenders listed. Live query plans optional follow-up before Phase 3 index work.

### Phase 1 — Read load scenarios — **PARTIAL** (k6 read stub **DONE**; staff mix + baselines **residual**)

| Work | Status | Evidence |
|------|--------|----------|
| **Tooling choice** | **DONE** (k6) | [`apps/api/scripts/perf-read-smoke.js`](../../apps/api/scripts/perf-read-smoke.js) + `pnpm perf:k6` |
| **Public read mix** | **DONE** (stub) | `GET /ready`, `GET /public/venues`, optional `GET /public/venues/:slug` |
| **Staff read mix** | **RESIDUAL** | Authenticated schedule + notifications (fixture shop + JWT) |
| **Profile** | **DONE** (defaults) | 10 VUs ramp 30s → 2m steady (env-tunable); thresholds p95 &lt; 500 ms |
| **SLO draft** | **DONE** (doc) | [`artifacts/perf/k6-read-smoke-baseline.md`](./artifacts/perf/k6-read-smoke-baseline.md) — operator fills numbers |
| **CI perf job** | **RESIDUAL** | Phase 4 — no k6 in `.github/workflows/ci.yml` |

**Exit (partial):** One runnable read scenario + runbook **met**; baseline numbers + staff read mix remain operator/future lane.

### Phase 2 — Write / contention scenarios — **PARTIAL** (gated k6 write stub **DONE**; staff/finance **residual**)

| Work | Status | Evidence |
|------|--------|----------|
| **Public gaming booking POST** | **DONE** (gated stub) | [`perf-write-smoke.js`](../../apps/api/scripts/perf-write-smoke.js) + `pnpm perf:k6:write`; baseline [`artifacts/perf/k6-write-smoke-baseline.md`](./artifacts/perf/k6-write-smoke-baseline.md) |
| **Staff reservation create** | **RESIDUAL** | Needs cookie JWT + venue bind + permission matrix |
| **Finance list under write** | **RESIDUAL** | Play-billing mark-paid while list poll (staff panel pattern) |
| **Optional C4** | **RESIDUAL** | Walk-in vs reservation race — [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |
| **Abuse awareness** | **DONE** (doc + script notes) | `CAPTCHA_PROVIDER=off` or `PERF_CAPTCHA_TOKEN`; throttle limits documented — [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) |

**Exit (partial):** One runnable **opt-in** public write scenario + runbook **met**; operator baseline numbers + staff/finance write paths remain future lane.

**Gate (mandatory):** `PERF_WRITE_SMOKE=1` **and** `PERF_VENUE_SLUG` **and** `PERF_RESOURCE_ID`. Without all three, `pnpm perf:k6:write` logs skip and performs **no POSTs**. Never point at production.

### Phase 3 — Fixes from audit (as needed)

| Work | Notes |
|------|--------|
| **N+1 fixes** | `select`/`include` trim or batch loaders on Phase 0 offenders |
| **Play billing list** | **PARTIAL FIXED** (Lane **PERF35-play-billing-page**) — bounded `take` (500/source), default 30-day window, tab SQL push-down, `count()` totals; merged two-source sort + slice |
| **Notification badges / tab-read** | **DONE** (Lane **PERF35-notif-badges**) — SQL tab predicates + `count` / `updateMany` |
| **Schedule day queries** | **PARTIAL FIXED** (Lanes **PERF35-schedule-take** + **PERF35-schedule-select**) — `SCHEDULE_DAY_QUERY_TAKE` (2000) on reservation + walk-in `findMany`; `Logger.warn` if cap hit; `SCHEDULE_CATEGORY_SELECT` replaces deep `include` on category tree (staff + public shared builder) |
| **Gallery list** | **FIXED** (Lane **PERF35-gallery-take**) — `GALLERY_LIST_TAKE` (200) on `GalleryService.list`; `Logger.warn` if cap hit; `{ coverImage, items }` shape unchanged |
| **Staff menu full load** | **FIXED** (Lane **PERF35-menu-take**) — `MENU_SECTION_TAKE` (200), `MENU_TAG_TAKE` (200), `MENU_ITEM_TAKE` (2000) on `MenuService.getFullMenu`; `Logger.warn` if cap hit; `{ sections, tags, items }` shape unchanged; daily stock reset still shop-wide SQL |
| **Dashboard analytics** | **PARTIAL FIXED** (Lane **PERF35-dashboard-analytics**) — `FINANCE_ANALYTICS_ROW_TAKE` (5000) on all analytics `findMany`; `Logger.warn` + optional `summary.analyticsTruncatedSources`; SQL day-bucket aggregation **residual** |
| **Pagination caps** | Default `take` + cursor on list APIs flagged in Phase 0 |
| **Missing indexes** | Only after EXPLAIN proves need — follow [`GO_SPOTS_MIGRATION_PLAN.md`](./GO_SPOTS_MIGRATION_PLAN.md) |
| **Ledger reads** | Profile analytics with `LEDGER_READS=on` before operator soak — [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) |

**Exit:** Phase 0 offenders either fixed or accepted with documented row-cap; Phase 1 p95 improves or SLO waived with reason.

### Phase 4 — CI perf gate (**RESIDUAL** until Phases 0–1 stable)

| Work | Notes |
|------|--------|
| **Ephemeral API job** | Actions service: Postgres + migrate + seed + `nest start` (mirror api test job) |
| **Smoke in CI** | `pnpm perf:smoke` against localhost — **non-blocking** first (`continue-on-error: true`) |
| **Optional k6 job** | Nightly or manual `workflow_dispatch`; not PR merge blocker initially |
| **Thresholds** | Ready p95 < 300 ms @ 50 sequential samples; 0% ready failures |
| **Hard gate (later)** | Fail PR when perf job runs and exceeds thresholds — after flake budget proven |

**Exit:** CI runs smoke against ephemeral API on every PR (even if non-blocking); documented path to blocking gate.

---

## How to run the smoke script

From repo root (API must be listening):

```bash
# Local default (adjust port if PORT=4000 in .env)
pnpm --filter @gospots/api run perf:smoke

# Custom target (staging / prod after Resume)
PERF_BASE_URL=https://gospots-api.onrender.com/api/v1/ready \
PERF_REQUESTS=100 \
pnpm --filter @gospots/api run perf:smoke

# Readiness only (skip public venues hotspot)
PERF_SKIP_HOTSPOT=1 pnpm --filter @gospots/api run perf:smoke
```

**Env**

| Variable | Default | Purpose |
|----------|---------|---------|
| `PERF_BASE_URL` | `http://127.0.0.1:3001/api/v1/ready` | Readiness URL (`HealthController` → DB `SELECT 1`) |
| `PERF_HOTSPOT_URL` | `{origin}/api/v1/public/venues` | Public directory list + review stats (DB-backed) |
| `PERF_REQUESTS` | `50` | Samples per target for p50/p95 |
| `PERF_SKIP_HOTSPOT` | off | Set `1` to skip hotspot |

**Exit codes:** non-zero if the first ready probe fails or any ready sample fails. Hotspot failures log `WARN` only (stub).

**Note:** Nest default `PORT` in `.env.example` is `4000`; set `PERF_BASE_URL=http://127.0.0.1:4000/api/v1/ready` when matching local dev.

---

## How to run the k6 read stub (Phase 1)

Install [k6](https://k6.io/docs/get-started/installation/) locally (Windows: `choco install k6`, macOS: `brew install k6`). **Not** required in CI.

From repo root (API + Postgres must be up):

```bash
# Local default (PORT=4000 in .env.example)
pnpm --filter @gospots/api run dev   # separate terminal

pnpm --filter @gospots/api run perf:k6

# Custom origin (staging / prod after Resume)
API_URL=https://gospots-api.onrender.com pnpm --filter @gospots/api run perf:k6

# Fixed venue slug (skip auto-pick from directory list)
API_URL=http://127.0.0.1:4000 PERF_VENUE_SLUG=demo-venue pnpm --filter @gospots/api run perf:k6

# Shorter smoke (5 VUs, 30s steady)
K6_VUS=5 K6_STEADY_DURATION=30s pnpm --filter @gospots/api run perf:k6

# Direct k6 invocation (no pnpm wrapper)
k6 run apps/api/scripts/perf-read-smoke.js
```

**Env**

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_URL` | `http://127.0.0.1:4000` | API origin (script appends `/api/v1/...`) |
| `PERF_BASE_URL` | — | Alias; may be full `/api/v1/ready` URL |
| `PERF_VENUE_SLUG` | auto from list | Slug for `GET /public/venues/:slug` |
| `K6_VUS` | `10` | Steady virtual users after ramp |
| `K6_RAMP_DURATION` | `30s` | Ramp-up duration |
| `K6_STEADY_DURATION` | `2m` | Hold at steady VUs |

**What it measures:** concurrent GETs on `/ready` (DB ping), public venue directory, and one venue profile when a slug is available. Default thresholds: error rate &lt; 1%, ready/venues p95 &lt; 500 ms (informational locally — not enforced in CI).

**Baseline artifact:** record p95/error rate in [`artifacts/perf/k6-read-smoke-baseline.md`](./artifacts/perf/k6-read-smoke-baseline.md) after operator runs.

**Not measured:** staff schedule/notifications, public schedule window, POST writes (see Phase 2 write stub), CAPTCHA/throttle behavior under load.

---

## How to run the k6 write stub (Phase 2 — **destructive / opt-in**)

**Default is safe:** `pnpm perf:k6:write` without env performs **no POSTs** (setup logs skip).

Install [k6](https://k6.io/docs/get-started/installation/) locally. Use a **throwaway seeded shop** on local or staging Postgres — this creates real guest reservations.

**Prerequisites (local staging only):**

```bash
# API .env — never production
CAPTCHA_PROVIDER=off
# Optional: raise booking throttle so overlap (409) dominates over 429
PUBLIC_THROTTLE_BOOKING_LIMIT=100
```

If `CAPTCHA_PROVIDER` is turnstile/hcaptcha, pass a valid token or use vendor **test keys on localhost only** — see [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md).

**Destructive run:**

```bash
pnpm --filter @gospots/api run dev   # separate terminal; seeded shop required

PERF_WRITE_SMOKE=1 \
PERF_VENUE_SLUG=demo-venue \
PERF_RESOURCE_ID=clxxxxxxxxxxxxxxxxxx \
pnpm --filter @gospots/api run perf:k6:write

# Shorter storm (3 VUs, 15s steady)
PERF_WRITE_SMOKE=1 PERF_VENUE_SLUG=demo-venue PERF_RESOURCE_ID=clxxx... \
  K6_VUS=3 K6_STEADY_DURATION=15s pnpm --filter @gospots/api run perf:k6:write

# Fixed contention window (ISO)
PERF_WRITE_SMOKE=1 PERF_VENUE_SLUG=demo-venue PERF_RESOURCE_ID=clxxx... \
  PERF_STARTS_AT=2026-12-15T14:00:00.000Z PERF_ENDS_AT=2026-12-15T15:00:00.000Z \
  pnpm --filter @gospots/api run perf:k6:write
```

**Env**

| Variable | Default | Purpose |
|----------|---------|---------|
| `PERF_WRITE_SMOKE` | off | Must be `1` to enable POSTs |
| `PERF_VENUE_SLUG` | — | **Required** when enabled; published venue slug |
| `PERF_RESOURCE_ID` | — | **Required** when enabled; gaming bookable resource id |
| `PERF_CAPTCHA_TOKEN` | — | Body token when CAPTCHA enforced |
| `PERF_STARTS_AT` / `PERF_ENDS_AT` | +7d 14:00–15:00 UTC | Shared contention window |
| `API_URL` | `http://127.0.0.1:4000` | API origin |
| `K6_VUS` | `5` | Concurrent writers (lower than read stub — throttle-aware) |
| `K6_RAMP_DURATION` | `10s` | Ramp-up |
| `K6_STEADY_DURATION` | `30s` | Hold at steady VUs |

**What it measures:** concurrent `POST .../gaming/reservations` against one resource + time window. Expect **one** 2xx create and **409** overlaps under lock; **429** if default booking throttle not raised; **403** if CAPTCHA enforced without token. Threshold: **0** server **5xx**.

**Baseline artifact:** record outcomes in [`artifacts/perf/k6-write-smoke-baseline.md`](./artifacts/perf/k6-write-smoke-baseline.md). **Purge test reservations** after run.

**Not measured:** staff reservation create, finance-under-write, walk-in C4 race.

---

## Operator / developer verify

```bash
# Smoke (needs API + Postgres)
pnpm --filter @gospots/api run dev   # separate terminal
pnpm --filter @gospots/api run perf:smoke

# Overlap preflight before exclusion migrate
pnpm detect:reservation-overlaps

# Typecheck (unchanged gate)
pnpm --filter @gospots/api run typecheck
```

**CI today:** no perf job; api unit tests + migrate verify only.

---

## Non-goals

- Production capacity planning or formal SLO contract before Phase 2 exit  
- Full-schema index audit in v1 (only hot-path + EXPLAIN-driven adds)  
- Frontend Lighthouse / Core Web Vitals CI (track under §29/§34 if needed)  
- Multi-region / CDN load testing  
- Continuous prod load against Render free tier  
- OTel trace-based perf analysis (track under §24 — [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md))

---

## References

| Doc / code | Relevance |
|------------|-----------|
| [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) | Booking/stock race harness; optional C4 walk-in |
| [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md) | In-process SSE — multi-instance load gap |
| [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) | `LEDGER_READS` analytics profiling |
| [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) | Throttles/CAPTCHA under load |
| [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md) | Perf row: smoke **P**, load suite **N** |
| [`GO_SPOTS_FIX_PLAN.md`](./GO_SPOTS_FIX_PLAN.md) | §35 index audit + load script priority |
| [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) | §35 compressed issue sheet |
| `apps/api/scripts/perf-smoke.mjs` | Light smoke implementation |
| `apps/api/scripts/perf-read-smoke.js` | k6 Phase 1 read stub |
| `apps/api/scripts/perf-write-smoke.js` | k6 Phase 2 gated write stub (**destructive / opt-in**) |
| `artifacts/perf/k6-read-smoke-baseline.md` | Operator baseline table |
| `artifacts/perf/k6-write-smoke-baseline.md` | Operator write-storm baseline table |
| `.github/workflows/ci.yml` | No perf job yet — Phase 4 target |

---

## Verify (this lane)

```bash
# k6 must be installed separately — script syntax check only if k6 absent
k6 run apps/api/scripts/perf-read-smoke.js --duration 5s --vus 1
# or with API up:
pnpm --filter @gospots/api run perf:k6
```
