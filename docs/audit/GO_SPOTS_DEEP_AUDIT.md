# GoSpots / Locora — Deep Repository Audit (Phase 1)

**Date:** 2026-07-20  
**Scope:** Read-only verification against current code under `D:/Programing/Projects/Web-Development/Gaming-SaaS`  
**Brand note:** Repo/package name is `gospots`; UI/API product name is **Locora**.  
**Method:** Architecture map + targeted greps + flow tracing (auth, public booking, session billing, Lemon webhook). No production code changes in this phase.

**Status legend:** `CONFIRMED` | `PARTIALLY CONFIRMED` | `NOT PRESENT` | `ALREADY FIXED` | `NOT ENOUGH EVIDENCE` | `NEW RELATED ISSUE FOUND`

---

## 1. Architecture map

| Layer | Location | Role |
|-------|----------|------|
| Monorepo | `package.json`, `pnpm-workspace.yaml` | `apps/*` only; pnpm 10.12.1, Node 20.x |
| Web | `apps/web` | Next.js 16 + React 19 + Tailwind 4 + HeroUI; public venue pages + tenant dashboard |
| API | `apps/api` | NestJS 11, global prefix `/api/v1`, Helmet, cookie-parser, ValidationPipe, Throttler, JWT guards |
| Data | `apps/api/prisma/schema.prisma` | PostgreSQL via Prisma 6; ~40 migrations under `apps/api/prisma/migrations/` |
| Auth | `apps/api/src/modules/auth` | Argon2 passwords, httpOnly cookies (`access_token`, `refresh_token`), refresh rotation, `AuthSession` |
| Tenancy | `Shop` + `Membership` + `VenueContextInterceptor` (`x-venue-path`) + JWT `shopId` |
| Billing (SaaS) | `modules/billing` | Lemon Squeezy MoR checkout/portal/webhooks |
| Venue finance | `modules/finance` | Shop orders, quick `Transaction`s, play sessions, reservation billing, analytics |
| Jobs | `@nestjs/schedule` | `ReservationRemindersService` cron every minute (no queue) |
| Mail | `modules/mail` | Resend HTTP API (no outbox/retry table) |
| Deploy | `render.yaml` (API), Vercel (web per `docs/DEPLOYMENT.md`), Neon/Postgres, `docker-compose.yml` local Postgres |
| CI | **None found** (no `.github/workflows`) | |

**Commands (from package.json):**

- Root: `pnpm dev`, `pnpm build`, `pnpm lint`
- API: `pnpm --filter @gospots/api test`, `test:e2e`, `migrate:deploy`, `seed`
- Web: `pnpm --filter @gospots/web build` / `lint` (no test script)

**Modules (API):** audit, auth, billing, dashboard, finance, gallery, guest, health, hours, mail, media, menu, notes, notifications, public, reservations, resources, shop, staff.

---

## 2. Issue areas

### 2.1 P0 — Monetary Float vs Decimal / money abstraction

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P0 |
| **Evidence** | `schema.prisma`: `MenuItem.price`, `ResourceRate.price`, `Resource.hourlyRate`, `Reservation.billedAmount` / `billingBaseAmount`, `PlaySession.amount`, `ShopOrder.total` / `reservationFee`, `ShopOrderLine.unitPrice`, `Transaction.amount`, `TransactionLineItem.unitPrice`/`total`, `ShopLoss.amount` are all `Float`. No `Decimal` money type, no cents/`Int` money column, no shared money helper module. Arithmetic uses JS `number` (e.g. `finance.service.ts` `quantity * unitPrice`, `toFixed(2)` in notifications). |
| **Impact** | Rounding drift in totals, reports, FX reprice (`shop.service.ts` `repriceCatalogToCurrency` / `CurrencyRatesService.convertAmount`), and Lemon checkout local↔EUR conversions. |
| **Proposed correction** | Introduce canonical money (prefer `Decimal(19,4)` or integer minor units + currency). Migrate columns; wrap all money math in one util; stop using `Float` for currency. |
| **Tests required** | Unit: rounding/FX; integration: order total + play bill + analytics sums stable across many ops. |

---

### 2.2 P0 — Unified financial ledger vs fragmented sources / double counting

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P0 |
| **Evidence** | Four independent revenue stores: `Transaction` (quick sales), `ShopOrder` (menu tickets), `Reservation.billedAmount`, `PlaySession.amount`. Completing a shop order (`finance.service.ts` status→`COMPLETED`) does **not** create a `Transaction`. `computeRevenueSince` / `buildFinanceAnalytics` in `finance-analytics.util.ts` **sum** `tx + orders + billed reservations + walk-in play` (`reservationId: null` only for play). `aggregateTopItems` merges transaction lines **and** completed order lines into one map (additive). |
| **Impact** | Correct if staff never record the same sale twice; incorrect if both quick-sale `Transaction` and `ShopOrder` are used for the same menu sale, or if reservation billing and play billing overlap edge cases. No single ledger / posting model; reports are multi-source aggregation. |
| **Proposed correction** | Introduce append-only ledger (or make `Transaction` the sole posting target with source FKs). Analytics read ledger only. Document/enforce mutual exclusivity of paths until then. |
| **Tests required** | Integration: complete order ≠ also counted as tx; pay walk-in vs billed reservation; regression on daily close totals. |

---

### 2.3 P0 — Tenant isolation (`findUnique` by id / shopId scoping)

| Field | Value |
|-------|--------|
| **Status** | **PARTIALLY CONFIRMED** |
| **Severity** | P0 (residual) / P1 for media |
| **Evidence** | **Good:** Most tenant mutations use `findFirst({ where: { id, shopId } })` or `requireShopId(actor)` (`tenant.ts`). Overlap helpers take `shopId`. `VenueContextInterceptor` rebinds JWT shop from `slug`+`dashboardKey` **and** active membership. `verifyVenueDashboard` / `bindVenueSession` gate dashboard URLs. **Gaps:** (1) Public `GET /media/:id` loads `storedImage.findUnique({ where: { id } })` with no shop check (`media.service.ts` / `media.controller.ts`) — intentional for public images, but opaque IDs are still cross-tenant readable if leaked. (2) After shop-scoped load, some updates use `where: { id }` only (e.g. reservation cancel resource update, play session update). (3) Many `shop.findUnique({ where: { id: shopId } })` are fine when `shopId` comes from JWT. |
| **Impact** | Systemic “IDOR via bare id” is **not** as widespread as a naive audit might claim for core finance/resources. Residual risk on media and secondary updates. |
| **Proposed correction** | Always include `shopId` in mutation `where` clauses; optionally signed/scoped media URLs for non-public assets. |
| **Tests required** | Cross-tenant: actor A cannot mutate B’s order/reservation/resource by guessing id; media IDOR policy documented/tested. |

---

### 2.4 P0 — Reservation / session overlap races

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P0 |
| **Evidence** | `booking-overlap.util.ts`: `assertNoReservationOverlap` / `assertBookingSlotFree` = read `findFirst` then caller `create` (`reservations.service.ts` public booking ~261–295). **No** DB exclusion constraint, **no** `SELECT FOR UPDATE`, **no** serializable transaction wrapping check+insert. Same pattern for staff booking paths using `assertBookingSlotFree`. Walk-in overlap uses in-memory loop over ACTIVE sessions. |
| **Impact** | Two concurrent public/staff bookings for the same unit/slot can both pass the check and insert → double-book. |
| **Proposed correction** | Wrap check+create in interactive transaction with row lock on `Resource`, and/or Postgres exclusion constraint on `(resourceId, tstzrange(startsAt,endsAt))` for active statuses. |
| **Tests required** | Concurrency: parallel create same slot → one 409, one success. |

---

### 2.5 P0 — Inventory / stock races

| Field | Value |
|-------|--------|
| **Status** | **PARTIALLY CONFIRMED** |
| **Severity** | P0 |
| **Evidence** | `adjustMenuItemStockBy` (`menu-stock-db.util.ts`) uses conditional `UPDATE … SET stock = stock - delta WHERE stock >= delta` — good for oversell prevention on the decrement itself. **But** `createTransaction` (`finance.service.ts`): check stock → `transaction.create` → then `adjustMenuStock`. If adjust fails after create, sale row already committed. Order line add: `ensureMenuItemStock` then `adjustMenuStock` not always in one `$transaction` with order write. Stock fetch by `id` alone inside `adjustMenuItemStockBy` (no `shopId` in UPDATE). |
| **Impact** | Oversell largely prevented by SQL guard; orphan sales / inconsistent stock-vs-sale possible under concurrency or mid-flight failure. |
| **Proposed correction** | Single DB transaction: lock item row → adjust stock → create sale/order line. Always scope stock updates by `shopId`. |
| **Tests required** | Concurrency: N parallel sales of last unit; crash mid-path leaves no orphan SALE. |

---

### 2.6 P0 — Webhook idempotency (Lemon Squeezy)

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** (idempotency missing); signature **ALREADY FIXED**/present |
| **Severity** | P0 |
| **Evidence** | `BillingController.lemonWebhook` verifies HMAC-SHA256 via `verifySignature` with Nest `rawBody: true` (`main.ts`). `handleWebhook` updates `Subscription` by `shopId` from `custom_data` with **no** `WebhookEvent` / delivery-id table, **no** dedupe on `meta.event_id` / payload `data.id`+event. Retries re-run pack/status/pending-plan application and audit writes. No schema model for webhook receipts (grep empty). |
| **Impact** | Duplicate webhooks can re-apply pending plan clears, overwrite fields, spam audit; harder incident forensics. |
| **Proposed correction** | Persist `provider + eventId` unique; process once; return 200 on replay. |
| **Tests required** | Same payload twice → one subscription mutation; bad signature → 400. |

---

### 2.7 P0/P1 — CSRF + cookie security

| Field | Value |
|-------|--------|
| **Status** | **PARTIALLY CONFIRMED** |
| **Severity** | P1 (P0 if `SameSite=none` without CSRF) |
| **Evidence** | Auth cookies: `httpOnly: true`, configurable `COOKIE_SECURE` / `COOKIE_SAME_SITE` (`auth.controller.ts`). Default/same-site `lax`. `render.yaml` sets `COOKIE_SAME_SITE=lax`, `COOKIE_SECURE=true`. Deploy docs: use `none` only when not using Vercel rewrite proxy. **No** CSRF token middleware/endpoints (grep `csrf` empty). JWT also readable from cookie extractor. Refresh cookie path scoped to `/api/v1/auth`. |
| **Impact** | With same-origin proxy + `lax`, classic cross-site cookie CSRF is largely mitigated. Cross-origin API + `SameSite=none` would be vulnerable without CSRF or custom headers. |
| **Proposed correction** | Keep proxy + `lax` in prod; if cross-site cookies required, add CSRF double-submit or require `Authorization` header for mutations. |
| **Tests required** | Cookie flags in prod config; mutation without custom header rejected when CSRF enabled. |

---

### 2.8 P1 — Guest token hashing / expiry

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P1 |
| **Evidence** | `Reservation.guestToken`, `EventRequest.guestToken`, `GuestChat.guestToken` stored as plaintext unique strings (`schema.prisma`). Generated via `randomBytes` (`reservations.service.ts`, `event-requests.service.ts`, guest chat). Lookups by plaintext token. **Contrast:** refresh/invite/password-reset use `hashToken` (SHA-256) in `common/security/token.ts` with TTLs. Guest reservation tokens have **no** `expiresAt` column. |
| **Impact** | DB dump / backup leak grants ongoing guest cancel/status/chat access; tokens never rotate/expire. |
| **Proposed correction** | Store hash only; put raw token in URL once; add expiry + revoke on complete/cancel. |
| **Tests required** | Status/cancel with raw token; hash not recoverable; expired token 401. |

---

### 2.9 P1 — Owner sessions / 2FA absence

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** (2FA absent); sessions **PARTIALLY** present |
| **Severity** | P1 |
| **Evidence** | `AuthSession` with hashed refresh, rotation on refresh, logout revoke, lockout via `failedLogins`/`lockedUntil`. Staff login **revokes all** prior sessions (`issueTokens`); owners may keep multiple sessions. **No** list/revoke-other-sessions API. Grep: no `2fa`/`totp`/`mfa`. |
| **Impact** | Stolen owner refresh cookie / device not easily revoked; no second factor for high-value owners. |
| **Proposed correction** | Session inventory + revoke-all; optional TOTP for owners; consider single-session or device binding for owners too. |
| **Tests required** | Rotate refresh invalidates old; revoke-all; 2FA enroll/challenge when added. |

---

### 2.10 P1 — Dashboard URL secret (`slug--key`)

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** (by design; residual risk) |
| **Severity** | P1 |
| **Evidence** | `Shop.dashboardKey` unique; `generateDashboardKey()` = `randomBytes(9).toString('base64url')` (`dashboard-path.ts`). Path `slug--key`. Access still requires authenticated membership (`verifyVenueDashboard`). Key in URLs → browser history, Referer, screenshots, shared links. |
| **Impact** | Key is not auth by itself, but increases session/path leakage surface and obscurity reliance. |
| **Proposed correction** | Keep key as routing obscurity; avoid logging full path; allow rotate key; prefer opaque server-side venue binding after login. |
| **Tests required** | Wrong key → deny; membership required even with correct key; key rotation invalidates old paths. |

---

### 2.11 P1 — Oversized services (auth / finance)

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P1 (maintainability / defect density) |
| **Evidence** | Approx line counts: `auth.service.ts` ~949, `finance.service.ts` ~1750, `reservations.service.ts` ~1202. Finance mixes orders, quick sales, play billing, reservation billing, stock side-effects. |
| **Impact** | Harder reviews, higher regression risk, weak unit-test seams. |
| **Proposed correction** | Split by domain: AuthSessions, OwnerPassword, StaffInvite; Orders, PlayBilling, ReservationBilling, Ledger. Defer until integrity fixes land. |
| **Tests required** | Characterization tests before extract; no behavior change. |

---

### 2.12 P1 — Dual subscription / entitlement systems

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** (intentional dual; pack is primary) |
| **Severity** | P1 |
| **Evidence** | `Subscription.packId` + `addOns` CSV + `tier` enum. Comments: pack is commercial unit; tier for seat/legacy. Feature gates via `resolveEnabledModules` / `assertShopFeature` (`subscription-tier.ts`, `subscription-feature.util.ts`, `venue-packs.ts`). `FEATURE_MATRIX` by tier still exists alongside pack modules. Lemon webhook writes both pack and `tierForPack`. |
| **Impact** | Drift risk if one path updates tier without pack (or vice versa); cognitive load. |
| **Proposed correction** | Single source of truth = pack+addOns; derive tier; eventually drop tier from authz decisions. |
| **Tests required** | Pack/add-on → modules matrix; trial vs ACTIVE; pending plan apply. |

---

### 2.13 P1 — CSV permissions / add-ons

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P1 |
| **Evidence** | `Membership.permissions` String CSV; `Subscription.addOns` String CSV (`schema.prisma`). Helpers in `permissions.ts` / `venue-packs.ts`. Comment notes SQLite compat legacy. |
| **Impact** | No relational integrity; typo permissions; harder queries/audits; add-on parse bugs. |
| **Proposed correction** | Join tables `MembershipPermission`, `SubscriptionAddOn` (or Postgres array enums) with validated enum set. |
| **Tests required** | Grant/revoke; unknown permission rejected; add-on serialize/parse. |

---

### 2.14 P1 — Resource / dining model duplication

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P1 |
| **Evidence** | Parallel models: `DiningTableGroup` (linked to `GamingSection` + `Resource.tableGroupId`) vs `SeatingTableGroup` (floor/zone capacity counters for events). Both hang off `Shop`. Dining digital floor vs seating “how many tables free” are separate concepts in code (`resources.service.ts`, `seating-tables.service.ts`, `event-requests.service.ts`). |
| **Impact** | Dual UIs/mental models; sync bugs; event seating vs bookable DINING resources can diverge. |
| **Proposed correction** | Product decision: unify on resource-based dining **or** clearly document two layers; one write path. |
| **Tests required** | Create dining layout → public book → event request seating consistency. |

---

### 2.15 P1 — Unvalidated JSON pricing config

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P1 |
| **Evidence** | `ResourceCategory.offeringConfig` (Json). DTOs: `@IsObject()` only (`resources.dto.ts`). Runtime parsers (`bowling-modes.util.ts`, `dining-reservation.util.ts` `parseNoShowMinutes`) tolerate garbage with fallbacks. Currency reprice deep-scales known keys (`shop.service.ts` `scaleOfferingConfigPrices`). |
| **Impact** | Invalid prices/modes → silent wrong bills or free bookings. |
| **Proposed correction** | Zod/class-validator schema per resource type; reject unknown shapes on write. |
| **Tests required** | Invalid bowlingModes rejected; billing uses validated modes only. |

---

### 2.16 P1 — Unified customer ticket / bill

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** (feature absent) |
| **Severity** | P1 |
| **Evidence** | No `CustomerBill` / guest check model. Play, menu order, reservation fee fields are separate. Shop order can attach `tableReserved` + `reservationFee` but does not merge play session charges. |
| **Impact** | Split guest journey; staff reconcile mentally; analytics fragmentation (ties to 2.2). |
| **Proposed correction** | Optional `GuestCheck` with lines from menu/play/reservation; settle once. |
| **Tests required** | Open check → add food + play → pay once → single ledger post. |

---

### 2.17 P1 — Currency-change safety

| Field | Value |
|-------|--------|
| **Status** | **PARTIALLY CONFIRMED** |
| **Severity** | P1 |
| **Evidence** | Changing shop currency reprices live catalog via FX (`shop.service.ts` `repriceCatalogToCurrency`) — menu items, rates, offeringConfig, hourlyRate — **not** in one atomic transaction (loop of updates). Historical orders/tx keep numbers (documented). Still `Float`. No per-row `currency` on sales (shop-level only). |
| **Impact** | Mid-failure partial reprice; historical reports mix currencies without stamp; float FX error. |
| **Proposed correction** | Atomic reprice job; stamp `currency` on every monetary row; money type change first. |
| **Tests required** | Currency change all-or-nothing; analytics filter by currency. |

---

### 2.18 P1 — Timezone correctness

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P1 |
| **Evidence** | No `Shop.timezone`. `venueDayKey` / `localeToTz` maps a few locales → IANA zones, else **UTC** (`menu-stock.util.ts`). Opening hours + stock reset + analytics day buckets depend on this. Cron `fmtTime` uses **server local** `getHours()` (`reservation-reminders.service.ts`). |
| **Impact** | Wrong “venue day” for stock/reports; reminder times wrong across regions. |
| **Proposed correction** | Explicit `Shop.timezone`; all day boundaries and display use it. |
| **Tests required** | Stock reset at venue midnight; analytics bucket; reminder window. |

---

### 2.19 P1/P2 — Email / jobs reliability

| Field | Value |
|-------|--------|
| **Status** | **CONFIRMED** |
| **Severity** | P1 (mail) / P2 (jobs) |
| **Evidence** | `MailService`: direct Resend fetch; no retries/outbox; prod throws if unconfigured when required. Booking emails try/catch around send. Jobs: in-process `@Cron(EVERY_MINUTE)` only — no Bull/queue, no multi-instance leader election. Notification dedupe via `@@unique([shopId, userId, dedupeKey])`. |
| **Impact** | Lost emails on transient failure; duplicate cron work if multiple API instances; missed ticks on sleep/cold start (Render free). |
| **Proposed correction** | Mail outbox table + worker; for multi-instance, advisory lock or external scheduler. |
| **Tests required** | Mail retry; cron idempotent no-show; single-flight under 2 workers. |

---

### 2.20 P2 — Realtime, observability, backups, uploads, GDPR, abuse, a11y, i18n

| Topic | Status | Severity | Evidence / note |
|-------|--------|----------|-----------------|
| Realtime | **CONFIRMED** absent (marketing claims “Realtime sync”) | P2 | No WebSocket/SSE server. Polling/notifications DB only. |
| Observability | **CONFIRMED** weak | P2 | Nest logger; no Sentry/OTel wiring in app code. |
| Backups | **NOT ENOUGH EVIDENCE** in repo | P2 | Relies on Neon/host; no app-level backup docs/automation in repo beyond deploy notes. |
| Uploads | **PARTIALLY CONFIRMED** OK | P2 | DB `StoredImage` + sharp compress; legacy disk `uploads/` still served. Public media by id. |
| GDPR | **CONFIRMED** absent | P2 | No export/erase flows in API. |
| Abuse | **PARTIALLY** mitigated | P2 | Global throttle 100/min; auth endpoints tighter `@Throttle`; webhook `@SkipThrottle`. |
| a11y | **PARTIALLY** | P3 | Some `aria-*` in web components; no systematic a11y tests. |
| i18n | **PARTIALLY** present | P3 | Large `public-i18n.ts` / locale blocks; not all dashboard strings covered equally. |

---

## 3. Newly discovered issues

| ID | Status | Severity | Finding |
|----|--------|----------|---------|
| N1 | **NEW RELATED ISSUE FOUND** | P0 | `createTransaction`: persists SALE **before** stock decrement — failure/race → paid row without stock movement (`finance.service.ts`). |
| N2 | **MITIGATED (partial)** | P2 residual | Removed media `Access-Control-Allow-Origin: *` (2026-07-20). Public GET by opaque cuid + long cache remain intentional for gallery/menu `<img>`; signed URLs would break public venue pages. |
| N3 | **NEW RELATED ISSUE FOUND** | P1 | Owner multi-session vs staff single-session asymmetry; no owner session management UI/API. |
| N4 | **NEW RELATED ISSUE FOUND** | P2 | Auto no-show uses `endsAt <= now` for PENDING/CONFIRMED (`reservation-reminders.service.ts`) — may mark no-show based on end rather than start+grace; verify product intent. |
| N5 | **NEW RELATED ISSUE FOUND** | P2 | No CI workflows — regressions rely on local discipline. |
| N6 | **NEW RELATED ISSUE FOUND** | P1 | Web has **zero** automated tests / no Playwright; API has only smoke unit + e2e health. |
| N7 | **NEW RELATED ISSUE FOUND** | P2 | `prisma/dev.db` present under `apps/api/prisma/` while production path is Postgres — confusion risk for local tooling. |

---

## 4. Intentionally not changing / already OK (with evidence)

| Item | Evidence |
|------|----------|
| Password hashing | Argon2id via auth service; dummy hash compare on missing user (timing). |
| Refresh token storage | SHA-256 hash in `AuthSession`; rotation on refresh. |
| Staff/password-reset tokens | Hashed + TTL (`token.ts`, membership invite fields). |
| Lemon webhook signature | HMAC + `timingSafeEqual` + Nest `rawBody: true`. |
| Cookie httpOnly | Set on access/refresh cookies. |
| Global validation | `whitelist` + `forbidNonWhitelisted` ValidationPipe. |
| Helmet + CORS credentials | `main.ts`; CORS origins from env. |
| Feature gating helper | `assertShopFeature` used by finance/menu/resources/reservations. |
| Shop-scoped stock fetch | `fetchMenuItemStockRow` filters `id AND shopId`. |
| Atomic stock decrement guard | `UPDATE … AND stock >= delta`. |
| Play revenue double-count with reservation | Analytics excludes play sessions with `reservationId != null`. |
| Notification dedupe | Unique `(shopId, userId, dedupeKey)`. |
| Dashboard path still requires membership | `verifyVenueDashboard`. |
| Deploy migrate-on-start | `render.yaml` `prisma migrate deploy` (not reset). |
| Auth rate limits | Register/login/forgot throttled. |

---

## 5. Critical flow traces (summary)

### Login
`POST /auth/login` → argon2 verify → lockout counters → `issueTokens` → httpOnly cookies → optional `bindVenueSession` with `x-venue-path` / dashboard path.

### Public booking
Public controller → `ReservationsService` create → `assertBookingSlotFree` (TOCTOU) → plaintext `guestToken` → mail + notification.

### Session / play billing
Finance maps reservation + walk-in rows; pay updates `billedAmount` / `PlaySession.amount` — **not** unified ledger `Transaction`.

### Lemon webhook
Public `POST /billing/webhooks/lemon-squeezy` → signature → `handleWebhook` mutates `Subscription` — **not** idempotent.

---

## 6. Classification rollup (prompt issue list)

| Issue | Classification |
|-------|----------------|
| Float money | **CONFIRMED** |
| Fragmented ledger / double-count risk | **CONFIRMED** |
| Tenant findUnique-by-id systemic | **PARTIALLY CONFIRMED** |
| Overlap races | **CONFIRMED** |
| Stock races | **PARTIALLY CONFIRMED** |
| Webhook idempotency | **CONFIRMED** missing; signature **ALREADY FIXED** |
| CSRF + cookies | **PARTIALLY CONFIRMED** |
| Guest token hash/expiry | **CONFIRMED** |
| Owner sessions / 2FA | **CONFIRMED** (2FA absent; sessions partial) |
| Dashboard URL secret | **CONFIRMED** by design |
| Oversized services | **CONFIRMED** |
| Dual subscription systems | **CONFIRMED** |
| CSV permissions/add-ons | **CONFIRMED** |
| Dining model duplication | **CONFIRMED** |
| Unvalidated offeringConfig | **CONFIRMED** |
| Unified customer ticket | **CONFIRMED** absent |
| Currency-change safety | **PARTIALLY CONFIRMED** |
| Timezone | **CONFIRMED** |
| Email/jobs | **CONFIRMED** |
| P2 cluster | See §2.20 |

---

*End of Phase 1 deep audit. See also `GO_SPOTS_FIX_PLAN.md`, `GO_SPOTS_TEST_MATRIX.md`, `GO_SPOTS_MIGRATION_PLAN.md`.*
