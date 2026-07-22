# Bible status (legacy items 1–35)

> **Prefer the remade tracker:** [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) maps the **original full-audit prompt §§1–40** with honest DONE/PARTIAL/NOT_DONE.  
> This file remains the historical **#1–#35** ship-bar matrix. Crosswalk is in ORIGINAL_AUDIT_BIBLE.

**As of:** 2026-07-22  
**Source bible (legacy):** compressed P0–P3 list used during Friday ship.  
**Reality cross-check:** [`BIBLE_PROGRESS.md`](./BIBLE_PROGRESS.md), [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md), [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md), design docs linked per item.

**Update rule:** Prefer appending to [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) and updating **ORIGINAL_AUDIT_BIBLE** when a slice ships.

**Status legend:** `DONE` · `PARTIAL` · `DESIGN_ONLY` · `NOT_DONE` · `OPERATOR`

---

## Summary (legacy 1–35 ship bars)

| Status | Count | Items |
|--------|------:|-------|
| DONE | 35 | 1–35 (ship bars — **not** full mega-prompt depth) |
| PARTIAL | 0 | — (residuals listed under each item / ORIGINAL_AUDIT_BIBLE) |
| **Total** | **35** | |

**Important:** “35 DONE” means agreed **ship bars**, not “original §§1–40 complete.” See ORIGINAL_AUDIT_BIBLE for remaining PARTIAL/NOT_DONE sections.

---

## P0 — Critical

### 1. Money is represented with floating-point numbers — DONE

- **What exists**
  - Core commercial columns `Decimal(19,4)` + `money.util` ([`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md)).
  - **Lane XXXXX:** API money wire = **4dp decimal strings** via `serializeMoney` / `serializeMoneyOrNull` on finance DTOs, analytics/dashboard KPIs, menu/resources/shop public prices, play-billing, sales-by-item ([`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md)).
  - `offeringConfig` price keys stored/emitted as 4dp strings (`normalizeOfferingConfigPrices`); validators accept number|string; bowling parsers coerce.
  - Web dual-read `coerceMoney` / `parseMoneyString` (`apps/web/src/lib/money.ts`); client types `MoneyWire`; formatters + critical arithmetic coerce.
  - FX convert harden + catalog reprice uses shared money helpers.
- **What’s still missing / residual**
  - Intermediate service math still uses `toMoneyNumber` → JS number (ops UI acceptable).
  - Full cash ledger (#6) not in scope.
  - Money **inputs** (PATCH amounts) still primarily numbers from forms (string inputs optional later).
  - Verify: jest money+offering+play-billing+analytics+reprice **53** PASS; nest build PASS; web typecheck PASS.

### 2. Automated testing is far too weak — DONE

- **What exists**
  - API unit suite in CI (webhook, locks, stock, CSRF, money, guest, GDPR, auth sessions, idempotency, throttle, captcha, tenant isolation, SSE hub, etc.).
  - CI runs API lint/build/Jest + web typecheck + **ephemeral Postgres migrate dry-run** (`.github/workflows/ci.yml` jobs `api` / `api-migrate` / `web`).
  - **Lane QQ (e2e stub):** optional Playwright smoke (`apps/web/e2e/smoke.spec.ts`) via `test:e2e:smoke` — loads `/login`, asserts Locora title/brand; **skips** when Next is not running (not CI-gated).
  - **Lane CCC + XXX + HHHHHH:** opt-in live Postgres concurrency suite — [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md); skip gate + Neon-refuse + `pnpm test:concurrency`; gate unit specs; **live C1–C3 util/lock bodies** (fixtures + `Promise.allSettled`). Default `pnpm test` unchanged.
  - **Lane GGGGGG:** status flip — ship bar = **unit suite + CI + opt-in concurrency** (+ optional e2e/axe smokes).
- **What’s still missing (residual, not code ship bar)**
  - OPERATOR: run C1–C3 against local Docker (`RUN_CONCURRENCY_TESTS=1`; harness refuses Neon). Nest service-level wrappers optional.
  - Full e2e / Playwright matrix; smokes not CI-gated.
  - Web component unit tests; full `next build` / eslint CI gates.

### 3. Tenant isolation relies heavily on application code — DONE

- **What exists**
  - Audited mutators scoped with `shopId` (hours/gallery/seating/audit/notifications/finance/reservations paths).
  - Venue interceptor + membership gates for dashboard.
  - Two-venue isolation unit matrix — menu/gallery/resources/staff/event-requests/media/reviews/guest-chat (+ hours/audit/finance/seating/notifications).
  - **Lane ZZZZZ:** Postgres RLS on disk — migration `20260721050000_tenant_rls_core` ENABLE+FORCE + `app_tenant_rls_ok("shopId")` policies on 28 Tier A tables; app `SET LOCAL` via `tenant-rls.util` + Prisma ALS proxy + `TenantRlsInterceptor` (after venue bind; skips SSE). Opt-in `TENANT_RLS` (default off; fail-open when `app.rls_mode` unset). Design: [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md).
- **What’s still missing (operator / residual, not code ship bar)**
  - Neon must apply `20260721050000_*`; then operator soak **Gates 0–4** in [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) (`TENANT_RLS=on`).
  - Split DB roles (`locora_app` / migrate BYPASS), Tier B child-table policies, `public_insert` guest wrap, live pooled isolation suite.
  - Public opaque `GET /media/:id` residual accepted (no signed/shop-scoped URLs).

### 4. Reservation and session operations may have concurrency races — DONE

- **What exists**
  - Resource `SELECT … FOR UPDATE` booking locks on create/update/play-session hot paths; overlap detect script.
  - Walk-in pay/cancel/update conditional claims.
  - Postgres exclusion on disk: migration `20260721060000_reservation_resource_exclusion` — GiST `EXCLUDE` on `(resourceId, tsrange '[)')` for `PENDING`/`CONFIRMED`/`CHECKED_IN` (matches app half-open overlap). SQL in migration folder + `reservation-overlap-detect.util.ts`.
  - `withResourceBookingLock` maps exclusion `23P01` → same 409 Conflict as `assertNoReservationOverlap`.
  - Concurrency suite scaffold + Neon-safe skip gate (`test:concurrency`; live bodies still opt-in local-only).
- **What’s still missing (operator / residual, not code ship bar)**
  - Neon `migrate deploy` of `20260721060000_*` after `pnpm detect:reservation-overlaps` = 0 (never reset).
  - Live C1/C2 util/lock bodies shipped (**HHHHHH**); opt-in local Docker only (harness refuses Neon). Nest service-level wrappers optional.
  - Walk-in `PlaySession` still app-lock only (no second exclusion).

### 5. Inventory operations may oversell stock — DONE

- **What exists**
  - Atomic SALE + stock adjust in one `$transaction`; conditional `UPDATE … WHERE stock >= delta` ([`menu-stock-db.util.ts`](../../apps/api/src/common/menu-stock-db.util.ts)).
  - Order-line patch/cancel/delete claim ordering; play-billing / walk-in pay claims (Lane A).
  - **Lane BBBBBB:** shared `claimActiveLinesAndRestoreStock` — order cancel + **delete claim lines before order delete** (closes cancel↔delete double-restore); add-line day-reset inside txn; unit race sims (`shop-order-stock.util.spec` + `menu-stock-db.util.spec`).
  - **Lane CCC / XXX:** C3 design + opt-in scaffold; harness refuses Neon ([`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md)).
- **What’s still missing (residual, not code ship bar)**
  - Live C3 util body shipped (**HHHHHH**); run with `RUN_CONCURRENCY_TESTS=1` + local Docker only (never Neon `.env`). Nest `FinanceService.createTransaction` wrapper optional.
- Verify: jest menu-stock-db + shop-order-stock **16** PASS; `pnpm test:concurrency` gate **6** PASS (live describes skipped without opt-in); `tsc` + `nest build` PASS.

### 6. Financial data is fragmented across several systems — DONE

- **What exists**
  - Interim reporting contract + shared channel sum ([`GO_SPOTS_FINANCE_CONTRACT.md`](./GO_SPOTS_FINANCE_CONTRACT.md)) — still binding for analytics reads.
  - **`LedgerEntry` model + enums** + migration `20260721100000_ledger_entry` on disk (RLS policy included).
  - **Phase 2 dual-write** (`LEDGER_DUAL_WRITE`, default off): idempotent posts from transaction create, shop-order complete, play billing paid, walk-in play paid, reservation billed, shop loss create. Design: [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md).
  - Verify: jest ledger+money pattern **136** PASS; nest build PASS.
- **What’s still missing (residual)**
  - **OPERATOR:** Gates 0–7 in [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) — Neon migrate; `LEDGER_DUAL_WRITE=on` soak; `pnpm run backfill:ledger -- --apply`; optional `LEDGER_READS=on`.
  - Phase 5 ledger-primary freeze; staff cross-channel double-entry still ops-only.
- **Phase 3–4 shipped:** historical backfill CLI; `LEDGER_READS` prefer ledger SALE-by-channel in `computeRevenueSince` / `buildFinanceAnalytics` (default off).

### 7. Payment and financial actions need idempotency — DONE

- **What exists**
  - Lemon webhook receipt uniqueness; conditional `updateMany` pay claims (walk-in / play billing).
  - **Universal money-path client keys:** hot writes + Tier A/B/C finance mutations + currency apply (`SHOP_CURRENCY_APPLY`) via `withClientIdempotency` + expand-only `IdempotencyReceipt` (`20260721010000_*`). Replay same key+hash → stored JSON; key+different body → 409; in-flight → 409.
  - **Retry handoff (web):** `idempotency-key.ts` mint-once / reuse-until-success on `finance-client` / `play-billing-client` / `shop-settings-client` (currency apply); CSRF retries share header; in-flight 409 → “Still saving…”.
  - **Require-keys available (Phase 3):** `IDEMPOTENCY_REQUIRE_MONEY_KEYS` (default off for backward compat; **`.env.production.example=true`**) — Tier A / hot scopes reject missing key with **400**. Design: [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md).
  - **Lane NNNNN:** status flip — code DONE criteria met (coverage + handoff + require-keys available). Verify: jest idempotency **13** PASS.
- **What’s still missing (operator, not code)**
  - Live host must set `IDEMPOTENCY_REQUIRE_MONEY_KEYS=true` after smoke confirms all clients send keys (prod example already `true`).

### 8. Subscription webhook handling must be proven idempotent — DONE

- **What exists**
  - `BillingWebhookEvent` uniqueness migration + handler dedupe; sig-fail no receipt; duplicate no-op; prod webhook secret fail-fast.
  - Edge hardening: unknown events receipt+ignore; malformed JSON 400; `@SkipCsrf()` + `@SkipThrottle()`; specs covering edge cases.
- **What’s still missing (operator only — no code residual)**
  - Neon `migrate deploy` includes `20260720210000_*` (folder #1 of 18 — [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md)).
  - Lemon dashboard webhook URL + secret aligned with host env.
  - Post-deploy smoke: duplicate Lemon delivery no-ops ([`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md)).
  - Canonical §9 detail: [`GO_SPOTS_WEBHOOK_IDEMPOTENCY.md`](./GO_SPOTS_WEBHOOK_IDEMPOTENCY.md) (Lane **WEBHOOK8-residual-docs**).

### 9. Database migrations need stronger safety procedures — DONE

- **What exists**
  - Preflight doc **14 PASS / 4 WARN** on **18** pending folders ([`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md)); deploy checklist; never-reset guidance.
  - Candidate expand→contract playbook ([`GO_SPOTS_MIGRATION_SAFETY.md`](./GO_SPOTS_MIGRATION_SAFETY.md) + [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md)).
  - Durable safety process ([`GO_SPOTS_MIGRATION_SAFETY.md`](./GO_SPOTS_MIGRATION_SAFETY.md)).
  - **Phase 1 (KKKKK):** CI job `api-migrate` — ephemeral `postgres:16` + `migrate deploy` / `status` / `validate` (never Neon secrets).
  - **Phase 2 (CCCCCC):** durable copy-paste preflight template — [`MIGRATION_PREFLIGHT_TEMPLATE.md`](./MIGRATION_PREFLIGHT_TEMPLATE.md).
  - **Phase 3 (CCCCCC):** read-only `pnpm run verify:migrations` (+ optional `--spot-checks`) — disk folders vs `_prisma_migrations`; money NULL fail; guest hash leftovers informational.
- **What’s still missing (operator / residual, not code ship bar)**
  - Neon `migrate deploy` of pending folders + run `verify:migrations` on deploy host (never reset; never agent deploy).
  - Money/guest WARN locks remain operator-aware (not machine-encoded) — accepted.
---

## P1 — Major

### 10. Play charges and menu orders are separate — DONE

- **What exists**
  - Design: [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) — Phase 0 **Option A** (ops container) recorded.
  - **Lane NNNNNN (2026-07-21):** Phase 1–2 ship bar — `GuestCheck` + `guestCheckId` on `ShopOrder` / `PlaySession` / `Reservation`; migration `20260721110000_guest_check` on disk; attach/detach/list/void APIs; staff **Open tabs** UI with running total; anti-double-count util + specs (linked play excluded; `reservationFee` embedded).
- **What’s still missing / residual**
  - Phase 3b Option B/C settle-as-revenue-root (finance-contract rewrite) — not required for ops close-out.
  - Phase 4–5 guest-token consolidation / contract drop.
  - **OPERATOR:** Neon migrate `20260721110000_*` (if not already applied).
- **Phase 3a shipped (BIBLE10-guest-check-settle):** `POST …/settle` marks OPEN→SETTLED after children are COMPLETED/CANCELED/billed; staff Settle UI; **no second ledger/revenue post** (children already stamped via existing paths).

### 11. Oversized services contain too many responsibilities — DONE

- **What exists**
  - Helpers extracted at edges (money, locks, stock, CSRF, entitlements).
  - Capability split design + characterization-test gate ([`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md)).
  - **Phases 0–9 complete (SPLIT11 + SPLIT14):** finance all domain services + thin `FinanceService` facade (~223 lines); auth session/refresh/logout/password (owner+staff)/venue/MFA extracted; reservations public/schedule/staff + facade shell (~109 lines). Controllers unchanged.
- **Shipped slices**
  - **SPLIT11:** Phase 0 `auth.types.ts`; finance reports/losses/transactions/shop-orders/play-session/play-billing.
  - **SPLIT14-auth-*:** `AuthSessionService`, `AuthRefreshService`, `AuthLogoutService`, `AuthPasswordService`, `AuthVenueService`, `AuthMfaService`.
  - **SPLIT14-reservations-*:** `ReservationsPublicService`, `ReservationsScheduleService`, `ReservationsStaffService`.
- **Residual (by design, not blockers)**
  - `AuthService` still owns login/register/activate/me/shared `issueTokens` (~1 170 lines — credential + onboarding entry).
  - `ReservationRemindersService` cron tick may remain outside reservations facade.
  - Optional future auth slices (`AuthRegistrationService`, `AuthCredentialsService`, …) documented but out of §14 scope.

### 12. Legacy and current subscription systems coexist — DONE

- **What exists**
  - Central entitlements helper + feature/seat asserts on gated routes; dual-read pack/addOns.
  - Pack is commercial unit (`packId` + add-ons); `Subscription.tier` still written via `tierForPack` (derived display/`billedTier`).
  - **Lane FFFFFF (2026-07-21):** Phase 1 pack-only authz — `resolveModules` uses pack + `effectiveAddOnsForSubscription` only (no FEATURE_MATRIX / `legacyModulesFromTier` belt union); `menu_orders` includes `bar`; ENTERPRISE billed tier preserves `multi_shop`/`integrations` catalog gap; web `plan.ts` parity; dry-run `backfill:legacy-addon-tier` script. Design: [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md).
- **What’s still missing / residual**
  - Optional DROP `Subscription.tier` (Phase 3) after soak; pack-less rows still use `legacyModulesFromTier`; OPERATOR may run backfill to persist synthesized add-ons; dedicated catalog add-ons for `multi_shop`/`integrations` eventually.
### 13. Permissions and add-ons should not be stored as CSV strings — DONE

- **What exists**
  - Relational `MembershipPermission` / `SubscriptionAddOn` are source of truth; rows-primary reads; mutations write rows only (CSV parse input accepted, not persisted).
  - API still emits computed permission/add-on CSV strings for JWT/legacy callers.
  - Contract migration `20260721090000_drop_membership_permissions_subscription_addons_csv` on disk (DROP `Membership.permissions` / `Subscription.addOns`).
  - **`pendingAddOns` stays CSV** (no relational twin).
  - Design: [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md).
- **What’s still missing (residual)**
  - **OPERATOR:** Neon deploy DROP migration after app that never SELECTs those columns is live.
  - Optional API response polish (arrays-only); frontend already accepts arrays/`addOnRows`.

### 14. Dining and resource models appear duplicated — DONE

- **What exists**
  - Design + **Phase 0 Option C locked** + **Phase 1 observability** + **Phase 2 expand dual-write**: [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md).
  - **Lane OOOOOO / OOOOOO-p2:** contract surfaces; drift util + `pnpm detect:resource-dining-drift`; `SeatingTableGroup.sourceDiningTableGroupId` → `DiningTableGroup`; migration `20260721120000_seating_source_dining_table_group` on disk; dual-write util (`RESOURCE_DINING_DUAL_WRITE` default on) from dining table-group CRUD + section floor/zone; seating create optional source FK.
- **What’s still missing (residual, not code ship bar)**
  - Phases 3–4 UI cutover / DROP superseded non-custom seating for DINING-equivalent shops.
  - **OPERATOR:** Neon deploy expand migration.
  - No auto-sync of `availableCount` from bookings (by design until later).

### 15. Stable business rules are stored in generic JSON — DONE

- **What exists**
  - `offeringConfig` write DTO/util validation + price normalize on writes.
  - Money wire: known price keys stored/emitted as 4dp decimal **strings** (`normalizeOfferingConfigPrices`).
  - **Lane EEEEEE (Phase 0):** `schemaVersion: 1` stamp via `prepareOfferingConfigForWrite` / `stampOfferingConfigSchemaVersion` on category create/update + API serialize + FX reprice plan; validate supported versions; typed `OfferingConfigV1` / `BowlingModeV1` contract exported; read-only `pnpm inventory:offering-config`. Design: [`GO_SPOTS_OFFERING_CONFIG.md`](./GO_SPOTS_OFFERING_CONFIG.md).
  - Relational money catalog already exists in parallel (`ResourceRate`, `Resource.hourlyRate`).
- **What’s still missing (residual, not code ship bar)**
  - JSON still holds behavioral overlay (+ legacy flat price keys); full rate de-duplication / `{ rateId }` pointers = Phase 1–2 post-soak.
  - Optional column promote (`noShowMinutes`, etc.) = Phase 3 deferred.
  - Verify: jest offering-config **26** PASS (+ reprice suite).

### 16. Explicit CSRF protection was not clearly visible — DONE

- **What exists**
  - Double-submit CSRF guard + cookie/Helmet/prod Secure guidance; web CSRF headers; jest **9** guard specs; operator smoke steps in [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md).
- **What's still missing (residual, not code ship bar)**
  - Operator Gates 0–2: prod env + proxy + login+CSRF manual smoke (blocked while Render suspended).
  - Optional Playwright CSRF e2e; CSRF bootstrap / auth outage classified copy — [`GO_SPOTS_CSRF.md`](./GO_SPOTS_CSRF.md) + [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phases 5–6.

### 17. Guest-management tokens need explicit expiry and revocation — DONE

- **What exists**
  - Hash-at-rest + expiry on create/validate; cancel/NO_SHOW revoke; dual-read legacy plaintext.
  - **Lane PP:** dry-run-by-default `clear:guest-plaintext` CLI + util clears leftover plaintext **only** when `guestTokenHash` is present (Reservation / EventRequest / GuestChat). Documented in [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) post-verify tool.
  - Expand migration on disk: `20260720250000_guest_token_hash_expiry`.
  - Cutover design ([`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md)) — dual-read stop → DROP plaintext post-verification.
  - **Lane DDDDDD:** status flip — hash/expiry/revoke + clear tooling = DONE ship bar (same pattern as #19 hash dual-write / optional DROP).
- **What’s still missing (operator / residual, not code ship bar)**
  - Operator must run clear after Neon migrate + verification window; dual-read stop + DROP plaintext columns deferred (design only).
  - Status emails may omit `statusPath` for hash-only rows (documented Option A in design).

### 18. Owner accounts need stronger protection — DONE

- **What exists**
  - Refresh family revoke; sessions list/revoke API + settings UI; UA on issue; password-reset/invite atomic consume.
  - **Lane OO:** forced reauth on `POST /gdpr/erase-guest` — body `password` or `X-Confirm-Password` verified against owner `passwordHash` via `assertUserPassword`; settings erase form requires password before confirm.
  - **Lane VV:** new-device / new-UA sign-in email after successful `login` when incoming UA differs from all active sessions’ `userAgent`s (or no active sessions); mail via `MailService.send` (outbox enqueue); fail-open if delivery fails. Helper: `new-device-alert.util.ts`.
  - **Lane AAAAAA:** owner-only TOTP MFA — migration `20260721080000_user_mfa_totp` (User `totpEnabled` / `totpSecretEnc` / `totpVerifiedAt` + `MfaRecoveryCode`); enroll begin/confirm, disable, recovery regenerate; login returns `{ mfaRequired, mfaToken }` (no cookies) until `POST /auth/mfa/verify`; recovery codes single-use hashed; MFA failures share `failedLogins`/`lockedUntil`; password reset does not clear TOTP. Web: settings `AuthMfaPanel` + login challenge step. Helpers: `mfa-totp` / `mfa-recovery` / `mfa-challenge` utils. Design: [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md).
- **What’s still missing (residual)**
  - Forced reauth not yet applied to other sensitive owner actions beyond guest erase / MFA mutations.
  - Staff / manager MFA; WebAuthn; org “require MFA” policy — deferred; phased plan [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md).
  - **OPERATOR:** Neon `migrate deploy` of MFA migration (never from workstation prod `.env`).

### 19. A secret-like dashboard key appears in the URL — DONE

- **What exists**
  - Address bar uses slug-only dashboard URLs; middleware 307-rewrites legacy `/dashboard/slug--key/...` → `/dashboard/{slug}/...`.
  - Staff activate, login `next=`, ops/features redirects, Lemon checkout success URL all strip to slug-only.
  - **Rotate (IIII):** owner `POST /shop/dashboard-key/rotate` + password reauth; audit; settings UI re-bind.
  - **Phase 2 (MMMM/QQQQ):** membership-only slug bind; auth JSON public `venuePath`; `/me` omits `dashboardKey`.
  - **Phase 3 (QQQQQ):** legacy `slug--key` **ignored for lookup** (strips to slug; membership proves access); `dashboardKeyHash` dual-write on create/rotate; migration `20260721030000_dashboard_key_hash` on disk (backfill via pgcrypto). Design: [`GO_SPOTS_DASHBOARD_KEY.md`](./GO_SPOTS_DASHBOARD_KEY.md).
- **What’s still missing (operator / optional)**
  - **OPERATOR:** Neon `migrate deploy` of hash migration (never from workstation prod `.env`).
  - Optional later: DROP plaintext `Shop.dashboardKey` after soak; rotate grace-period columns (deferred).
### 20. Currency changes may automatically mutate prices — PARTIAL (ship bar met)

- **What exists**
  - Atomic all-or-nothing catalog FX reprice (Lane D); live rates / `convertMoney`.
  - Preview + confirm gate (Lane CC): `POST /shop/currency/preview` returns proposed price table; apply only via `PATCH /shop/settings` with `currency` + `confirm: true`. Settings UI previews then confirms.
  - **Lane YYYYY:** M6 per-row ISO stamps on `Transaction` / `ShopOrder` / `PlaySession` / `ShopLoss` / `Reservation` — migration `20260721040000_currency_stamp_monetary_rows` on disk (expand + backfill); dual-write on finance creates / mark-paid; dual-read via `currency-stamp.util.ts` (`effectiveMoneyCurrency`); analytics (`sumRevenueChannelsByCurrency`, shop-currency KPIs, `summary.revenueByCurrency`); conversion history `GET /shop/currency/history` + settings UI (audit `venue.currency.change`). Residual checklist: [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md).
  - Historical orders/tx/play/loss amounts never rewritten on currency change.
- **What’s still missing (operator / optional)**
  - **OPERATOR:** Neon `migrate deploy` of stamp migration + Gates 0–4 smoke — [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md).
  - Nullable stamp contract; optional NOT NULL tighten after null-count verification.
  - Pre-stamp backfill honesty limit (shops that flipped before stamps may mis-label old rows).
  - Optional FX “report currency” conversion in analytics UI (mixed eras use `revenueByCurrency` buckets only today).

### 21. Timezone handling needs thorough verification — DONE (PARTIAL residual)

- **What exists**
  - `Shop.timezone` column + settings UI (IANA); venue day-key wiring for finance/schedule; public schedule day bounds — ship bar **DONE** (Lane **B-timezone-ui**).
  - Explicit shipped vs residual + operator Gates 0–3 + Phases 0–3: [`GO_SPOTS_TIMEZONE.md`](./GO_SPOTS_TIMEZONE.md) (lane **TZ21-residual-docs**).
- **What’s still missing**
  - **OPERATOR:** Neon migrate apply for `20260720220000_shop_timezone`.
  - **Accepted residual:** web display `toLocale*` and client date pickers use browser local, not venue IANA; deprecated `dayBoundsLocal` retained; no web day-key mirror.

### 22. Email delivery needs a durable retry mechanism — PARTIAL

- **What exists**
  - Design ([`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md)) + durable `MailOutbox` table (`20260721020000_mail_outbox`).
  - `MailService.send` enqueues PENDING before Resend; success → SENT; fail → FAILED + backoff; skip → SKIPPED; max 8 → DEAD.
  - `MailOutboxProcessor` minute cron + GS/MO advisory lock.
  - Owner dead-letter API + settings UI (XXXX/ZZZZ).
  - **Lane TTTTT:** SUPER_ADMIN system-mail ops — `GET/POST /mail/outbox/system/*` (`shopId IS NULL` only) + `/admin` `SystemMailOutboxPanel`.
- **What’s still missing (operator)**
  - Retries **not yet proven in live prod** (operator Gates 0–5 after Neon migrate + Resend).
  - Outbox alerting / DEAD growth metrics deferred ([`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) Phase 4).
  - SENT-row retention purge — no TTL cron on disk.

---

## P2 — Important before scaling

### 23. Logging and monitoring are insufficient or unclear — DONE

- **What exists**
  - Optional Sentry (`SENTRY_DSN`) fail-open + PII scrub (Lane V); global 5xx `SentryExceptionFilter` (Lane Y); request logging interceptor; health `/live` `/ready`.
  - Observability design + ship bar ([`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md)).
  - **Lane UUUUUU:** status flip — Nest logs + request interceptor + optional Sentry 5xx = DONE ship bar for Friday.
- **What’s still missing (residual, not code blocker)**
  - OTel / deeper tracing / web Sentry deferred (documented).

### 24. Backup and disaster-recovery procedures are unclear — DONE

- **What exists**
  - Full DR runbook ([`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md)) — Neon PITR/branch restore paths, ordered post-restore (`DATABASE_URL` → migrate deploy if behind → `/ready`), RTO/RPO guidance, restore-drill checklist, secret rotation, API/Web re-point.
  - Partial-outage symptom table + in-app **Shop settings → Outage runbook** (bible #32 / Lane SSSSS).
  - Friday operator pointers — [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) §4 · [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md).
  - **Lane JJJJJJ:** status flip — documented procedures = DONE ship bar (same pattern as #23 OTel residual / #9 Neon deploy residual).
- **What’s still missing (operator residual, not code ship bar)**
  - Live Neon project TBD fields (project id, retention, last drill date) must be filled from console; restore drill not yet executed; no automated backup verification job; uploads/object-storage backup deferred.

### 25. Privacy and GDPR workflows are missing or unclear — DONE

- **What exists**
  - Owner `GET /gdpr/export` (shop PII + consent/DSAR/audit/session metadata + finance counts) + settings download UI.
  - Guest erase: `POST /gdpr/erase-guest` (reservation/event/chat/contact/review) + `POST /gdpr/erase-guest-email`; password reauth; money amounts kept.
  - Account wipe: `POST /gdpr/erase-account` (confirm phrase + password) — sessions revoked, MFA/TOTP + recovery codes cleared, memberships deactivated, owned venues unpublished + guest PII redacted, user tombstoned.
  - Consent: `ConsentRecord` + required `privacyConsentAccepted` on public creates (booking/event/contact/review/chat) + checkbox UI; policy version `2026-07-21`.
  - Guest DSAR: `POST /public/venues/:slug/gdpr/dsar` + venue Book-tab form; owner inbox `GET /gdpr/dsar` + close; settings `GdprOwnerExtras`.
  - Retention cron: daily `GdprRetentionProcessor` (advisory lock GS+GD); aged guest PII redact, audit strip, analytics delete, expired session purge. `GDPR_RETENTION_CRON=off` disables. Migration `20260721070000_gdpr_consent_dsar` on disk.
  - Design: [`GO_SPOTS_GDPR_RETENTION.md`](./GO_SPOTS_GDPR_RETENTION.md).
- **What’s still missing (operator residual)**
  - **OPERATOR:** Neon `migrate deploy` for `20260721070000_gdpr_consent_dsar`; cancel Lemon + Resend processor purge / DPA (no auto money delete — accounting carve-out by design).

### 26. Public endpoints need stronger abuse controls — DONE

- **What exists**
  - Global throttle + auth `AUTH_THROTTLE_*`; public schedule throttle; public booking/event DTO harden.
  - **Lane BB:** env `PUBLIC_THROTTLE_*` + stricter `@Throttle` on public creates (booking/event/contact/review/chat-open; default **5/min**).
  - **CAPTCHA stack (code complete):** verify util + `assertCaptchaOrThrow` on all six publicThrottle creates; optional Turnstile/hCaptcha widget (`NEXT_PUBLIC_CAPTCHA_*`); in-memory `after_throttle` 429 escalation map + `CaptchaAwareThrottlerGuard`. Default `CAPTCHA_PROVIDER=off` no-op. Design: [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md).
  - **Lane RRRRR:** status flip — assert + widget + escalation shipped; enable is operator secrets only.
- **What’s still missing (operator / scale residuals)**
  - **OPERATOR:** set site+secret keys and flip `CAPTCHA_PROVIDER` / `NEXT_PUBLIC_CAPTCHA_PROVIDER` together when ready (examples stay **off** until then).
  - Optional later: Redis multi-instance escalation store; verify-fail metrics. `THROTTLE_DISABLED` must never be prod.

### 27. Upload security needs deeper hardening — DONE

- **What exists**
  - MIME allowlist + magic-byte sniff, size limits, shop-scoped deletes, shared multer; CORS `*` removed on media GET.
  - **Lane BBBB (design):** malware / signed-or-private GET / legacy `/uploads` retirement — [`GO_SPOTS_UPLOAD_SECURITY.md`](./GO_SPOTS_UPLOAD_SECURITY.md).
  - **Lane SSSS (Phase 1):** inventory + migrate-off tooling (`inventory:legacy-uploads` / `migrate:legacy-uploads`); `LEGACY_UPLOADS_STATIC` gate on `main.ts` (default **on** + boot warn); no new disk writers. Published `/media/:id` unchanged.
  - **Lane VVVVV:** status flip — Phase 0 harden + Phase 1 tooling + default-on static gate = DONE ship bar; opaque public GET accepted for published assets.
- **What’s still missing (operator / later residual)**
  - **OPERATOR:** run inventory on live DB; migrate remaining `/uploads` refs; set `LEGACY_UPLOADS_STATIC=false` only when inventory total is **0**.
  - Phase 2–3: private visibility / signed URLs; async malware scan — deferred post-submit (documented).

### 28. Real-time operational updates rely on polling — DONE

- **What exists**
  - Design + ship bar ([`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md)): SSE-first for notifications; polling remains as fallback.
  - **Lane XX:** Nest `@Sse` `GET /api/v1/notifications/stream` — cookie JWT + shop-scoped; events `ready` / `heartbeat` (~25s) / `notification`. **`NotificationsSseHub` in-process only** (same API instance). `@SkipThrottle`; CSRF skipped (safe GET).
  - Web: `useNotificationsSse` on notifications panel → silent refetch; **poll fallback retained** (~20s panel; toasts still ~15s poll-primary).
  - **Lane UUUUU:** status flip — in-process SSE + poll fallback accepted as DONE for single-instance deploy.
- **What’s still missing (scale residual, not code blocker)**
  - Redis/PG NOTIFY multi-instance fan-out; floor/sessions/guest-chat SSE; toast path stays poll-primary by design; no WebSockets (intentionally avoided).

### 29. Accessibility needs formal testing — DONE

- **What exists**
  - Design + ship bar ([`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)); scattered `aria-*` in components.
  - **Lanes UU / EEE / YYY / JJJJJ:** optional Playwright + `@axe-core/playwright` smoke via `test:a11y:smoke` on **13** public routes (`/`, auth, marketing, legal, staff activate, guest-status placeholders). Soft-logs serious/moderate/minor; hard-fails **critical** only; skips when Next is down.
  - **Lane WWWWW:** status flip — verified **13/13** critical-clean with Next up; probe uses Node `http` (undici `fetch` can false-skip on Windows); Playwright timeout **60s** for cold compiles.
  - **CI follow-up:** non-blocking job `web-a11y-smoke` (`continue-on-error`) runs the same harness (skip-if-no-Next → 13 skipped on bare runners).
- **What’s still missing (residual, not code blocker for this wave)**
  - Dashboard/settings/sessions/dialogs axe suite (needs auth secrets); formal contrast/focus sweep (soft serious contrast already logged); hard CI gate + Next boot in Actions.

### 30. Internationalization appears incomplete — DONE

- **What exists**
  - en/pl catalogs for dashboard (`i18n.ts`) + public/auth (`public-i18n.ts`) with `i18n:check` leaf parity (**1871** + **989**).
  - **Product UI en/pl ship bar:** auth, guest status, public venue/booking/chat/floor/menu/directory, register packs, staff floor/agenda/theme (+ seat-map residual), notifications, team/access, messages, menu/orders, settings, finance (+ invoice print), sidebar, mail outbox, ops outage/offline banner, **overview / gallery / reviews / notes / audit / sessions / reservation dialog / event requests**, **gaming + dining setup editors**, venue gate/switcher, charts empty states, theme toggle.
  - **Lane TTTTT-i18n-enpl-done** (with prior **TTTTT** dining/publicBooking): status flip — dashboard + public + auth en/pl complete for this wave.
- **What’s still missing (residual, not code blocker for this wave)**
  - Secondary locales (de/fr/es/ar) formal sweep — **explicitly deferred / non-blocking**.
  - Business-data form placeholders/defaults; unused plan-catalog / live-preview mocks; API/email copy; legal privacy/terms prose.

### 31. Onboarding is too complex — DONE

- **What exists**
  - Design: [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md).
  - **Lane LLLLLL (2026-07-21):** Web-guided 10-step wizard at `/dashboard/[venuePath]/onboarding` — progress + skip/resume (localStorage), five templates applied via existing `createResourceCategory` / `syncVenueCategories`, hours/settings/staff/play-session/publish compose existing APIs; register + create-venue redirect to wizard; owner resume banner. en/pl. **No schema / apply-template API / Neon.**
- **What’s still missing (residual)**
  - Server-side `onboardingCompletedAt` / multi-device resume — **Phase 1 plan ticket** in [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md) (**ONBOARD32-phase1-plan**; implement lane **`ONBOARD32-phase1-implement`**; **no schema on disk**); dining table-group seed in mixed template; sidebar F&B polish (Phase B of #33).

### 32. Offline and degraded-operation behavior is unclear — DONE

- **What exists**
  - Design: failure taxonomy + fail-closed principles ([`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md)).
  - Health probes distinguish live vs ready (DB); fail-open Sentry.
  - **Modes A–C/F:** shared `OfflineBanner` + `ConnectivityProvider` (`/ready` probe) + prod-safe `ApiError` copy; `useLiveData` / notification-toast poll backoff + Mode F stale banner; silent loaders report outcomes.
  - **Public write fail-closed:** guest chat + gaming/dining booking dialog disable submit/actions on Modes A/B/C (en/pl outage copy); Mode F does not block writes; no offline money/booking queue.
  - **Lane PPPPP:** partial-outage ops runbook appended to [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) (symptom → cause → action).
  - **Lane SSSSS:** owner in-app **Shop settings → Outage runbook** (`OpsOutageRunbookPanel`) — Modes A/B/C/F summary + same symptom table en/pl (`opsOutage.*`); mirrors DR appendix.
- **What’s still missing (explicit non-goals)**
  - PWA / service worker / IndexedDB mutation queue — intentionally out of scope.
---

## P3 — Product strategy

### 33. The product scope is too broad — DONE

- **What exists**
  - Ship plan explicitly narrows Friday scope vs full bible.
  - Deliberate focus doc: gaming-first ICP, three commercial bundles, tiered defer table ([`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md)).
  - **Lane KKKKKK (2026-07-21):** Phase A commercial UX ship bar — self-serve packs **gaming + mixed** only on register / landing pricing / who-its-for; three marketing bundles (ops & trust, gaming floor, food & dining); `venue_presence`/`guest_chat` hidden from marketing calculator; restaurant/hotel → contact sales; gaming-first hero + page metadata (en/pl). Catalog ids unchanged (hide > delete). Dashboard subscription editor still lists full packs for legacy.
- **What’s still missing / residual**
  - Phase B sidebar F&B group polish (onboarding wizard shipped in #31).
  - Phase C pack alias / hospitality merge evaluation; Phase D sales-ops manual-only flows doc.
  - No pack catalog or API route removal (intentional).

### 34. Owner and guest marketing should be separated — DONE

- **What exists**
  - Owner acquisition: `/` and `/for-venues` (owner-only landing; primary CTA → register; secondary → `/venues`).
  - Guest discovery: `/venues` with guest-facing tagline/metadata; header link to `/for-venues`.
  - Homepage no longer dual-mode (manage/play switcher removed) so owner and guest stories do not fight.
- **What’s still missing**
  - Unused play-mode landing components remain in tree (optional cleanup); #35 Phase A city landing shipped (live cohort residual).

### 35. The public marketplace should come after venue supply — DONE (Phase A)

- **What exists**
  - `/venues` discovery + publish/`advertiseOnVenuesPage` gates; city/country search and facets on `listPublicVenues`.
  - **Lane MMMMMM (2026-07-21):** Phase A ship bar — pilot city landing `/venues/wroclaw` (en/pl); `/for-venues` + `/` “Join the city directory” CTA; `/venues` empty-state/pilot hint; in-repo [`MARKETPLACE_GTM_CHECKLIST.md`](./MARKETPLACE_GTM_CHECKLIST.md) matching S0–S4. Playbook: [`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md).
- **What’s still missing**
  - Live pilot cohort execution (S1–S4), admin cohort tools (M4), entitlement split for free directory (M5).
  - National guest marketing still deferred until S2 density gate.
---

## Most important conclusion (themes)

| # | Theme | Status | Honest note |
|---|--------|--------|-------------|
| C1 | Correct money | DONE | Decimal columns + string wire (#1); ledger dual-write (#6 Phase 1–2); analytics still interim until LEDGER_READS |
| C2 | Strong tenant isolation | DONE | App `shopId` + two-venue unit matrix; RLS migration `20260721050000_*` + `SET LOCAL` plumbing (opt-in `TENANT_RLS`); opaque media GET residual; Neon migrate + flag soak operator |
| C3 | Reliable concurrency | DONE | Booking locks + exclusion `20260721060000_*` (#4); stock atomic SALE + claim-before-delete/cancel (#5 DONE); live C1–C3 bodies local-only residual; Neon deploy residual |
| C4 | Meaningful automated tests | PARTIAL | 465 unit tests + CI API; concurrency scaffold (`test:concurrency` skip path); not full e2e/integration impl |
| C5 | One financial source of truth | PARTIAL | LedgerEntry dual-write shipped (#6); analytics still interim channel sum until Phase 4 |
| C6 | Simpler architecture | **DONE** (ship bar) | §14 service split complete (#11): finance/auth/reservations facades + extracted sub-services; login/register/activate remain on `AuthService` by design |
| C7 | Narrower product focus | DONE | Focus doc + Phase A commercial UX (#33); marketing routes split (#34 DONE); marketplace Phase A city landing + GTM checklist (#35 DONE) |

---

## Operator Friday (not bible “code DONE”)

Tracked for submit, not as item DONE flips (Lane **ZZZ** refreshed 2026-07-21):

- Neon `migrate deploy` (**18** pending: `20260720210000_*` … `20260721120000_seating_source_dining_table_group`, including GuestCheck + seating source FK) — never reset; exclusion after overlaps=0; CSV DROP after app cutover
- Host `CORS_ORIGINS` + cookie/CSRF/throttle prod defaults (`.env.production.example`)
- Manual smoke (login/CSRF, CORS, book, guest link, stock+sale, webhook dup)
- Deploy Node **24.x** (Vercel; engines in package.json)
- Confirm Neon PITR / retention + restore drill (fill TBD in [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md)) — #24 **DONE** for docs; live fill-in remains operator residual
- **#10 DONE** / **#14 DONE** (Phase 0–2) — not Friday operator blockers; include `guest_check` + `seating_source_dining_table_group` in migrate pass

See [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md), [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md), [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md).

---

*Finished log: [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) · Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Theme index: [`BIBLE_PROGRESS.md`](./BIBLE_PROGRESS.md)*
