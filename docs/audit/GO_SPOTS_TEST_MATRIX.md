# GoSpots test matrix (current)

**As of:** 2026-07-22 (residual docs lane **TEST34-residual-docs**)  
**Status:** **Bible §34 / old #2 PARTIAL** — unit + CI ship bar **DONE** (Lanes **GGGGGG**, **XXX**, **HHHHHH**, **QQ**, **WWWWW**); full e2e matrix, web unit tests, and hard web build/eslint/i18n CI gates remain **explicitly deferred** — phased plan below. **Do not claim “comprehensive test coverage” until Phases 2–4 exit.**  
**Canonical bible:** [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) §34  
**Concurrency design:** [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) · **A11y smoke (§29):** [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md) · **i18n check (§30):** [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md)  
**Commands:** root/`apps/*/package.json` and [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

Legend: **Y** = covered · **P** = partial · **N** = missing · **O** = opt-in only

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| API Jest unit suite (~**105** `*.spec.ts`) | **DONE** | `apps/api/src/**/*.spec.ts`; `pnpm --filter @gospots/api test` |
| Mock-first fast default (`rootDir: src`) | **DONE** | `apps/api/package.json` Jest config |
| CI `api` — eslint + nest build + Jest | **DONE** | `.github/workflows/ci.yml` job `api` |
| CI `api-migrate` — ephemeral Postgres migrate deploy | **DONE** | job `api-migrate`; never Neon |
| CI `web` — typecheck only | **DONE** | job `web`; **not** `next build` / eslint |
| Characterization specs (auth / reservations / finance §14) | **DONE** | `*.characterization.spec.ts` under auth, reservations, finance |
| Tenant isolation matrix (`*.tenant.spec.ts`) | **DONE** | menu, gallery, resources, staff, finance, guest-chat, etc. |
| CSRF / captcha / throttle / idempotency util specs | **DONE** | `csrf.guard.spec.ts`, `captcha*.spec.ts`, `idempotency.util.spec.ts` |
| Money / ledger / offering-config / stock util specs | **DONE** | `money.util`, `ledger-post`, `offering-config`, `menu-stock-db`, `shop-order-stock` |
| Opt-in concurrency harness + Neon refuse | **DONE** | `test/concurrency/concurrency.harness.ts`; `pnpm test:concurrency` |
| Concurrency gate unit specs (no DB) | **DONE** | `concurrency-gate.spec.ts` — **6** tests always run |
| Live C1–C3 util/lock bodies (local Docker only) | **DONE** (opt-in) | `booking-double-book.spec.ts`, `stock-last-unit.spec.ts` — Lane **HHHHHH** |
| Nest health e2e stub | **DONE** (local only) | `apps/api/test/app.e2e-spec.ts`; `pnpm test:e2e` — **not CI-gated** |
| Playwright login smoke (skip-if-no-Next) | **DONE** (opt-in) | `apps/web/e2e/smoke.spec.ts`; Lane **QQ** |
| Playwright public axe smoke — 13 routes | **DONE** (opt-in) | `apps/web/e2e/a11y.spec.ts`; Lane **WWWWW** |
| CI `web-a11y-smoke` (non-blocking) | **DONE** | `continue-on-error: true`; typically **13 skipped** without Next |
| Manual `i18n:check` en/pl parity | **DONE** (manual) | `pnpm --filter @gospots/web run i18n:check` — **not CI-gated** |
| Full owner/staff/guest/ops Playwright matrix | **RESIDUAL** | Only `/login` smoke + public axe today |
| Hard CI `next build` | **RESIDUAL** | Deploy checklist / local only |
| Hard CI web eslint / jsx-a11y | **RESIDUAL** | Comment in `ci.yml` web job — baseline not green |
| Hard CI `i18n:check` | **RESIDUAL** | Manual script only |
| Web component unit tests (Vitest/Jest) | **RESIDUAL** | **No** `apps/web/**/*.test.ts` on disk |
| Live Docker C1–C3 operator proof | **RESIDUAL** (operator) | Bodies on disk; `RUN_CONCURRENCY_TESTS=1` + local Postgres |
| Nest service-level concurrency wrappers | **RESIDUAL** (optional) | Util/lock path only today — [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |
| Integration DB tests in default CI | **RESIDUAL** | Migrate dry-run only; no service+Postgres matrix job |
| Dashboard authenticated axe in CI | **RESIDUAL** | Needs auth fixture + Next boot — [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md) Phase 4 |
| API Supertest domain e2e matrix | **RESIDUAL** | Health stub only in `app.e2e-spec.ts` |
| CI perf smoke gate | **RESIDUAL** | `perf:smoke` local — [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md) §35 |

**§34 classification:** **PARTIAL** — unit + CI ship bar met; e2e matrix and hard web gates documented here, not hidden.

---

## Ship bar (Lanes GGGGGG + XXX + HHHHHH + QQ + WWWWW)

| In scope (DONE) | Explicit residual |
|-----------------|-------------------|
| Substantial API Jest coverage in CI | Full Playwright owner/staff/guest/ops flows |
| Web typecheck in CI | `next build` + eslint CI gates |
| Ephemeral Postgres migrate dry-run | Web component unit tests |
| Opt-in concurrency scaffold + util/lock C1–C3 bodies | Operator local Docker C1–C3 run |
| Optional Playwright smokes (login + public axe) | Nest service-level concurrency wrappers |
| Skip-if-no-Next / skip-if-no-`RUN_CONCURRENCY_TESTS` patterns | Integration DB tests in CI |
| Characterization + tenant isolation specs (§14 split) | Dashboard axe + hard a11y CI |

**Explicitly not in this ship bar:** blocking PR merge on e2e/a11y/build; Neon concurrency runs; product-wide “all paths tested” claim.

---

## Domain matrix

| Domain | Workflow | Unit | Integration | E2E | Concurrency |
|--------|----------|:----:|:-----------:|:---:|:-----------:|
| Authentication | Owner login / lockout | Y | P | P | N |
| Authentication | Staff activation | Y | P | N | N |
| Authentication | Refresh family / reuse | Y | P | N | N |
| Authentication | Sessions list/revoke | Y | P | N | N |
| Authentication | Owner TOTP MFA | Y | P | N | N |
| Authentication | CSRF | Y | P | N | N |
| Tenancy | Cross-venue blocked | Y | P | N | N |
| Tenancy | RLS SET LOCAL | Y | O | N | N |
| Reservations | Overlap prevent | Y | P | N | O |
| Reservations | Exclusion constraint | Y | O | N | O |
| Sessions | Walk-in conflict | Y | P | N | O |
| Orders | Stock decrement | Y | P | N | O |
| Orders | Cancel/delete restore once | Y | P | N | N |
| Finance | Channel sum contract | Y | P | N | N |
| Finance | Ledger post idempotent | Y | P | N | N |
| Finance | Ledger backfill | Y | O | N | N |
| Finance | LEDGER_READS path | Y | P | N | N |
| GuestCheck | Attach / settle gate | Y | P | N | N |
| Subscription | Webhook idempotency | Y | P | N | P |
| Permissions | Staff denied owner action | Y | P | N | N |
| Money | Decimal / wire | Y | P | N | N |
| Guest | Token hash verify | Y | P | N | N |
| Mail | Outbox retry | Y | P | N | N |
| GDPR | Export/erase paths | Y | P | N | N |
| Public | Booking / chat outage UX | P | N | P | N |
| A11y | Public routes axe | N | N | P | N |
| A11y | Dashboard axe | N | N | N | N |
| Smoke | Login page Playwright | N | N | O | N |

**Column key**

| Column | Shipped meaning today | Residual |
|--------|----------------------|----------|
| **Unit** | Jest mocks + characterization + `*.tenant.spec.ts` | More hot-path characterization before risky refactors |
| **Integration** | Opt-in util/lock concurrency; migrate dry-run | Service + real Postgres in CI; Supertest domain routes |
| **E2E** | Opt-in Playwright smoke + public axe (skip gates) | Auth fixture; dashboard routes; booking/guest flows |
| **Concurrency** | Opt-in C1–C3 bodies (local Docker; Neon refused) | Operator run; optional Nest service wrappers |

---

## CI truth (`.github/workflows/ci.yml`)

| Job | Merge-blocking | What runs | Honest gap |
|-----|:--------------:|-----------|------------|
| `api` | **Yes** | eslint, nest build, Jest (`--passWithNoTests`) | No live Postgres service tests |
| `api-migrate` | **Yes** | `migrate deploy` + status + validate on empty PG16 | Proves DDL only, not app behavior |
| `web` | **Yes** | `tsc` typecheck | No `next build`, eslint, or `i18n:check` |
| `web-a11y-smoke` | **No** (`continue-on-error`) | Playwright axe — skips without Next | Does not boot Next; dashboard routes absent |

---

## Phased residual plan

### Phase 0 — Operator concurrency proof (**RESIDUAL** — operator)

| Work | Notes |
|------|--------|
| Local Docker Postgres | `DATABASE_URL` local; **never** Neon from `.env` |
| `RUN_CONCURRENCY_TESTS=1` | Run C1–C3 util/lock bodies — Gates 0–3 in [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |
| Record outcome | Note pass/fail in operator log; not a code ship blocker |

**Exit:** C1–C3 green once on local Docker after migrate.

### Phase 1 — Characterization + integration DB (1–2 weeks)

| Work | Notes |
|------|--------|
| Extend characterization | Cover remaining facade methods before further §14-style splits |
| Optional CI Postgres service job | Service + Prisma integration for 2–3 hot paths (booking create, stock SALE) |
| Expand `app.e2e-spec.ts` | CSRF cookie round-trip, public book 409, webhook idempotency stub |

**Exit:** At least one merge-blocking integration spec per P0 domain (booking, stock, webhook).

### Phase 2 — Playwright auth fixture + dashboard smoke (1 week)

| Work | Notes |
|------|--------|
| Encrypted CI secrets | Owner login → venue bind cookie jar |
| Dashboard smoke routes | Settings, sessions, finance hub load without 5xx |
| Reuse §29 axe routes | Four staff routes serious-clean locally |

**Exit:** `test:e2e:dashboard-smoke` passes locally with secrets; documented fixture.

### Phase 3 — Full e2e matrix (2–4 weeks)

| Flow | Priority |
|------|----------|
| Owner register → create venue → onboarding step | P1 |
| Public gaming book + guest status link | P0 |
| Staff activate + floor session start/stop | P1 |
| Shop order + stock decrement | P0 |
| Lemon webhook replay (staging) | P1 |

**Exit:** Matrix rows marked **Y** in E2E column for P0 flows above.

### Phase 4 — Hard CI gates (**RESIDUAL** until Phases 1–3 stable)

| Work | Notes |
|------|--------|
| `next build` in CI | Or production-like preview server for Playwright |
| Web eslint (no `--fix`) | jsx-a11y baseline green first |
| `i18n:check` merge-blocking | Pairs with §30 Phase 4 |
| Boot Next in Actions | Required for serious+ axe — [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md) Phase 4 |
| Optional: `perf:smoke` soft gate | §35 — warn-only until load suite exists |

**Exit:** PR merge blocked on typecheck + build + eslint + i18n + P0 Playwright smokes.

---

## How to run

```bash
# Default CI-equivalent (API)
pnpm --filter @gospots/api test
pnpm --filter @gospots/api exec nest build
pnpm --filter @gospots/web run typecheck
pnpm --filter @gospots/web run i18n:check

# Opt-in concurrency (gate always; live bodies need RUN_CONCURRENCY_TESTS=1 + local Docker)
pnpm --filter @gospots/api run test:concurrency

# Opt-in web smokes (need Next on :3000)
pnpm --filter @gospots/web run test:e2e:smoke
pnpm --filter @gospots/web run test:a11y:smoke

# Local API e2e stub (not CI)
pnpm --filter @gospots/api run test:e2e
```

---

## Gaps vs prompt §34 (summary)

| Gap | Status |
|-----|--------|
| Full Playwright owner/staff/guest/ops matrix | **N** — Phase 3 |
| Hard CI gate for `next build` / eslint | **P/N** — Phase 4 |
| Live concurrency against Neon | **Forbidden** (harness refuses) — operator local Docker only |
| Web component unit tests | **N** — no web test runner on disk |
| Integration DB in default CI | **N** — migrate dry-run only |
| Dashboard axe merge-blocking | **N** — §29 Phase 4 |

---

## References

| Doc | Role |
|-----|------|
| [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) | C1–C3 design + operator gates |
| [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md) | Public axe shipped; dashboard + hard CI residual |
| [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md) | `i18n:check` manual; CI gate residual |
| [`GO_SPOTS_FIX_PLAN.md`](./GO_SPOTS_FIX_PLAN.md) | P2 row §29/§34 |
| [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) | Legacy #2 DONE ship bar + residuals |
| [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) | Lanes GGGGGG, HHHHHH, QQ, WWWWW log |

---

*Lane **GGGGGG** — unit + CI ship bar. Lane **TEST34-residual-docs** — honest §34 shipped vs residual. **Verify:** docs-only.*
