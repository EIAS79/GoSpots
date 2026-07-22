# GoSpots P0 Wave 1 ? Implementation Report

**Date:** 2026-07-20  
**Scope:** First P0 wave from audit (webhook idempotency, atomic stock+sale, booking overlap locks, money decision scaffold).  
**Not in scope:** UI/visual cleanup, 2FA/CSRF mega-rewrite, guest tickets, full Float?Decimal migration.

---

## 1. What shipped

### 1.1 Lemon Squeezy webhook idempotency (P0)

- Added Prisma model `BillingWebhookEvent` (`provider` + `eventId` unique).
- Migration: `apps/api/prisma/migrations/20260720210000_billing_webhook_events/` (expand-only; no reset).
- `BillingService.handleWebhook` inserts a receipt **before** subscription mutations; `P2002` ? `{ ok: true, duplicate: true }` (concurrent retries safe).
- Event id resolution: `meta.event_id` / `meta.webhook_id`, else SHA-256 of raw body (controller now passes `raw`), else payload fingerprint.
- Signature verification unchanged (still required).


### 1.1b Lemon webhook edge hardening (follow-up)

- Invalid/missing HMAC ? **401** `UnauthorizedException` (controller verifies **before** receipt insert).
- Malformed JSON ? **400** in controller; non-object payload ignored in service (no receipt).
- Unknown / non-subscription `event_name` ? durable receipt + `{ ok: true, ignored: true }` (no Subscription/audit mutation). Mutating set: `subscription_created|updated|resumed|unpaused|cancelled|expired|paused`.
- Sparse payloads / invalid `renews_at` fail safe (defaults / null period end).
- Replay after success still no-ops via unique receipt (`P2002`).

### 1.1c Production secrets / Lemon webhook fail-fast

- Boot: `assertCriticalSecretsAtBoot` in `main.ts` requires `JWT_ACCESS_SECRET`, `DATABASE_URL`, and `LEMON_SQUEEZY_WEBHOOK_SECRET` when `NODE_ENV=production` (refuse to listen).
- Non-prod: missing Lemon webhook secret ? warn only (local without Lemon OK); webhook path still rejects.
- `BillingService.onModuleInit` belt-and-suspenders for webhook secret in prod.
- `verifySignature`: missing secret ? **503** `ServiceUnavailableException` (never accepts unsigned). Bad/missing HMAC still **401**.
- Documented in `.env.production.example` + deploy checklist.

### 1.2 Atomic stock + SALE (P0)

- `createTransaction`: stock conditional adjust + `Transaction` create run in one `$transaction` (SALE/REFUND). Failure leaves **no** orphan SALE.
- `adjustMenuItemStockBy` optionally scoped by `shopId`; accepts transaction client.
- Order cancel: conditional `status != CANCELED` + stock restore + line cancel in one transaction (no double restore).
- `addShopOrderLine`: decrement + line create + total recalc in one transaction.

### 1.3 Booking / session overlap race mitigation (P0)

- New `withResourceBookingLock`: interactive txn + `SELECT ? FROM "Resource" ? FOR UPDATE`, then overlap check + create/update.
- Applied to: public booking create, staff reservation create/update (when `resourceId` set), walk-in `createPlaySession` (when `resourceId` set).
- Covers reservation?reservation and reservation?walk-in via existing overlap helpers under the lock.
- **Not** added this wave: Postgres exclusion constraint (requires overlap data cleanup first ? see migration plan M8).

### 1.4 Money decision (partial ? time remaining)

- Decision: **`Decimal(19, 4)`** ? `docs/audit/GO_SPOTS_MONEY_DECISION.md`.
- Scaffold: `apps/api/src/common/money.util.ts` + tests (`0.1+0.2`, line totals, FX round).
- **Deferred:** full schema expand/backfill/contract for all Float money columns.

---

## 2. Migrations

| Name | Purpose | Deploy |
|------|---------|--------|
| `20260720210000_billing_webhook_events` | Create `BillingWebhookEvent` | Use `prisma migrate deploy` only (never reset) |

Deploy command (when ready against target DB):

```bash
pnpm --filter @gospots/api migrate:deploy
```

---

## 3. Commands run + results

| Command | Result |
|---------|--------|
| `pnpm --filter @gospots/api prisma:generate` | **PASS** (after freeing ports 3000/4000 locking query engine DLL) |
| `npx jest --testPathPatterns billing.service.spec ? money.util.spec ?` (6 suites) | **PASS** ? 23 tests |
| `npx nest build` (apps/api) | **PASS** |

Tests included: webhook signature + duplicate/P2002 + concurrent duplicate; stock conditional update; booking lock order; money util; existing venue-packs + app.controller.

**Not run this session:** full e2e suite, `migrate deploy` against Neon/prod (operator should deploy migration in release pipeline).

---

## 4. Remaining P0 / next wave

From fix plan / deep audit, still open:

1. **Money expand migration** ? parallel Decimal columns + dual-write/backfill (decision done; schema work next).
2. **Tenant mutation hardening** ? `shopId` on every mutating `where` (partially improved for stock).
3. ~~**Finance reporting contract / ledger**~~ ? interim contract + shared channel sum **Done 2026-07-20** (`GO_SPOTS_FINANCE_CONTRACT.md`); full ledger still deferred.
4. ~~**Guest token hashing + expiry**~~ ? **Done** (see wave below).
5. **Optional Postgres exclusion constraint** after cleaning existing overlaps.
6. **Integration/concurrency tests against real Postgres** (Promise.all unit sims exist; DB integration still needed).
7. **CI** ? wire lint/test/migrate dry-run on PRs.
8. ~~Broader order-line patch paths still not fully single-txn~~ ? **Done** (patch qty / cancel line / delete line / delete order; see wave below).

---

## 5. Risk reduction summary

| Risk | Before | After |
|------|--------|-------|
| Lemon webhook replay | Re-applied subscription/audit | Durable unique receipt; duplicates no-op |
| SALE without stock move | Possible if adjust failed after create | Same DB transaction; all-or-nothing |
| Double cancel restore | Race possible | Conditional cancel in one txn |
| Double-book same unit/slot | Check-then-create race | Resource row lock serializes check+write |
| Float money | Confirmed debt | Decision + util only; schema still Float |

---

## 6. Files touched (by concern)

**Webhook / billing**

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260720210000_billing_webhook_events/migration.sql`
- `apps/api/src/modules/billing/billing.service.ts`
- `apps/api/src/modules/billing/billing.controller.ts`
- `apps/api/src/modules/billing/billing.service.spec.ts`

**Stock / finance**

- `apps/api/src/common/menu-stock-db.util.ts`
- `apps/api/src/common/menu-stock-db.util.spec.ts`
- `apps/api/src/modules/finance/finance.service.ts`

**Booking concurrency**

- `apps/api/src/common/booking-lock.util.ts`
- `apps/api/src/common/booking-lock.util.spec.ts`
- `apps/api/src/common/booking-overlap.util.ts`
- `apps/api/src/modules/reservations/reservations.service.ts`

**Money scaffold**

- `docs/audit/GO_SPOTS_MONEY_DECISION.md`
- `apps/api/src/common/money.util.ts`
- `apps/api/src/common/money.util.spec.ts`

**This report**

- `docs/audit/GO_SPOTS_IMPLEMENTATION_REPORT.md`

---

# Ops / reliability wave ? 2026-07-20 (evening)

**Scope:** Differentiated health probes, request logging, GitHub Actions CI, venue timezone hardening for menu-stock day keys, DR stub.  
**Conflict avoidance:** Did **not** edit `finance.service.ts`, `billing.service.ts`, `reservations.service.ts`, or Prisma money/guest-token fields.

## What shipped

### Health (`/live` vs `/ready`)

- `GET /api/v1/live` ? liveness only (no DB).
- `GET /api/v1/ready` ? readiness with `SELECT 1`; **503** when DB down.
- `GET /api/v1/health` ? kept as liveness alias for existing Render checks.

### Structured request logging

- New `RequestLoggingInterceptor` (global): JSON log with `requestId`, `method`, `path`, `statusCode`, `durationMs`, optional `shopId`.
- Honors / echoes `x-request-id`; strips query strings; skips probe paths; never logs Authorization / cookies / tokens.

### CI

- `.github/workflows/ci.yml`: pnpm install (frozen), prisma generate, api `lint`, `build`, `test` (Jest).

### Venue timezone

- Prisma: optional `Shop.timezone` (`String @default("UTC")`) + migration `20260720220000_shop_timezone` (expand-only, no reset).
- New `venue-timezone.util.ts` (IANA validate + locale fallback).
- `menu-stock.util.venueDayKey` accepts IANA **or** locale (backward compatible for finance callers still passing locale).
- `menu.service` selects `timezone` + `locale` and resolves via util.

### Docs

- `docs/operations/DISASTER_RECOVERY.md` ? stub with honest **confirm Neon PITR** notes.

## Commands run + results

| Command | Result |
|---------|--------|
| `prisma generate` | **PASS** (after freeing ports 3000/4000 locking query engine DLL) |
| `jest --testPathPatterns="venue-timezone\|menu-stock.util"` | **PASS** ? 2 suites, 8 tests |
| `jest --passWithNoTests` (full api unit) | **PASS** ? 12 suites, 72 tests |
| `nest build` | **PASS** |
| `eslint` on changed health/logging/timezone files | **PASS** |

**Not run:** e2e suite, `migrate deploy` against Neon, full monorepo web lint/build.

## Remaining gaps

1. ~~Finance / analytics still pass locale into `venueDayKey`~~ ? fixed in **Finance timezone day-keys wave** below.
2. ~~No shop-settings API field for `timezone`~~ ? fixed (`GET`/`PATCH /shop/settings` ? `shop.timezone`); UI still deferred.
3. No dedicated menu-stock cron ? reset remains on-read; reminders cron untouched.
4. Render health path still documented as `/api/v1/health`; prefer switching LB to `/api/v1/ready` when DB must be up.
5. Neon PITR / retention **not confirmed** in this wave ? operator must fill DR stub.
6. CI does not run web lint/build or e2e / migrate deploy.
7. Deploy migration `20260720220000_shop_timezone` with `migrate:deploy` before relying on `Shop.timezone` in prod.

---

# Money Decimal wiring wave ? 2026-07-20 (night)

**Scope:** Finish Prisma `Decimal(19,4)` app wiring after parallel rush left ~77 TS errors. Obey `QUALITY_BAR.md` (no half-fix; no CSRF/ledger/entitlements).

## What shipped

### money.util (no longer scaffold-only)

- `toMoneyNumber(value)` ? Decimal | number | string | nullish ? finite number (`.toNumber()` for Decimal)
- `toPrismaDecimal(value)` for writes
- `serializeMoney` / `serializeMoneyOrNull` for API payloads
- `applyDiscountPercent` (used by play-billing)
- Kept `roundMoney` / `addMoney` / `lineTotal` / `convertMoney` / `parseMoneyString` on numbers
- Specs expanded

### Call-site wiring

- Finance service + analytics: convert at calculation boundaries; audit types accept `MoneyInput`
- Shop currency reprice, resources default hourly, dashboard KPIs
- Reservations already use `serializeMoneyOrNull` for guest status payloads
- Guest-chat token path left intact (`rawToken` serialization; no security strip)

### Schema

- Migration `20260720230000_money_decimal_core` already present ? **not reverted**; wiring completed around it

## Commands + results

| Command | Before | After |
|---------|--------|-------|
| `npx tsc -p tsconfig.build.json --noEmit` | **77 errors** | **0** (exit 0) |
| `npx nest build` | (red / blocked) | **PASS** (exit 0) |
| `npx jest --testPathPatterns money.util.spec\|guest-token.util.spec\|billing.service.spec\|booking-lock.util.spec\|menu-stock` | ? | **6 suites / 39 tests PASS** |

## Remaining money gaps (honest)

1. **`offeringConfig` JSON** still stores prices as plain JSON numbers (float-ish); FX reprice walks them, but they are not Decimal columns.
2. **`billingDiscountPercent`** stays Float (percent, not money).
3. **No ledger yet** ? when added, amounts must be Decimal-consistent.
4. **API JSON** still emits JS `number` (rounded), not Decimal strings.
5. Math after `toMoneyNumber` is still IEEE float ? fine for ops UI; not a cash ledger.
6. Deploy migration with `prisma migrate deploy` only (**never reset**).

## Files touched (this wave)

- `apps/api/src/common/money.util.ts` + `.spec.ts`
- `apps/api/src/common/play-billing.util.ts` (consumes `applyDiscountPercent`)
- `apps/api/src/modules/finance/finance.service.ts`
- `apps/api/src/modules/finance/finance-analytics.util.ts`
- `apps/api/src/modules/finance/shop-order-audit.util.ts`
- `apps/api/src/modules/shop/shop.service.ts`
- `apps/api/src/modules/resources/resources.service.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/mail/gaming-reservation-mail.ts` (unrelated TS2367 filter fix)
- `docs/audit/GO_SPOTS_MONEY_DECISION.md`
- `docs/audit/GO_SPOTS_IMPLEMENTATION_REPORT.md`

---

# Entitlements + permissions/add-ons wave ? 2026-07-20

**Scope:** Central venue entitlement engine; legacy tier?add-ons compatibility; CSV?relational dual-read/write for `MembershipPermission` / `SubscriptionAddOn`; tests.  
**Conflict avoidance:** Did **not** touch money Float?Decimal columns, guest tokens, `BillingWebhookEvent` model, or finance stock/booking lock files owned by other agents. Webhook handler only gained add-on row sync after existing subscription updates.

## What shipped

### Central entitlement engine

- New `apps/api/src/common/venue-entitlements.ts`: `getVenueEntitlements`, `hasFeature`, `getVenueEntitlementsForShop`, `assertShopHasFeature`, seat limit via existing `resolveStaffSeatLimit`.
- `assertShopFeature` now delegates to the central engine (finance/menu/resources/reservations call sites unchanged).
- Frontend call site documented: `useVenueAccess` ? `resolveSubscriptionAccess` in `apps/web/src/lib/plan.ts` (comments cross-link API engine).

### Legacy tier ? add-ons (no access removal)

- `legacyAddOnsFromTier` + `effectiveAddOnsForSubscription`: STANDARD/PRO/ENTERPRISE with empty stored add-ons synthesize equivalent add-ons / union legacy modules.
- Intentional empty STARTER pack (CORE only) is **not** expanded.

### CSV permissions / add-ons normalization (dual-read + dual-write)

- Prisma models **added only**: `MembershipPermission`, `SubscriptionAddOn` (CSV columns retained).
- Migration `20260720240000_membership_permissions_subscription_addons` with CSV?row backfill (`ON CONFLICT DO NOTHING`).
- Dual-read: `resolvePermissionSet` / `permissionsToEffectiveCsv`; `resolveAddOnsCsv` / `resolveAddOnIds`.
- Dual-write sync on: staff create/update, owner signup/venue create/link, trial pack apply, pending plan apply, Lemon webhook subscription update.
- Critical authz reads: venue context interceptor + JWT issue/bind merge CSV + permission rows.

### Tests

- `venue-entitlements.spec.ts`: pack modules, dual-read add-ons, lock on PAST_DUE, trial/paid seats, legacy PRO empty addOns, STARTER empty not expanded, permission dual-read + unknown key reject.

## Migrations

| Name | Purpose | Deploy |
|------|---------|--------|
| `20260720240000_membership_permissions_subscription_addons` | Create join tables + CSV backfill | `pnpm --filter @gospots/api migrate:deploy` (never reset) |

## Commands run + results

| Command | Result |
|---------|--------|
| `npx prisma generate` (apps/api) | **PASS** (after freeing ports 3000/4000 locking query engine DLL) |
| `npx jest --testPathPatterns venue-entitlements\|venue-packs\|billing.service` | **PASS** ? 3 suites, 21 tests |
| `npx nest build` (apps/api) | **PASS** |

## Remaining (this track)

1. Stop dual-write / drop CSV columns after verification window (contract migration).
2. Frontend `plan.ts` still CSV-only (API already merges rows into subscription payload `addOns`).
3. `me()` membership list still returns raw CSV `permissions` (JWT/context already dual-read).
4. Full CI e2e + migrate deploy against Neon not run in this wave.

---

# Wave CSRF / dashboard ? 2026-07-20

**Scope:** Cookie-auth CSRF defense, cookie flag hardening (proxy-safe), safer dashboard routing (slug in URL; key out of address bar), tests.  
**Conflict avoidance:** Did **not** edit Prisma money fields, guestToken columns, billing webhook handler logic, or `finance.service` stock/booking lock code.

## What shipped

### CSRF (double-submit)

- Global `CsrfGuard` on unsafe methods when `access_token` / `refresh_token` cookies are present.
- Cookie `csrf_token` (not httpOnly) + required header `X-CSRF-Token`; issued on login/register/refresh/activate/bind and via `GET /auth/csrf`.
- `@SkipCsrf()` on Lemon Squeezy webhook (signature-verified; no session cookies).
- Kill switch: `CSRF_PROTECTION=false`.
- Web: `ensureCsrf` in `AuthProvider`; credentialed clients send CSRF header (`api.ts`, uploads, `api-client.ts`, etc.).
- CORS allows `x-csrf-token`.

### Cookie hardening

- Auth cookies still `httpOnly` + configurable `COOKIE_SECURE` / `COOKIE_SAME_SITE` (default **lax**).
- `SameSite=none` forces `Secure=true` (browser requirement).
- Venue bind session uses the same cookie options as login (no hard-coded lax-only path).
- Prod recommendation unchanged: **Vercel same-origin `/api/v1` proxy + `COOKIE_SAME_SITE=lax`** (see `.env.production.example`).

### Dashboard URL secret

- Browser routes prefer **`/dashboard/{slug}/?`** (no `dashboardKey` in the address bar).
- Legacy/shared `slug--key` links still work; `VenueGate` redirects to slug-only after membership resolve.
- Secret `slug--key` kept in `sessionStorage` for `x-venue-path` / bind-session API.

### Tests

- `csrf.util.spec.ts` ? generate/match/safe methods/session cookies/header parse.
- `csrf.guard.spec.ts` ? valid / invalid / missing / skip / disabled / public (no cookies).

### 2FA

- Not implemented (timebox); optional later.

## Commands run + results

| Command | Result |
|---------|--------|
| `apps/api` Jest `--testPathPatterns csrf` | **PASS** ? 14 tests (util + guard: valid/invalid/missing/skip/disabled/public guest/refresh) |
| `apps/web` `tsc --noEmit` | **PASS** (earlier in session) |
| `nest build` (apps/api) | **Blocked by parallel Decimal migration** in finance/shop/money (out of this ownership) ? CSRF sources themselves typecheck via Jest transform |

## Remaining / leftover

1. Optional Next.js middleware rewrite for `slug--key` ? slug (client redirect covers it today).
2. Rotate/regenerate dashboard keys UI still absent.
3. Owner session list / revoke-all still open (Phase E).
4. Full Playwright CSRF smoke not added.
5. When `COOKIE_SAME_SITE=none` without proxy, CSRF is required ? still prefer proxy+lax.

---

# GoSpots P0 Wave 2 ? Guest tokens + money start ? 2026-07-20

**Scope:** Guest token hashing/expiry/revoke (Reservation, EventRequest, GuestChat) + core Float?Decimal(19,4) money cutover + hottest billing path wiring.  
**Not in scope:** Full ledger, CSRF/2FA (other waves), exclusion constraint, plaintext column contract drop.

## What shipped

### A. Guest tokens (P0/P1)

- Confirmed plaintext `guestToken` on `Reservation`, `EventRequest`, `GuestChat`.
- Util: `apps/api/src/common/guest-token.util.ts` ? high-entropy raw (refresh-token strength), SHA-256 hash, timing-safe compare, issue/persist/revoke helpers, dual-read lookup.
- Schema expand: `guestTokenHash`, `guestTokenExpiresAt`, `guestTokenRevokedAt`; `GuestChat.guestToken` nullable.
- Migration: `20260720250000_guest_token_hash_expiry` ? pgcrypto backfill hashes + TTL expiry; dual-read window keeps legacy plaintext.
- New writes store **hash only** (raw returned once in create API / confirmation email).
- Validate paths: dual-read + verify + reject expired/revoked.
- Revoke on public/staff cancel, reservation NO_SHOW/CANCELED, guest/staff chat end.
- Staff event serialize no longer leaks plaintext/hash secrets (`hasGuestLink` only).
- Status emails omit CTA when raw token is no longer in DB (guest keeps original link).

### B. Money Decimal core

- Schema: confirmed money columns ? `Decimal @db.Decimal(19, 4)`; `billingDiscountPercent` stays Float.
- Migration: `20260720230000_money_decimal_core` ? in-place `USING ROUND((col)::numeric, 4)`.
- `money.util` + play-billing discounts; finance hot paths (transaction line totals, order total recalc, play billing mapping) use `toMoneyNumber` / `lineTotal` / `addMoney`.
- API serialization: **number** via `serializeMoney` (compat); `serializeMoneyString` available.
- Ledger deferred to wave 3 (documented).

## Migrations (deploy order)

| Name | Purpose |
|------|---------|
| `20260720210000_billing_webhook_events` | Wave 1 (if not yet deployed) |
| `20260720220000_shop_timezone` | Parallel ops wave |
| `20260720230000_money_decimal_core` | Money Float?Decimal |
| `20260720240000_membership_permissions_subscription_addons` | Parallel entitlements wave |
| `20260720250000_guest_token_hash_expiry` | Guest token hash + expiry |

```bash
pnpm --filter @gospots/api migrate:deploy
```

**Never** `prisma migrate reset`.

## Commands run + results

| Command | Result |
|---------|--------|
| `prisma generate` (apps/api) | **PASS** (after freeing ports 3000/4000 locking query engine DLL) |
| `nest build` (apps/api) | **PASS** |
| `npx jest --testPathPatterns guest-token\|money.util\|billing.service\|menu-stock-db\|booking-lock\|venue-packs\|app.controller` | **PASS** ? 7 suites / 38 tests |

## Remaining P0 / next

1. **Guest token contract** ? null remaining plaintext after dual-read verified; drop column later.
2. **M6 currency stamps** on monetary rows.
3. **Ledger** posts (wave 3).
4. Tenant mutation hardening (`shopId` on every mutating `where`).
5. Optional Postgres exclusion constraint after overlap cleanup.
6. Operator: deploy pending migrations on Neon; run money validation SQL in migration plan.

## Deploy notes for operator

1. Deploy migrations in order above (`migrate deploy` only).
2. Ensure Postgres has `pgcrypto` (migration creates extension IF NOT EXISTS) ? Neon typically allows it.
3. After money migration, spot-check with validation SQL in `GO_SPOTS_MIGRATION_PLAN.md` ?M1.
4. Existing guest links keep working (dual-read). New bookings/chats issue hash-only tokens.
5. App release should ship **with** these migrations (hash lookups + Decimal types required).

---

# Guest token hash + expiry ? 2026-07-20

**Scope:** Finish create/validate paths for reservation status/cancel, event-request, guest chat. Obey `QUALITY_BAR.md` (no ledger / 2FA / CSRF rewrites).

## Dual-read choice (documented)

- **New writes:** `guestTokenPersistFields` stores **hash + expiry only**; plaintext `guestToken` = `null`.
- **Reads:** `guestTokenLookupWhere` (hash OR legacy plaintext) ? `verifyPresentedGuestToken` ? `assertGuestTokenActive` (expiry + revoke).
- **Migration** `20260720220000_guest_token_hash_expiry`: backfills SHA-256 hex hashes + expiry; **keeps** legacy plaintext so old emailed links keep working. App clears plaintext only on revoke / new issue.
- Raw token returned **once** (public create response / email URL; staff create returns raw once too). Frontend URL token unchanged.

## Call sites

| Path | Create | Validate |
|------|--------|----------|
| Public gaming/dining booking | `issueGuestToken` + persist hash | status + cancel |
| Staff reservation create (with email) | hash persist; raw on response once | ? |
| Event request public / staff | hash persist; raw on response | status + cancel |
| Guest chat | hash + 7d TTL | open / send / ping / end / delete |

## Tests

`guest-token.util.spec.ts`: issue, persist hash-only, valid hash, invalid, expired, revoked, legacy plaintext dual-read, post-backfill hash-preferred, empty token reject, lookup OR, revoke fields.

## Commands + results

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns guest-token.util.spec` | **PASS** ? 12 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** (exit 0) |
| `npx nest build` | **PASS** (exit 0) |

## Remaining / not blocked for ship

1. Status-change emails after create: `statusPath` only when legacy plaintext still on row (cannot re-derive from hash). Guests keep original create-email link.
2. Two migrations share timestamp prefix `20260720220000` (`guest_token_hash_expiry` + `shop_timezone`) ? deploy both via folder name order; **do not add more duplicates**.
3. Optional later: clear leftover plaintext after verification window (no wipe in this wave).
4. Not started (per mission): ledger / 2FA / CSRF rewrites.

---

## Migration reconcile ? 2026-07-20 (coordination)

- Inventoried `20260720*` folders: five canonical migrations (webhook ? timezone ? money ? entitlements ? guest tokens).
- Duplicate `20260720220000_guest_token_hash_expiry` absent on disk; kept `20260720250000_guest_token_hash_expiry` (matches `schema.prisma` hash/expiry/revoke fields on GuestChat, Reservation, EventRequest).
- Duplicate `20260720220000_membership_permissions_*` absent; kept `20260720240000_membership_permissions_subscription_addons`.
- `schema.prisma` confirmed: money columns `Decimal @db.Decimal(19, 4)`; guest token hash/expiry/revoke on all three models.
- `npx tsc -p tsconfig.build.json --noEmit` ? **PASS** (0 errors).

---

# OfferingConfig write validation ? 2026-07-20

**Scope:** P1 unvalidated JSON pricing (`ResourceCategory.offeringConfig`) + finite money checks on related create/update DTOs.  
**Conflict avoidance:** Did **not** change `finance.service` reporting, Prisma schema, or migrations.

## What validated

- **`offeringConfig`** on `CreateCategoryDto` / `UpdateCategoryDto` via `@IsOfferingConfig()` (class-validator; no Zod in API):
  - Must be a plain object (not array/string)
  - Known price keys (`pricePerPerson`, `pricePerGame`, `pricePerHour`, `price`, `hourlyRate`, `basePrice`) ? finite, ? 0, or `null`
  - `noShowMinutes` ? integer 5?180 when present
  - `bowlingModes[]` ? `chargeType` TIME|GAME|PERSON; nested `rates[].price` required + non-negative finite; counters finite ? 0
- **`ResourceRateDto.price`** / **`UpdateResourceDto.hourlyRate`** / **menu item `price`**: `@IsNumber({ allowNaN: false, allowInfinity: false })` + `@Min(0)`

## Files

- `apps/api/src/common/offering-config.util.ts` + `.spec.ts`
- `apps/api/src/modules/resources/dto/resources.dto.ts`
- `apps/api/src/modules/menu/dto/menu.dto.ts`
- `docs/audit/GO_SPOTS_IMPLEMENTATION_REPORT.md`

## Tests + build

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns offering-config.util.spec` | **PASS** ? 16 tests (valid + garbage payloads, DTO wire-up) |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Remaining

- JSON prices remain float-ish numbers inside Json (not Decimal columns) ? see money decision doc.
- Read-path parsers still tolerate legacy garbage; new writes are rejected at the DTO boundary.

---

# Finance reporting contract (anti double-count) ? 2026-07-20

**Scope:** Tue P0 early ? stop analytics summing overlapping revenue sources. Obey `QUALITY_BAR.md` (no full ledger / schema rewrite).

## Root cause

`computeRevenueSince` (dashboard KPIs) and `buildFinanceAnalytics` (finance reports) each summed four independent stores (`Transaction` SALE + completed `ShopOrder` + `Reservation.billedAmount` + walk-in `PlaySession.amount`). Channel classification differed between the two helpers. Linked `PlaySession` rows (`reservationId` set) were already excluded from queries, but there was no shared contract or pure channel sum ? easy to reintroduce double-count, and paid walk-ins stamped with `completedAt` while still `ACTIVE` were under-counted.

## What changed

- Documented binding interim contract: `docs/audit/GO_SPOTS_FINANCE_CONTRACT.md`
- Shared `sumRevenueChannels` + `loadRevenueSourceRows` in `finance-analytics.util.ts`
  - Menu = completed shop orders; Quick = SALE txs; Play = resource-backed billed reservations + **unlinked** paid walk-ins; Reservations = billed with `resourceId == null`
  - Hard guard: any play row with `reservationId` is ignored even if passed into the sum
  - Paid walk-in = `COMPLETED` **or** `completedAt` set (matches play-billing UI / `markPlaySessionPaid`)
- Dashboard KPI + analytics reports both use the same channel math
- Tiny compile fix: `shopProfileSelect` includes `timezone` (unrelated parallel WIP; required for green build)

## Tests

`finance-analytics.util.spec.ts` (6): exclusive channel sum; linked play + billed reservation not double-counted; order-only / tx-only / both-distinct; unpaid/canceled ignored; dining vs play split; paid walk-in recognition.

## Commands + results

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns finance-analytics.util.spec` | **PASS** ? 6 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Remaining gaps

1. No FK between order / quick-sale / reservation ? staff can still enter the **same** menu sale on both menu channels; contract forbids it, code cannot auto-dedupe.
2. Full `LedgerEntry` posting model still deferred (migration plan M3).
3. Web client already displays API channel fields without re-summing totals ? no web change required.

---

# Finance timezone day-keys wave ? 2026-07-20 (night)

**Scope:** Wire `Shop.timezone` (IANA) into finance/stock day-key callers; expose timezone on shop settings API.  
**Conflict avoidance:** In `finance.service.ts` and `finance-analytics.util.ts`, only timezone/day-key resolution at method tops / tiny helpers ? **no** revenue aggregate rewrite.

## Call sites updated

| Location | Change |
|----------|--------|
| `finance.service.ts` `ensureMenuItemStock` / `createTransaction` | `loadShopVenueTimeContext` ? `venueDayKey(resolvedTimeZone)` (removed `shopLocale`) |
| `finance-analytics.util.ts` `buildFinanceAnalytics` | Loads `resolvedTimeZone` via `loadShopVenueTimeContext`; day buckets use IANA (local alias `locale` kept for aggregate-loop merge stability) |
| `finance-analytics.util.ts` `dayKeysForRange` / `dayBucket` | Param renamed `timezoneOrLocale` (default `UTC`) |
| `menu.service.ts` | Already used `resolvedTimeZone` (unchanged this wave) |
| `shop.service.ts` + `UpdateShopSettingsDto` | Read/update `shop.timezone` on `GET`/`PATCH /shop/settings` |

## Settings API field

- **Read:** `GET /api/v1/shop/settings` ? `shop.timezone` (IANA string, default `UTC`).
- **Update:** `PATCH /api/v1/shop/settings` body `{ "timezone": "Europe/Warsaw" }` ? validated with `isValidIanaTimeZone`; audited as `timezone ? ?`.
- **UI:** skipped (not required); clients can set via API.

## Tests / build

| Command | Result |
|---------|--------|
| `jest --testPathPatterns="venue-timezone\|menu-stock.util"` | **PASS** ? 2 suites, 8 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** (exit 0) |
| `npx nest build` | **PASS** (exit 0) |

## Remaining

1. Settings UI for timezone still deferred.
2. Mail/reservation `toLocaleDateString` display paths are not day-key boundaries (out of scope).
3. Deploy `20260720220000_shop_timezone` if not yet applied in each env.

---

# Auth abuse throttle harden ? 2026-07-20

**Scope:** Confirm / harden Nest Throttler on auth endpoints; env-configurable limits so local smoke is not blocked; document prod defaults. CSRF cookie/header flow unchanged.

## Audit finding

Already present: global `ThrottlerGuard` (100/min) + hardcoded `@Throttle` on register/login/forgot/reset/refresh/activate; Lemon webhook `@SkipThrottle`. Gaps: no env knobs, `GET /auth/csrf` unscoped beyond global, password re-check on venue link unscoped.

## What shipped

- `apps/api/src/common/throttle.config.ts` ? `resolveThrottleConfig` + `authThrottle(kind)` Resolvable overrides (re-read env per request after ConfigModule load).
- `ThrottlerModule.forRootAsync` + `skipIf` when `THROTTLE_DISABLED=true|1`.
- Auth controller uses `authThrottle('strict'|'login'|'refresh'|'csrf')`; added limits on `GET /auth/csrf` and `POST /auth/venues/link(/preview)`.
- `.env.example` / `.env.production.example` + `DEPLOY_CHECKLIST` env table.

## Defaults (per IP / TTL window)

| Surface | Default limit | Env key |
|---------|---------------|---------|
| Global (all routes) | 100 / 60s | `THROTTLE_GLOBAL_LIMIT` + `THROTTLE_TTL_MS` |
| Register, forgot-password, staff forgot | 5 / 60s | `AUTH_THROTTLE_STRICT_LIMIT` |
| Login, reset-password, staff activate, link venues | 10 / 60s | `AUTH_THROTTLE_LOGIN_LIMIT` |
| Refresh | 30 / 60s | `AUTH_THROTTLE_REFRESH_LIMIT` |
| CSRF issue | 60 / 60s | `AUTH_THROTTLE_CSRF_LIMIT` |
| Kill switch (local only) | off | `THROTTLE_DISABLED` |

Account lockout (`failedLogins` / `lockedUntil`) remains complementary.

## Tests / build

| Command | Result |
|---------|--------|
| `jest --testPathPatterns=throttle.config` | **PASS** ? 5 tests |
| `tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `nest build` | **PASS** |

---

# Exclusion constraint prep (docs + detect only) ? 2026-07-20

**Scope:** Prep for optional Postgres `EXCLUDE` on reservation ranges. **No** constraint migration added (would fail on existing overlaps). **No** destructive cleanup.

## Delivered

- Doc: `docs/audit/GO_SPOTS_EXCLUSION_CONSTRAINT.md` ? exact `btree_gist` + `tstzrange`/`gist` SQL, detection query, why not deploying yet, lock-coverage skim.
- Read-only detect: `reservation-overlap-detect.util.ts` + `pnpm detect:reservation-overlaps` (`scripts/detect-reservation-overlaps.ts`). Exit 1 on pairs; never mutates.
- Jest: `reservation-overlap-detect.util.spec.ts` (SQL shape + mocked queryRawUnsafe).
- **Closed primary gap:** `FinanceService.updatePlaySession` uses the same `withResourceBookingLock` path as `createPlaySession` for interval-affecting mutates (+ `clearPaid` with resource). No exclusion migration deployed.

## Uncovered booking paths (no `FOR UPDATE`)

- Staff create/update when `resourceId` is null (unassigned).
- Walk-in create/update without `resourceId`, or update that only changes amount/label/status away from ACTIVE.
- Guest cancel / mark-paid / status-only finance updates (not create-slot paths).

Covered: public create, staff create/update with resource, walk-in `createPlaySession` with resource, walk-in **`updatePlaySession`** when interval-affecting (`resourceId` / `durationMinutes` / `endSession`) while ACTIVE, and `clearPaid` reopen with resource.

## `updatePlaySession` lock paths (closed primary gap)

| Mutate | Lock? |
|--------|-------|
| `resourceId` set/changed while next status ACTIVE | Yes ? target resource |
| `durationMinutes` change while ACTIVE + resource | Yes |
| `endSession` while ACTIVE + resource | Yes |
| `clearPaid` reopen COMPLETED?ACTIVE with resource | Yes |
| Amount / label / note / playerCount only | No |
| Status ? COMPLETED / CANCELED | No (no longer blocks) |
| No `resourceId` | No |

Same helpers as create: `withResourceBookingLock` ? `assertResourceBookable` ? `assertNoWalkInOverlap` (exclude self) ? `assertNoReservationOverlap` ? update inside txn. Jest: `booking-lock.util.spec.ts` update-style lock order.

## Remaining

1. Operator: run detect script on Neon; manually resolve any pairs.
2. Post-submit: add exclusion migration only when `overlapPairs = 0`.

---

# Order-line patch / delete stock atomicity ? 2026-07-20

**Scope:** Leftover after add/cancel were wrapped ? `patchShopOrderLine`, `deleteShopOrderLine`, `deleteShopOrder` still adjusted stock then mutated lines/totals outside one `$transaction`.  
**Conflict avoidance:** Only mutation methods in `finance.service.ts` (lines/stock/totals). Reporting aggregates untouched.

## Paths fixed

| Method | Change |
|--------|--------|
| `patchShopOrderLine` | Single `$transaction`: conditional stock via `adjustMenuItemStockBy` + claim `updateMany` (ACTIVE?CANCELED first; optimistic qty `WHERE quantity = baseline`; restore claim CANCELED?ACTIVE with stock rollback on lose) + `recalcShopOrderTotal(db)` |
| `deleteShopOrderLine` | Single `$transaction`: `deleteMany` claim on ACTIVE then restore; canceled lines delete without stock |
| `deleteShopOrder` | Single `$transaction`: `deleteMany` claim first, then restore ACTIVE line stock (no double restore) |
| `recalcShopOrderTotal` | Accepts optional txn client (used by patch/delete) |

**Already OK (unchanged this wave):** `addShopOrderLine`, order status?`CANCELED`, `createTransaction` SALE/REFUND. Completing/paying an order (`COMPLETED`) does not touch stock.

## Tests

`menu-stock-db.util.spec.ts` ? added claim sims: double cancel restores once; optimistic qty patch one winner; skip restore when already canceled.

## Commands + results

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns menu-stock-db.util.spec` | **PASS** ? 8 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

Note: Unrelated pre-existing `toInputJson`/`normalizeOfferingConfigPrices` type mismatch in `resources.service.ts` widened to `unknown` so build stays green (not a finance change).

## Residual risks

1. Order-level cancel (`status?CANCELED`) still restores after find without `updateMany` claim on each line ? same READ COMMITTED double-restore window as before (pre-existing).
2. Unit tests simulate claim ordering; no live Postgres concurrency suite yet.
3. `deleteShopOrder` restores stock *after* delete claim ? crash between delete and restore could leave stock unrestored (rare; prefers no double-restore).
4. Daily stock reset still runs outside patch txn on add path only (`ensureMenuItemStock`); conditional `stock >= delta` still gates oversell.

---

# Image / media upload hardening ? 2026-07-20

**Scope:** Production-safety audit of menu / gallery / resources / cover image uploads. No UI redesign; no schema migration.

## Gaps fixed

| Control | Change |
|---------|--------|
| MIME allowlist | Client MIME + **magic-byte sniff** (`sniffImageMime`); reject polyglot/non-image bodies that claim `image/jpeg` etc. |
| Size limit | Shared `IMAGE_UPLOAD_MAX_BYTES` (8?MB) on assert + multer `limits` via `imageUploadMulterOptions()` |
| Path traversal | `assertSafeMediaId` / `parseMediaPath` reject separators & `..`; legacy `/uploads/?` paths reject `..` / `\` / NUL |
| Shop-scoped storage | Uploads already create `StoredImage` with `shopId`; **deletes** now `deleteMany({ id, shopId })` so cleanup cannot remove another shop?s row |
| Multer filter | All upload controllers use shared options (memory storage, 1 file, MIME filter) |
| Corrupt decode | `storeFromUpload` maps sharp failures ? `400`; serve path sanitizes Content-Type to `image/*` |

**Endpoints covered:** `POST menu/sections/:id/image`, `menu/items/:id/images/:slot`, `gallery/cover`, `gallery/items`, `resources/gaming-sections/:id/image`, `dining-table-groups/:id/image`, `categories/:id/images/:slot`. Storage remains DB (`StoredImage`) + re-encode to WebP/gzip (not raw disk writes).

## Tests / build

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns image-media.util.spec` | **PASS** ? 11 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Residual (accepted for now)

1. **No virus / malware scan** (ClamAV etc.) ? rely on allowlist + sharp re-encode.
2. **Public `GET /media/:id`** ? opaque cuid still world-readable if leaked (intentional for public gallery/menu `<img>`); CORS `*` removed 2026-07-20 (global origin allowlist for API fetches; `<img>` needs CORP only). Long cache kept. No signed/shop-scoped URLs (would break public venue pages). No media listing; legacy `/uploads` static uses `index: false`.
3. **Legacy disk `app.useStaticAssets(uploads)`** ? still served for old `/uploads/?` URLs; new uploads do not write disk.
4. **No per-shop storage quota** / upload rate beyond global throttling.

---

---

# Public/guest booking create hardening - 2026-07-20

**Scope:** Harden public dining/gaming reservation create DTO + service edge rejects. No booking-lock rewrite, no finance reporting, no migrate reset.

## Validations added

| Layer | Check |
|-------|--------|
| DTO `CreatePublicGamingReservationDto` | `partySize` 1-100; `guestEmail` `@IsEmail` + max 200; `guestPhone` optional 5-40 chars; `resourceId`/`guestName` min length; **no `shopId` field** (pipe `forbidNonWhitelisted`) |
| DTO `CreatePublicDiningReservationDto` | Extends gaming DTO (identical bounds); wired on `POST .../dining/reservations` |
| DTO `CreatePublicEventRequestDto` | Same party/phone bounds; `guestName` min length |
| Service `createPublicGamingBooking` (`kind: 'dining' \| 'gaming'`) | `shopId` only from published venue slug; resource must match `shopId`; dining requires `DINING` type; valid start/end; `endsAt > startsAt`; party vs capacity; **`assertWithinOpeningHours`** (shop timezone). Locks unchanged (`withResourceBookingLock`). |

## Dining paths covered

| Path | Hardening |
|------|-----------|
| `POST /public/venues/:slug/dining/reservations` | Shared create + dining kind type gate |
| `GET .../dining/schedule` | Shop from published slug; dining kind filter |
| `GET/POST .../dining/reservations/status/:token` (+ cancel) | Kind gate + guest token verify |
| Public event request (`CreatePublicEventRequestDto`) | Party/phone/name bounds (request, not instant book) |

## Tests + build

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns reservations.service.spec` | **PASS** - dining reject/trust suite (slug, party bounds, shop-scoped resource, capacity, hours, type mismatch, shopId from slug) |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Remaining

- Staff `CreateReservationDto` party max still unbounded at DTO (optional follow-up).

---

---

# Tenant mutation hardening (shopId in where) ? 2026-07-20

**Scope:** IDOR hardening for high-traffic mutating Prisma paths ? add `shopId` (or order-scoped key) to `update`/`delete`/`updateMany`/`deleteMany` `where` clauses after shop-scoped load. Prisma 6 extended where unique.

**Conflict avoidance:** No money Decimal/migrations; no finance reporting aggregates; no migrate reset.

## Fixed sites (~58 mutation call sites)

| Area | Files | Pattern |
|------|-------|---------|
| Reservations | `reservations.service.ts` | Guest cancel + staff update/delete + resource status flips: `{ id, shopId }` |
| Event requests | `event-requests.service.ts` | Public cancel + staff decline/approve/cancel |
| Finance / orders / sessions | `finance.service.ts` | ShopOrder update/delete/recalc; lines via `{ id, shopOrderId }`; play billing reservation + resource; PlaySession pay/cancel/update; ShopLoss delete |
| Menu | `menu.service.ts` | Section/item/tag update+delete; tag sync `deleteMany` via `menuItem.shopId` |
| Resources | `resources.service.ts` | Category/unit/section/table-group CRUD+images; `updateMany`/`deleteMany` inventory sync; rates delete scoped by `category.shopId` |
| Guest | `guest-chat.service.ts`, `venue-reviews.service.ts` | Guest + staff chat mutations; review status/delete |

Helper: `shopScopedWhere(id, shopId)` in `common/tenant.ts` (available for follow-ups).

## Tests

| Suite | Result |
|-------|--------|
| `tenant.spec.ts` | PASS (requireShopId + shopScopedWhere) |
| `finance.service.tenant.spec.ts` | PASS ? deleteShopOrder `deleteMany` includes `shopId`; cross-tenant reject; cancelPlaySession scoped |

## Commands + results

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns "tenant.spec|finance.service.tenant.spec"` | **PASS** ? 7 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Residual follow-up (hours/gallery/seating/audit) ? 2026-07-20

**Fixed:** Previously id-only mutations after shop-scoped loads now use `{ id, shopId }`:

| Service | Mutations |
|---------|-----------|
| `hours.service.ts` | `scheduleException` update/delete |
| `gallery.service.ts` | `galleryItem` update/delete |
| `reservations/seating-tables.service.ts` | `seatingTableGroup` update/delete |
| `audit.service.ts` | `auditLog.delete` |

**Still accepted / out of scope:** Public `GET /media/:id` (opaque URLs); `ShopOrderLine` via parent `shopOrderId`; user-keyed staff/auth paths. (Notifications shop scoping: see residual follow-up below.)

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns "hours.service.tenant|gallery.service.tenant|seating-tables.service.tenant|audit.service.tenant"` | **PASS** ? 7 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

# Guest cancel / status edge cases (post hash tokens) ? 2026-07-20

**Scope:** Tighten cancel + status reuse after hash tokens. Extend `guest-token.util` (no rewrite). No migrate reset.

## Behaviors verified / fixed

| Behavior | Status |
|----------|--------|
| Cancel revokes token; reuse refused (`assertGuestTokenActive`) | **Fixed** ? public cancel always writes `guestTokenRevokeFields`; already-canceled path seals if not yet revoked |
| Expired tokens cannot cancel/status | **Verified** ? gate before cancel; tests for hash + legacy expiry |
| Staff cancel revokes guest token | **Fixed** ? staff update always revokes on CANCELED/NO_SHOW (not only on status transition); event staff cancel already revoked; auto NO_SHOW cron now revokes |
| Dual-read legacy plaintext until expiry | **Verified** ? lookup OR + verify + expiry assert; tests added |

## Call-site deltas

- `guestTokenNeedsRevoke` helper on util.
- `cancelPublicGamingBooking` / `cancelFromPublic`: seal leftover active tokens on already-canceled.
- `ReservationsService` staff update: unconditional revoke fields when status is cancel/no-show.
- `ReservationRemindersService` NO_SHOW: revoke guest token.

### Cron safety note (auto NO_SHOW)

- Path: `ReservationRemindersService.tick` ? `autoNoShowSessions` (`@Cron` every minute).
- Transition is conditional `updateMany` only when status ? `{CONFIRMED, PENDING}` ? `NO_SHOW`, with `guestTokenRevokeFields` in the **same** write.
- Double-run / multi-instance: second writer gets `count === 0` and skips free-unit, audit, and notify (`dedupeKey: auto_no_show:{id}` as belt-and-suspenders).
- No migrate reset.

## Tests / build

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns guest-token.util.spec` | **PASS** ? 16 tests |
| `npx jest --testPathPatterns reservation-reminders.service.spec` | **PASS** (conditional NO_SHOW + revoke; double-run skip) |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |


---

# Money serialize + offeringConfig normalize ? 2026-07-20

**Scope:** Hot API money fields as JS `number` via `serializeMoney`; round JSON `offeringConfig` prices on write. No ledger / finance aggregate rewrite. Schema Decimal migration untouched.

## What shipped

- `normalizeOfferingConfigPrices` / `mapOfferingConfigPrices` in `offering-config.util.ts` (shared with shop FX reprice)
- Category create/update: normalize prices after `@IsOfferingConfig` validation
- API serialize (Decimal?rounded number, not Decimal string JSON):
  - Finance: shop orders, transactions, losses, play billing amounts, walk-in sessions
  - Menu: item `price` on list/get
  - Resources: rates + `hourlyRate`; offeringConfig normalized on read
  - Public shop: menu prices + rates
- Reservations guest billing already used `serializeMoneyOrNull`
- Specs: serializeMoney edge cases + normalizeOfferingConfigPrices

## Remaining float JSON spots

- `ResourceCategory.offeringConfig` still stores **JSON numbers** (not Prisma Decimal columns) ? now rounded on write; FX still walks via `mapOfferingConfigPrices`
- Legacy dirty offeringConfig in DB until next edit/reprice
- Analytics/report helpers still use `toMoneyNumber` internally (skipped rewrite)
- `billingDiscountPercent` remains Float (percent)


---

# Full API unit suite verification ? 2026-07-20

**Scope:** Post-parallel-waves verification of `apps/api` unit suite + build. Failures only; no scope expansion.

## Commands + results

| Command | Result |
|---------|--------|
| `npx jest --no-coverage` | **PASS** ? 23 suites, 171 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Fixes

None required ? suite was green after parallel waves settled (transient mid-land failures on first run cleared without code changes).

---

# Walk-in play session race harden ? 2026-07-20

**Scope:** Harden walk-in start/end/pay races. Session mutation only ? finance analytics aggregates untouched. No migrate reset.

## What was raced

1. **`updatePlaySession`** (already partially locked): move/extend/end ACTIVE resource-bound walk-ins without `FOR UPDATE` / overlap asserts could double-book vs reservations or other walk-ins.
2. **`markPlaySessionPaid`**: check-then-act `findFirst` ? `update` ? concurrent cancel could still be overwritten; pay stamp not claimed atomically.
3. **`cancelPlaySession`**: check-then-act ? concurrent pay (`completedAt` / `COMPLETED`) could lose to cancel (or cancel wipe a mid-session paid ACTIVE).

`createPlaySession` with `resourceId` already used `withResourceBookingLock` + overlap asserts (unchanged).

## What fixed

- **Pay:** `` + conditional `updateMany` (`status != CANCELED`, walk-in only) then re-read; claim count must be 1.
- **Cancel:** conditional `updateMany` only `ACTIVE` + `completedAt: null`; paid/canceled miss ? clear errors.
- **Update:** keep resource lock + overlap (exclude self) for interval/resource/end/clearPaid; status?`CANCELED` / `COMPLETED` / `clearPaid` via conditional `updateMany`; re-fetch under lock before overlap asserts.

## Files

- `apps/api/src/modules/finance/finance.service.ts` (session mutation only)
- `apps/api/src/modules/finance/finance-play-session.spec.ts`
- `apps/api/src/common/booking-lock.util.spec.ts` (exclude-self overlap)
- `docs/audit/GO_SPOTS_EXCLUSION_CONSTRAINT.md` (coverage table)
- `docs/audit/GO_SPOTS_IMPLEMENTATION_REPORT.md`

## Tests / build

| Command | Result |
|---------|--------|
| `jest --testPathPatterns finance-play-session.spec|booking-lock.util.spec` | **PASS** ? 2 suites / 10 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Remaining

- True Postgres concurrency integration still deferred (exclusion constraint post-submit).

---

# Staff seat capacity enforcement ? 2026-07-20

**Scope:** Wire entitlements seat cap into staff create / reactivate. No migrate reset; CSV dual-write untouched.

## Paths enforcing seats

| Path | Behavior |
|------|----------|
| `POST /staff` ? `StaffService.create` | `getVenueEntitlements` + `assertStaffSeatCapacity` before membership create (**403** over cap / no Team accounts / 0 seats) |
| `PATCH /staff/:id` ? `StaffService.update` when `isActive: false?true` | Same assert (closes reactivate bypass) |
| `GET /staff` ? `list` | Surfaces `seats.used` / `seats.limit` from entitlements (read-only) |

## Paths that do **not** consume a new seat

| Path | Why |
|------|-----|
| `POST /auth/staff/activate` | Password setup only; membership already `isActive` and counted at invite/create |
| `POST /staff/:id/regenerate-invite` | Re-issues setup link for existing membership |
| Owner signup / `createVenue` / `linkVenues` membership create | **OWNER** roles only ? outside staff seat pool |

## What shipped

- `assertStaffSeatCapacity` on `venue-entitlements.ts` (`hasFeature('roles')` + `staffSeatLimit`)
- Staff create/list/reactivate use central entitlements (not a parallel seat formula)
- Tests: `venue-entitlements.spec.ts` + `staff.service.spec.ts`

## Commands

| Command | Result |
|---------|--------|
| `jest --testPathPatterns venue-entitlements\|staff.service` | **PASS** ? 2 suites / 20 tests |
| `npx prisma generate` | **PASS** (unblocked stale client vs `AuthSession.familyId`) |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

---

# Notifications shopId scoping (residual) ? 2026-07-20

**Scope:** Harden notifications list/mark-read/delete mutations so they only affect the current shop membership. Fix residual id-only updates after shop-scoped loads. No UI redesign. No migrate reset.

## Already shop-scoped (verified)

| Path | Mechanism |
|------|-----------|
| `list` / `recent` / `unreadCount` / `reservationBadges` / `exportCsv` | `buildWhere` ? `shopId` + membership `OR` |
| `markAllRead` | `updateMany` via `buildWhere` |
| `archive` / `unarchive` / `removeMany` | `shopId` + ids or `buildWhere` + membership access |

## Fixed id-only mutations

| Method | Before | After |
|--------|--------|-------|
| `markRead` / `markUnread` | `update({ where: { id } })` | `shopScopedWhere(id, shopId)` |
| `markReservationTabRead` | `updateMany({ where: { id: { in } } })` | `shopId` + ids + section + membership |
| `upsert` (dedupe refresh) | `update({ where: { id } })` | `shopScopedWhere(id, shopId)` |

## Files

- `apps/api/src/modules/notifications/notifications.service.ts`
- `apps/api/src/modules/notifications/notifications.service.tenant.spec.ts`

## Tests / build

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns notifications.service.tenant` | **PASS** ? 5 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

---

# Refresh-token rotation audit + family revoke ? 2026-07-20

**Scope:** Auth session refresh lifecycle only. No migrate reset (hash column already existed).

## Lifecycle status (before ? after)

| Check | Before | After |
|-------|--------|-------|
| Hashed at rest | **Yes** ? SHA-256 hex in `AuthSession.refreshTokenHash` (schema comment wrongly said argon2) | Same; comment fixed |
| Rotate on use | **Yes** ? revoke row then `issueTokens` | Same + claim via conditional `updateMany` |
| Reuse detected | **Partial** ? revoked hash simply ?not found? | **Yes** ? lookup includes revoked; reuse ? family revoke |
| Family revoke | **No** | **Yes** ? `familyId` preserved across rotations; reuse / lost claim race revokes active family members |
| Tests | None for refresh | `auth.service.refresh.spec.ts` |

## What changed

- Migration `20260720260000_auth_session_family`: add `familyId` (backfill = row `id`), unique on `refreshTokenHash`.
- `AuthService.refresh`: reuse of revoked token or lost rotate race ? `revokeSessionFamily`; successful rotate keeps `familyId`.
- Login / activate still start a new family (`randomUUID()`).

## Commands + results

| Command | Result |
|---------|--------|
| `jest --testPathPatterns auth.service.refresh` | **PASS** ? 4 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Deploy note

`prisma migrate deploy` only ? include `20260720260000_auth_session_family` with other pending migrations. No reset.

---

# Public event-request create harden ? 2026-07-20

**Scope:** Parity with public gaming/dining booking create. No migrate reset.

## Validations

| Check | Behavior |
|-------|----------|
| DTO bounds | `guestName` 1?120; email ?200; phone 5?40; `partySize` 1?100; `message` ?2000; `resourceCategoryId` 1?64 |
| Contact | Email **or** phone required (empty strings treated as absent via `ValidateIf`) |
| `shopId` | Never from body ? published venue slug only (`whitelist` strips extras; create uses `shop.id`) |
| Opening hours | `assertWithinOpeningHours` on preferred window (end defaults to start when omitted) |
| Category scope | `resourceCategoryId` must belong to resolved shop; TABLE/GAMING type checks |
| Guest token | Already wired: `issueGuestToken` + `guestTokenPersistFields` (hash + expiry; raw once in response) |

## Tests / build

| Command | Result |
|---------|--------|
| `npx jest --testPathPatterns event-requests.service.spec` | **PASS** ? 8 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

---

# Notification href / open-redirect audit ? 2026-07-20

**Scope:** `reservation-notification-href`, notification create/serialize, guest `statusPath` / email CTA, public track links. No UI redesign.

## Findings

| Issue | Severity | Notes |
|-------|----------|-------|
| Notification `href` stored/returned without allowlist | Medium | Internal callers only, but absolute / `//?` values could reach Next `Link` (esp. public `statusPath` as bare `href`) |
| Email CTA concatenated `WEB_APP_URL` + path weakly | Medium | Non-`/` path got `/${path}`; absolute attacker path not join-safe |
| Event public `statusPath` used route `slug` param | Low | Same DB lookup; now uses `shop.slug` from DB |
| Email `<a href>` unescaped | Low | Attribute escape added for `statusUrl` |
| Cross-tenant via staff notification href | None found | Hrefs are `/sessions??` etc.; UI prefixes **current** venue path; notifications queried by JWT `shopId` |

## Fixes

- `isSafeAppRelativeHref` / `sanitizeAppRelativeHref` / `absoluteAppUrl` / `guestVenueStatusPath`
- Notifications create/upsert/serialize sanitize href (relative only)
- Reservations + event-requests build guest paths via `guestVenueStatusPath` (DB slug)
- Guest mail status URL via `absoluteAppUrl`; HTML-escape href
- Web: `safe-app-href.ts` for notification nav + public track links

## Tests / build

| Command | Result |
|---------|--------|
| `jest --testPathPatterns reservation-notification-href.spec` | **PASS** ? 22 tests |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

---

# Feature-gate wiring (high-value modules) ? 2026-07-20

**Scope:** Wire ssertShopHasFeature / hasFeature on mutate + expensive list endpoints for pack-gated modules. CORE (hours / gallery / 
otes) left ungated. No migrate reset.

## Features gated

| Feature key | Endpoints / services |
|-------------|----------------------|
| `reservation` | Event requests (list / public+staff create / review); seating tables (list+CRUD); reservations (list / schedule / public create / staff create+update+delete) |
| `messaging` | Guest chat (public create+token ops; staff list/get/mutate) via central `assertShopHasFeature` (dual-read add-ons) |
| `multi_shop` | `createVenueForOwner` (2nd+ venue); `linkVenuesByEmail` when resulting in >1 venue ? allow if any owned/linked shop has `multi_shop` **or** active trial |
| `reports` | Finance analytics / sales-by-item / top-sellers (already gated; verified) |
| `transaction` | Finance sales / orders / play billing (already gated; verified) |
| `audit` | Audit list + CSV export |
| `notifications` | Notifications list (badges/unread left open) |
| `reviews` | Staff review list / status / delete |
| `marketing` | Publish / advertise venue settings (migrated to `assertShopHasFeature`) |

## Notes

- `multi_shop` is still not granted by any pack add-on; unlock paths today are ENTERPRISE legacy modules or active trial. Catalog add-on for multi-venue remains a product follow-up.
- Guest status/cancel by existing token for events is **not** re-gated (guest already holds the request).

## Tests / build

| Command | Result |
|---------|--------|
| `jest --testPathPatterns venue-entitlements` | **PASS** ? 22 tests (incl. multi-venue entitlement cases) |
| `npx tsc --noEmit -p tsconfig.json` | **PASS** |
| `npx nest build` | **PASS** |

---

# API stabilize re-run (post-171 waves) ? 2026-07-20

**Scope:** Full `apps/api` suite after many parallel waves since the earlier **23 suites / 171 tests** green. Fix mocks/specs only where production already moved; no migrate reset.

## Commands + results

| Command | Result |
|---------|--------|
| `npx jest --no-coverage` | **PASS** ? **39 suites / 272 tests** |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

## Surgical fixes

1. **`finance.service.tenant.spec.ts`** ? `cancelPlaySession` now claims via conditional `updateMany` (`ACTIVE` + `completedAt: null` + `shopId`); tenant spec mocked `update` ? updated to `updateMany`.
2. **`auth.service.spec.ts`** ? staff-activate shop subscription mock filled `tier` / `status` / `trialEndsAt` (`SubscriptionTier` / `SubscriptionStatus`) so `assertStaffSeatCapacity` sees `roles` from `team_accounts`.
3. **`reservations.service.spec.ts` / `seating-tables.service.tenant.spec.ts`** ? entitlements gates from parallel feature-wire wave; specs mock `assertShopFeature` / `assertShopHasFeature` (same pattern as event-requests) so tests stay on booking/tenant assertions.

## Count trail

| When | Suites | Tests |
|------|--------|-------|
| Prior stabilize | 23 | 171 |
| This re-run | **39** | **272** |

---

# Lane D ? atomic FX catalog reprice ? 2026-07-20

**Scope:** All-or-nothing shop currency catalog reprice (`repriceCatalogToCurrency`). No migrations. Did not touch `finance.service.ts` / auth / reservations.

## What is atomic now

On shop currency change, these live catalog writes commit in **one** Prisma `$transaction` (rollback on any failure):

- `MenuItem.price`
- `ResourceRate.price`
- `ResourceCategory.offeringConfig` (known money keys via `mapOfferingConfigPrices`)
- `Resource.hourlyRate` (non-zero only)

FX rate is fetched **before** the transaction; missing/invalid rates (`getRate` / `convertAmount` ? `convertMoney`) abort with no catalog writes. Historical orders/transactions remain unchanged (by design).

## Files

- `apps/api/src/modules/shop/shop.service.ts` ? transaction wrap + pre-validate rate
- `apps/api/src/modules/shop/shop.service.reprice.spec.ts` ? atomic path + reject-before-txn + fail-in-txn
- `currency-rates*` / `money.util*` ? already correct; no code changes required

## Verify

| Command | Result |
|---------|--------|
| `npx jest --no-coverage src/modules/shop/shop.service.reprice.spec.ts src/modules/shop/currency-rates.service.spec.ts src/common/money.util.spec.ts` | **PASS** (20) |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |

---

# Lane C ? multi-instance cron single-flight ? 2026-07-20

**Scope:** Prevent two API instances from double-firing reservation reminder / NO_SHOW / auto-complete side effects. No migration; no finance/booking paths.

## How the lock works

- `ReservationRemindersService.tick` wraps all four workers in `withReservationRemindersCronLock`.
- That opens a Prisma interactive transaction and calls `SELECT pg_try_advisory_xact_lock(0x4753, 0x524d)`.
- **Transaction-scoped** lock (not session `pg_try_advisory_lock`) so Prisma pool connections cannot leak/unlock on the wrong session.
- Winner runs reminder + NO_SHOW + auto-complete work while the xact lock is held; loser gets `acquired: false` and skips.
- Lock auto-releases on commit/rollback (default timeout 55s). Per-row NO_SHOW conditional `updateMany` remains as belt-and-suspenders.

## Files

- `apps/api/src/common/pg-advisory-lock.util.ts` (+ spec)
- `apps/api/src/modules/reservations/reservation-reminders.service.ts` (+ spec tick cases)

## Verify

| Command | Result |
|---------|--------|
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |
| `npx jest --testPathPatterns "pg-advisory-lock.util.spec\|reservation-reminders.service.spec"` | **PASS** (9) |

---

# Lane B ? timezone settings UI ? 2026-07-20

**Scope:** Wire IANA `timezone` on existing shop settings UI (API already GET/PATCH `/shop/settings`). No API/prisma changes.

**UI path:** Dashboard ? Settings ? Regional preferences (`/dashboard/[venuePath]/settings`)

**Changes:**
- `ShopSettings` + draft/payload include `timezone`; autosave PATCH sends it.
- Regional section: timezone `<select>` (`Intl.supportedValuesOf('timeZone')` with fallback list).
- Client validates via `isValidIanaTimeZone` before save; API `ApiError` message shown on reject.

**Verify:** `pnpm --filter @gospots/web run typecheck` ? **PASS**

---

# Lane F ? GDPR export stub ? 2026-07-20

**Scope:** Owner-only read-only JSON export of shop-scoped personal data. No pack gate. No delete/erasure. API only.

## Route

`GET /api/v1/gdpr/export` ? JWT + `ShopRoles('OWNER')`; `shopId` from venue context. No feature/pack gate.

## Export package includes

- `meta` ? exportedAt, shopId, requestedByUserId, limitations
- `shop` ? venue contact fields (email, phone, address, city, country, names)
- `memberships` ? role + linked user contact fields (email, name, staffHandle; no secrets)
- `reservations` ? guestName/Email/Phone, party, window, status, notes
- `eventRequests` ? guest contact + message/status
- `contactMessages` ? guest contact + subject/message
- `guestChats` ? guest contact + message bodies (tokens omitted)
- `venueReviews` ? guestName/Email, rating, comment, status

**Omitted:** password hashes, invite/reset tokens, guest tokens/hashes, auth sessions, billing provider payloads, other shops.

## Limitations (not full GDPR)

Stub only ? no DSAR workflow, no right-to-erasure/delete endpoint, no cross-shop merge, JSON only. Documented in `DEPLOY_CHECKLIST.md` known limitations.

## Files

- `apps/api/src/modules/gdpr/` (module, controller, service, spec)
- `apps/api/src/app.module.ts` ? import `GdprModule` only (no `main.ts`)

## Verify

| Command | Result |
|---------|--------|
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |
| `npx jest --testPathPatterns gdpr.service.spec --no-coverage` | **PASS** (3) |


---

# Lane E ? mail outbox stub ? 2026-07-20

**Scope:** Design + stub only (no Prisma migration). Wrap shared `MailService.send` so all callers get intent logging without rewriting auth/reservations/finance/shop.

**Design:** `docs/audit/GO_SPOTS_MAIL_OUTBOX.md`

**Shipped (stub, not production-durable):**
- `MailOutboxService` ? structured Nest logs for attempt/sent/skipped/failed; process-local ring buffer; `enqueue()` placeholder for future DB outbox
- `MailService.send` records outbox outcomes around Resend / skip / config-missing paths
- Bodies never logged (to + subject only)

**Not shipped:** DB table, retry worker, audit-log fallback (needs shopId; system mail has none)

**Verify:** `tsc` + `nest build` PASS; jest `mail-outbox.service.spec` ? 3 pass

---

# Lane A ? markPlayBillingPaid race ? 2026-07-20

**Scope:** Replace check-then-act pay on reservation play billing with conditional unpaid?paid claim (mirrors walk-in `markPlaySessionPaid`). No migration.

**Before:** `findFirst` ? compute amount ? unconditional `reservation.update` (concurrent pays could both stamp / overwrite).

**After:** One ``: load + billability check ? `updateMany` where `billedAt: null` (+ not canceled/no-show) stamps `billedAmount` / `billedAt` / discount / payment method (and `COMPLETED` when session ended). Claim miss ? `ConflictException`.

**Files:** `finance.service.ts` (`markPlayBillingPaid` only); `finance-play-billing.spec.ts`

**Verify:** `tsc` + `nest build` PASS; jest play-billing + play-session ? 10 pass

# Lane H ? GDPR export web trigger ? 2026-07-20

**Scope:** Owner-only UI control to download shop-scoped personal-data JSON via existing `GET /api/v1/gdpr/export`. No API changes. No timezone/settings redesign.

## UI location

Dashboard **Shop settings** ? bottom **Privacy & data** section ? **Download data export** (visible only when membership role is `OWNER`).

## Files

- `apps/web/src/lib/gdpr-client.ts` ? fetch + JSON download helper
- `apps/web/src/components/settings/shop-settings-panel.tsx` ? Privacy section (owner-gated)
- `apps/web/src/lib/i18n.ts` ? `settings.privacy*` / `downloadExport` / `exportFailed` (en + pl; other locales fall back / spread en)

## Verify

| Command | Result |
|---------|--------|
| `pnpm --filter @gospots/web run typecheck` | **PASS** |

---

## Lane L ? Resource vs dining model merge (design only) ? 2026-07-20

**Scope:** Bible deferred item. Design doc only ? **no apps code, no migrations.** Implementation explicitly blocked until after Friday submit.

**Deliverable:** `docs/audit/GO_SPOTS_RESOURCE_MODEL_MERGE.md` ? as-is Resource/`DiningTableGroup` vs `SeatingTableGroup` split; merge risks; phased post-submit approach (product decision ? contract ? dual-write ? cutover).

**Verify:** n/a (docs)

---

## Lane M ? Unified customer ticket / guest tab (design only) ? 2026-07-20

**Scope:** Bible deferred item (audit ?2.16 / ship-plan OUT). Design doc only ? **no apps code, no migrations.** Implementation blocked until after Friday submit.

**Deliverable:** `docs/audit/GO_SPOTS_UNIFIED_TICKET.md` ? as-is Reservation vs PlaySession vs ShopOrder vs GuestChat (+ EventRequest) fragmentation; target `GuestCheck` settle root; risks (finance double-count, tokens); phased post-submit plan (ops container ? soft links ? staff UX ? single settle ? identity consolidate).

**Verify:** n/a (docs)

---

# Lane J ? owner/staff session list + revoke (API) ? 2026-07-20

**Scope:** Auth session management API only (no web UI, no migration). Uses existing `AuthSession` + `revokeSessionFamily`.

## Routes

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/v1/auth/sessions` | Active sessions: `id`, `createdAt`, `userAgent`, `expiresAt` (no tokens/hashes; no `updatedAt` column) |
| `DELETE` | `/api/v1/auth/sessions/:id` | Own session only; family revoke; 204 |
| `POST` | `/api/v1/auth/sessions/revoke-others` | Keeps current family (refresh cookie, else JWT `sid`); `{ revokedCount }` |

## Verify

| Command | Result |
|---------|--------|
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** |
| `npx nest build` | **PASS** |
| `npx jest --testPathPatterns auth.service.sessions.spec` | **PASS** (6) |

---

## Lane N ? realtime websockets (design only) ? 2026-07-20

**Scope:** Audit P2 realtime gap. Design doc only ? **no apps code, no deps, no gateway.**

**Deliverable:** `docs/audit/GO_SPOTS_REALTIME.md` ? current polling/`live-events` baseline; priority surfaces (floor, notifications, guest chat); SSE recommended first vs Nest WS / Socket.IO; cookie + CSRF + multi-instance notes; phased post-submit plan. Implementation explicitly deferred until after Friday submit.

**Verify:** n/a (docs)

---

## Lane O ? sessions UI (web) ? 2026-07-20

**Scope:** Web account security UI for Lane J session APIs. **No API edits.** Did not touch shop-settings timezone/GDPR sections.

**UI path:** Dashboard ? Shop settings ? **Sessions** panel (below shop settings sections)

**Files**
- `apps/web/src/lib/auth-sessions-client.ts` ? `GET/DELETE /auth/sessions`, `POST /auth/sessions/revoke-others`
- `apps/web/src/components/settings/auth-sessions-panel.tsx` ? list, revoke one, revoke others (+ confirm dialog)
- `apps/web/src/app/(tenant)/dashboard/[venuePath]/settings/page.tsx` ? mount panel for signed-in users
- `apps/web/src/lib/i18n.ts` ? EN/PL `settings.sessions*` keys

## Verify

| Command | Result |
|---------|--------|
| `pnpm --filter @gospots/web run typecheck` | **PASS** |

---

## Lane P ? owner 2FA (design only) ? 2026-07-20

**Scope:** Audit P1 ?2.9 MFA gap. Design doc only ? **no apps code, no schema, no migrations.**

**Deliverable:** `docs/audit/GO_SPOTS_2FA.md` ? TOTP preferred over email OTP; owner-first (`VENUE_OWNER`); mandatory recovery codes; login challenge + session family revoke coupling; phased post-submit plan. Implementation explicitly deferred until after Friday submit (sessions list/revoke API + UI already exist).

**Verify:** n/a (docs)

---

## Lane Q ? a11y + i18n sweep (design only) ? 2026-07-20

**Scope:** Audit P2/P3 a11y/i18n gaps. Design doc only ? **no apps code.**

**Deliverable:** `docs/audit/GO_SPOTS_A11Y_I18N.md` ? current en/pl dashboard + public surface; ops/auth hardcode gaps; secondary locales fall back to EN; dashboard a11y priorities (focus trap, labels, contrast); phased post-submit plan. Implementation explicitly deferred until after Friday submit.

**Verify:** n/a (docs)

---

## Lane S ? financial ledger (design only) ? 2026-07-20

**Scope:** Audit P0 ?2.2 / migration M3. Design doc only ? **no apps code, no schema, no migrations.**

**Deliverable:** `docs/audit/GO_SPOTS_LEDGER.md` ? why interim `GO_SPOTS_FINANCE_CONTRACT.md` exists; target append-only `LedgerEntry` (Decimal + currency from day one); Transaction / ShopOrder / PlaySession / Reservation ? channel map; dual-write ? backfill ? dual-read ? ledger-primary phases. Implementation explicitly deferred until after Friday submit.

**Verify:** n/a (docs)

---

## Lane T ? permissions/addOns CSV cutover (design only) ? 2026-07-20

**Scope:** Audit P1 ?2.13 / M7 contract phase. Design doc only ? **no apps code, no schema, no migrations.**

**Deliverable:** `docs/audit/GO_SPOTS_CSV_CUTOVER.md` ? dual-read/write as-is; post-Friday verification window; when to stop dual-write; DROP COLUMN sketch; web `plan.ts` already accepts `addOns` arrays / `addOnRows`. Implementation explicitly deferred until dual-read confidence after Friday.

**Verify:** n/a (docs)

---

## Lane U ? bible / 40-point progress index ? 2026-07-20

**Scope:** Docs-only progress map. **No apps code.**

**Deliverable:** `docs/audit/BIBLE_PROGRESS.md` ? major audit/bible themes classified as Done (ship code), Design-only (linked docs), Operator Friday (Neon migrate / CORS / smoke), or Still deferred. Pulled from `OVERNIGHT_STATUS.md`, `REMAINING_P0_FRIDAY.md`, completed `AGENT_COORDINATION.md` lanes, and design docs (2FA, ledger, realtime, a11y, currency stamps, mail outbox, resource merge, unified ticket, observability, CSV cutover).

**Verify:** n/a (docs)

---

## Lane FF ? guided onboarding (design only) ? 2026-07-21

**Scope:** Bible #31 ? onboarding too complex. Design doc only ? **no apps code, no schema, no migrations.**

**Deliverable:** `docs/audit/GO_SPOTS_ONBOARDING.md` ? resumable 10-step flow (details ? TZ/currency ? hours ? template ? category ? resources ? pricing ? test session ? staff ? public preview); five venue templates (billiard hall, console lounge, PC caf?, bowling center, mixed activity); compose existing shop/hours/resources/staff APIs; template seed API deferred; register redirect switch post-Friday.

**Verify:** n/a (docs)

---

## Lane HH ? offline / degraded ops (design only) ? 2026-07-21

**Scope:** Bible #32 ? offline and degraded-operation behavior unclear. Design doc only ? **no apps code, no service worker, no mutation queue.**

**Deliverable:** `docs/audit/GO_SPOTS_OFFLINE.md` ? failure modes A?F; fail-closed on money/booking; global connectivity banner + classified `ApiError` copy + poll backoff phased post-Friday; partial-outage operator runbook sketch; explicit non-goals (no PWA/offline finance queue).

**Verify:** n/a (docs)

---

## Lane JJ ? marketplace after supply (design only) ? 2026-07-21

**Scope:** Bible #35 ? public marketplace should come after venue supply. Design doc only ? **no apps code, no billing changes, no city routes.**

**Deliverable:** `docs/audit/GO_SPOTS_MARKETPLACE.md` ? city-first GTM playbook (pilot city ? manual onboard ? free/trial profiles ? local traffic ? promo); S2 density gates before guest acquisition; documents existing `/venues` + `isPublished`/`advertiseOnVenuesPage`/`marketing` gates; post-submit phases M0?M5 (city landing, pilot cohort, free directory entitlement split).

**Verify:** n/a (docs)

---

## Lane MMMMMM ? marketplace Phase A (city landing + GTM checklist) ? 2026-07-21

**Scope:** Bible #35 Phase A ship bar ? real city landing + in-repo GTM checklist (not playbook-only). **No** live cohort execution claimed; **no** Neon/API/schema/billing.

**Deliverable:**
- `apps/web/src/lib/pilot-cities.ts` ? Wroc³aw pilot config
- `/venues/wroclaw` city landing (`venues/[citySlug]/page.tsx` + `city-landing.tsx`) en/pl
- `PilotCityCta` on `/` + `/for-venues`; `/venues` pilot hint + empty-state
- `docs/audit/MARKETPLACE_GTM_CHECKLIST.md` (S0?S4 checkboxes)
- Status: #35 ? **DONE (Phase A)**; residual S1?S4 execution + M4?M5

**Verify:** `pnpm --filter @gospots/web run typecheck` ? `pnpm --filter @gospots/web run i18n:check`

---

## Lane KK ? public abuse CAPTCHA escalation (design only) ? 2026-07-21

**Scope:** Bible #26 CAPTCHA slice ? rate limits shipped (Lane BB); challenge vendor not wired. Design doc only ? **no apps code.**

**Deliverable:** `docs/audit/GO_SPOTS_PUBLIC_ABUSE.md` ? documents `PUBLIC_THROTTLE_*` surfaces; progressive escalation (429 ? require token; cross-surface burst); Turnstile vs hCaptcha comparison; env sketch; phased post-Friday rollout.

**Verify:** n/a (docs)

---

## Lane GGGGG ? CAPTCHA verify util stub ? 2026-07-21

**Scope:** Bible #26 PARTIAL ? small implementation stub after Lane KK design. Default off; **no** `public.controller` / widget wire.

**Shipped:**
- `apps/api/src/common/captcha.util.ts` ? `resolveCaptchaConfig` / `captchaTokenRequired` / `verifyCaptchaToken` / `assertCaptchaOrThrow` (Turnstile + hCaptcha siteverify; injectable fetch)
- Env `CAPTCHA_*` placeholders in `.env.example` / `.env.production.example`
- Design Phase **0.5** in `GO_SPOTS_PUBLIC_ABUSE.md`

**Verify:** jest `captcha.util` **11** PASS

---

# Lane SS ? durable mail outbox ? 2026-07-21

**Scope:** Bible #22 slice ? expand-only `MailOutbox` + enqueue-on-send + cron worker. #22 stays PARTIAL until prod retries proven.

**Shipped:**
- Migration `20260721020000_mail_outbox` (status, attempts, nextAttemptAt, idempotencyKey, payload JSON, shopId nullable)
- `MailService.send` persists PENDING before Resend; SENT / FAILED+backoff / SKIPPED
- `MailOutboxProcessor` `@Cron(EVERY_MINUTE)` + `withMailOutboxCronLock` (GS/MO); batch 20
- Deploy docs migration #8

**Verify:** `tsc` + `nest build` PASS; jest mail-outbox / pg-advisory-lock ? 13 PASS

---

## Lane YYYY ? tenant isolation resources specs ? 2026-07-21

**Scope:** Bible #3 PARTIAL ? extend two-venue unit-test matrix beyond menu/gallery. **No** RLS, no production service changes, no hot files.

**Shipped:**
- `apps/api/src/modules/resources/resources.service.tenant.spec.ts` ? Shop A cannot update/delete Shop B resource units or categories; asserts `shopId` in Prisma `where`; cross-tenant ? `NotFoundException` with no write.

**Verify:** jest `resources.service.tenant.spec` **8** PASS; all `tenant.spec` **9 suites / 33** PASS.

**Residual:** staff/media/event-request isolation specs; Postgres RLS post-Friday.

---

## Lane AAAAA ? tenant isolation staff specs ? 2026-07-21

**Scope:** Bible #3 PARTIAL ? extend two-venue unit-test matrix to staff memberships. **No** RLS, no production service changes, no hot files.

**Shipped:**
- `apps/api/src/modules/staff/staff.service.tenant.spec.ts` ? Shop A cannot update/remove/regenerate-invite Shop B staff memberships; asserts `shopId` in Prisma `findFirst` where; cross-tenant ? `NotFoundException` with no write.

**Verify:** jest `staff.service.tenant.spec` **6** PASS; all `tenant.spec` **10 suites / 39** PASS.

**Residual:** media/event-request isolation specs; Postgres RLS post-Friday.

---

## Lane DDDDD ? finance panel i18n ? 2026-07-21

**Scope:** Bible #30 PARTIAL ? finish stuck WWWW; finance hub/panels/play-billing UI chrome ? dashboard `finance.*` en/pl. **No API.**

**Shipped:**
- `i18n.ts` top-level `finance.*` en/pl (hub, overview KPIs, transactions, losses, reports, invoices, game billing + edit dialog)
- Wired `finance-hub`, overview/transactions/losses/reports/invoices panels, `game-billing-panel` + edit dialog, play-billing FeatureGate title
- Tabs keep existing `financeHub.*`

**Verify:** `i18n:check` PASS (dashboard **1133/1133**, public **910/910**); web typecheck PASS.

**Residual:** invoice-document print sheet chrome; secondary locales; formal i18n sweep.

---

## Lane JJJJJ ? axe smoke route expand ? 2026-07-21

**Scope:** Bible #29 PARTIAL ? expand optional `test:a11y:smoke` beyond YYY?s 8 public routes. **No API.** **Not** CI-gated.

**Shipped:**
- `apps/web/e2e/a11y.spec.ts` ? +5 routes: `/`, `/staff/activate`, guest status placeholders gaming/dining/event under `/venue/a11y-smoke/.../a11y-placeholder` ? **13** total
- Same axe WCAG tags; critical hard-fail; soft-log serious/moderate/minor; skip when Next is down

**Verify:** web typecheck PASS; `test:a11y:smoke` without server ? **13 skipped**.

**Residual:** dashboard/settings/dialogs matrix; formal contrast/focus; CI gate.

---

## Lane AAAAAA ? owner 2FA / TOTP ? 2026-07-21

**Scope:** Bible **#18 DONE** ? owner-only authenticator MFA end-to-end (no Neon deploy).

**Shipped:**
- Migration `20260721080000_user_mfa_totp` (User TOTP columns + `MfaRecoveryCode`)
- `mfa-totp` / `mfa-recovery` / `mfa-challenge` utils + specs
- Auth enroll/confirm/disable/regenerate + login `{ mfaRequired, mfaToken }` then `POST /auth/mfa/verify`; `LoginResult` / `MfaLoginChallenge` narrowing in controller
- Web `AuthMfaPanel` + login MFA step (en/pl); env `MFA_TOTP_ENCRYPTION_KEY`

**Verify:** jest mfa **18** PASS; `nest build` PASS; web typecheck PASS; `i18n:check` **1871**+**989**.

**Residual:** OPERATOR Neon migrate; staff MFA / WebAuthn / org require-MFA.
