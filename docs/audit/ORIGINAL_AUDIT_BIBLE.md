# Original Full-Audit Bible (§§1–40)

**Source:** user “GoSpots Full Repository Audit, Hardening, Refactoring, and Production-Readiness Task” (the 40-section mega-prompt).  
**As of:** 2026-07-22  
**Verdict:** **Not everything is done.** Ship-bar work for the old 1–35 matrix is largely in place; the **full** prompt (especially §§35–40 depth, ledger-primary, multi-instance SSE, API error contract, privacy DATA_MAP, perf suite) still has open residuals. §19 Option B/C settle-root is **explicitly deferred** (Phase 3a settle gate shipped). **Operator one-pager:** [`BIBLE_RESIDUAL_INVENTORY.md`](./BIBLE_RESIDUAL_INVENTORY.md).

**Legacy matrix:** The prior [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) numbered **#1–#35** was a compressed P0–P3 list. This file is now the **canonical** tracker and maps each original section → status + evidence. Keep [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) as the dated ship log.

**Status legend**

| Status | Meaning |
|--------|---------|
| `DONE` | Prompt intent met for production ship bar (code + tests or required docs) |
| `PARTIAL` | Core shipped; prompt’s deeper residual remains |
| `OPERATOR` | Code ready; human deploy/flag/smoke still required |
| `NOT_DONE` | Prompt ask not implemented |
| `PROCESS` | Meta rules / gates (not a single feature ticket) |

**Classification (prompt §1.1):** each row uses CONFIRMED / ALREADY FIXED / PARTIALLY CONFIRMED / NOT PRESENT as of this remake.

---

## Summary counts (feature sections §4–§36)

| Status | Count (approx.) |
|--------|----------------:|
| DONE | 18 |
| PARTIAL | 15 |
| NOT_DONE | 1 (§35 depth) |
| OPERATOR overlays | many flags/soaks |

**Honest production-ready bar:** financially safer, tenant-safer, concurrency-safer, CSRF/guest-token hardened, ledger dual-write+reads available, GuestCheck settle-gate live — **yes**. Prompt-complete / zero residuals — **no**.

---

## §1 Critical operating rules — PROCESS

| Rule | Status |
|------|--------|
| Verify before change | Followed via lanes + evidence docs |
| Inspect beyond prompt | Ongoing |
| Edit code after confirm | Done for ship items |
| No reckless rewrites | Followed |
| Preserve production data / no `migrate reset` | Followed |
| Build/test continuously | CI + local jest/nest/typecheck |
| Reviewable change groups | Lane/commit discipline |

---

## §2 Required audit deliverables — DONE (recreated 2026-07-22)

| Deliverable | Status |
|-------------|--------|
| [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) | Recreated as **current verification** matrix |
| [`GO_SPOTS_FIX_PLAN.md`](./GO_SPOTS_FIX_PLAN.md) | Recreated as **remaining** prioritized plan |
| [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md) | Recreated against current suite |
| [`GO_SPOTS_MIGRATION_PLAN.md`](./GO_SPOTS_MIGRATION_PLAN.md) | Recreated for applied + residual migrations |

*(Earlier polish deleted snapshot copies; this remake restores them as living status docs.)*

---

## §3 Repository-wide discovery — DONE

Monorepo `apps/api` (Nest+Prisma) + `apps/web` (Next); Render API + Vercel web; Neon Postgres; Resend; Lemon Squeezy; mail outbox; SSE notifications. Architecture and workflow traces live across design docs + implementation report.

---

## §4 P0 Monetary correctness — DONE (ship bar; accepted residuals)

- **Classification:** ALREADY FIXED (ship bar) / PARTIALLY CONFIRMED depth residual  
- **Evidence:** [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md) — shipped vs residual table + optional Phases 2–3  
- **Shipped:** migration `20260720230000_money_decimal_core`; `money.util.ts` (`toPrismaDecimal`, `serializeMoney` 4dp strings); `offeringConfig` string prices; web `coerceMoney` / `MoneyWire` dual-read; jest money+offering+play-billing+analytics+reprice **53** PASS at wire ship  
- **Accepted residuals (not §4 blockers):** intermediate service math still uses `toMoneyNumber` → JS number (ops UI acceptable; ledger paths must stay Decimal); money **request** / PATCH bodies still primarily numeric from forms (string ingress optional future lane)  
- **Out of §4 scope:** unified ledger (#6 / §5) · per-row currency stamps (#20 / §20)  

## §5 P0 Unified financial ledger — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** `LedgerEntry`, `LEDGER_DUAL_WRITE`, `backfill:ledger`, `LEDGER_READS` prefer path (`GO_SPOTS_LEDGER.md`)  
- **Shipped:** Phase 1–4 on disk — expand migration, dual-write hooks, backfill CLI, analytics prefer-ledger; **flags default off**  
- **Residual:** Phase 5 ledger-primary freeze; operator soak gates — **Gates 0–7** in [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) (`LEDGER_DUAL_WRITE` → backfill → `LEDGER_READS`); interim channel-sum still default when flags off  

## §6 P0 Tenant isolation — DONE (PARTIAL residual)

- **Classification:** ALREADY FIXED (app scope + RLS plumbing) / PARTIAL soak  
- **Evidence:** shopId mutators, two-venue unit matrix, `20260721050000_tenant_rls_core`, `TenantRlsInterceptor`, `TENANT_RLS`  
- **Shipped:** Tier A FORCE RLS + app `SET LOCAL` plumbing on disk; **`TENANT_RLS` default off** (policies fail-open when mode unset)  
- **Residual:** operator soak gates — **Gates 0–4** in [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) (`TENANT_RLS=on` after migrate + smoke); DB role split (Gate 5); Tier-B policies; live pooled suite  

## §7 P0 Reservation/session concurrency — DONE (PARTIAL residual)

- **Classification:** ALREADY FIXED  
- **Evidence:** `booking-lock.util.ts`; `booking-overlap.util.ts`; exclusion `20260721060000_reservation_resource_exclusion`; `reservation-overlap-detect.util.ts`; opt-in concurrency suite (`test/concurrency/**`)  
- **Shipped:** App-level `withResourceBookingLock` (`SELECT … FOR UPDATE` on `Resource`) + half-open `[)` overlap asserts before insert; GiST `EXCLUDE` on `(resourceId, tsrange(startsAt, endsAt, '[)'))` for `PENDING` / `CONFIRMED` / `CHECKED_IN`; `23P01` → 409 under lock; overlap detect CLI (`pnpm detect:reservation-overlaps`); unit specs (booking-lock, overlap-detect); opt-in concurrency harness with **Neon-refuse** gate + **live C1/C2 util/lock bodies on disk** (Lanes **WWWWWW**, **HHHHHH**)  
- **Shipped (Neon):** Exclusion migration **applied** (18-folder deploy 2026-07-21; preflight overlaps = **0**) — DDL detail [`GO_SPOTS_EXCLUSION_CONSTRAINT.md`](./GO_SPOTS_EXCLUSION_CONSTRAINT.md)  
- **Residual (operator):** Run live C1/C2 against **local Docker only** — Gates 0–3 in [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) (`RUN_CONCURRENCY_TESTS=1`; harness **refuses Neon** from `.env`). Default `pnpm test` unchanged; live describes **skipped** without opt-in.  
- **Residual (future app / optional):** Walk-in `PlaySession` rows **not** covered by exclusion (app `FOR UPDATE` only) — optional C4; Nest service-level C1–C3 wrappers (util path sufficient for ship bar); CI Postgres concurrency job (**not wired**)  
- **Verify:** jest booking-lock + reservation-overlap-detect **11** PASS; `pnpm test:concurrency` gate **6** PASS (live skipped without local opt-in)

## §8 P0 Inventory concurrency — DONE (PARTIAL residual)

- **Classification:** ALREADY FIXED  
- **Evidence:** `adjustMenuItemStockBy` in `menu-stock-db.util.ts`; claim-before-delete/cancel (`shop-order-stock.util.ts`); unit race specs  
- **Shipped:** Conditional `UPDATE … WHERE stock >= delta` inside `$transaction` with SALE row; claim-before-delete/cancel restores stock; live **C3 util body on disk** (Lane **HHHHHH**)  
- **Residual (operator):** Live C3 last-unit run on **local Docker only** — same Gates 0–3 in [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md)  
- **Verify:** jest menu-stock-db + shop-order-stock **16** PASS  

## §9 P0 Webhook idempotency — DONE (ship bar; operator smoke only)

> **Not guest contact:** §9 is Lemon billing webhook dedupe. Guest tokens → **§11** [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md); guest contact / visit fragmentation → **§19** [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md); public contact abuse → **§28** [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md).

- **Classification:** ALREADY FIXED  
- **Evidence:** `BillingWebhookEvent` unique + Lemon handler dedupe; `billing.service.spec`; migration `20260720210000_billing_webhook_events` — [`GO_SPOTS_WEBHOOK_IDEMPOTENCY.md`](./GO_SPOTS_WEBHOOK_IDEMPOTENCY.md) (lanes **WEBHOOK8-residual-docs**, **GUEST9-residual-docs**)  
- **Shipped:** Durable receipt insert **before** subscription mutations; unique `(provider, eventId)` → duplicate / concurrent retry no-op (`P2002`); HMAC verify **before** receipt (401 bad sig; 503 if secret unset — never accepts unsigned); malformed JSON 400; unknown / non-subscription `event_name` → receipt + `{ ignored: true }` (no Subscription mutation); mutating set: `subscription_created|updated|resumed|unpaused|cancelled|expired|paused`; prod boot requires `LEMON_SQUEEZY_WEBHOOK_SECRET`; `@SkipCsrf()` + `@SkipThrottle()` on webhook route; deploy checklist + `.env.production.example`  
- **Residual (code):** **none** — ship bar fully met; no Phase 2 webhook handler work on disk  
- **Residual (operator):** Gates 0–2 in [`GO_SPOTS_WEBHOOK_IDEMPOTENCY.md`](./GO_SPOTS_WEBHOOK_IDEMPOTENCY.md) — Neon `migrate deploy` folder **#1** of 18 ([`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md)); Lemon dashboard URL `POST /api/v1/billing/webhooks/lemon-squeezy` + secret aligned with host env; post-deploy smoke — **duplicate Lemon delivery no-ops** ([`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md), [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md)); after secret rotation, replay from Lemon is safe (idempotent by design)  
- **Verify:** jest `billing.service.spec` webhook signature + duplicate/P2002 + concurrent duplicate **PASS**

## §10 P0/P1 CSRF + cookies — DONE (ship bar; honest residual)

- **Classification:** ALREADY FIXED → **code ship bar met**  
- **Evidence:** `csrf.guard.ts`, `cookie-options.util.ts`, `csrf.util.ts`, global `APP_GUARD`, web `csrf.ts` / `api.ts`, prod `CSRF_PROTECTION` — [`GO_SPOTS_CSRF.md`](./GO_SPOTS_CSRF.md) (lane **CSRF10-residual-docs**)  
- **Shipped:** double-submit guard on session-cookie mutations; `@SkipCsrf` Lemon webhooks; public guest routes skip when no session cookies; Secure/SameSite cookie flags + Helmet; `GET /auth/csrf` bootstrap; web header wiring + one 403 retry; jest **9** guard specs  
- **Residual (operator):** Gates 0–2 in [`GO_SPOTS_CSRF.md`](./GO_SPOTS_CSRF.md) — prod env + proxy + login+CSRF manual smoke (**blocked** until Render resume — [`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md))  
- **Residual (optional / UX):** Playwright CSRF e2e; CSRF bootstrap + auth outage copy — [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phases 5–6 (**no classified outage copy on disk**)  

## §11 P1 Guest token security — DONE (PARTIAL residual)

- **Classification:** ALREADY FIXED / PARTIAL cutover  
- **Evidence:** `guest-token.util.ts`, `20260720250000_guest_token_hash_expiry`, `pnpm run clear:guest-plaintext`  
- **Shipped:** hash-at-rest, expiry, revoke; new writes hash-only; dual-read for legacy emailed links; dry-run-by-default clear CLI  
- **Residual (operator):** run clear after smoke → soak → hash-only app deploy → contract DROP — **no DROP migration on disk yet**. Checklist: [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md) (Gates 0–6)  

## §12 P1 Owner account protection — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** sessions API (`AuthSessionService`), owner TOTP MFA (`mfa-*.util.ts`, migration `20260721080000_user_mfa_totp`)  
- **Shipped:** owner TOTP enroll/confirm/disable + recovery codes + login `mfaToken` challenge; sessions list/revoke/revoke-others; new-device sign-in email; forced reauth on guest erase + MFA mutations  
- **Residual:** staff/manager MFA, WebAuthn, org require-MFA, broader forced reauth — phased plan (Phases 1–5; **no WebAuthn code**) in [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md). Owner v1 design: [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md). **OPERATOR:** Neon migrate MFA migration  

## §13 P1 Dashboard URL secret — DONE (PARTIAL residual)

- **Classification:** ALREADY FIXED  
- **Evidence:** slug-only bind + `dashboardKeyHash` (`dashboard-path.ts`, migration `20260721030000_dashboard_key_hash`)  
- **Shipped:** slug-only URLs + membership bind (legacy key ignored); `/me` omits key; owner rotate + audit; hash dual-write on create/rotate  
- **Residual (operator):** soak → stop dual-write app deploy → clear plaintext → contract DROP — **no DROP migration on disk yet**. Checklist: [`GO_SPOTS_DASHBOARD_KEY.md`](./GO_SPOTS_DASHBOARD_KEY.md) (Gates 0–5). **No clear CLI on disk** (bind never read plaintext).  

## §14 P1 Oversized service refactoring — DONE (ship bar; honest residual)

- **Classification:** PARTIALLY CONFIRMED → **ship bar met**  
- **Extracted:** `FinanceReportsService`, `ShopLossService`, `FinanceTransactionService`, `ShopOrderService`, `PlayBillingService`, `PlaySessionService` (`FinanceService` thin facade ~223 lines); `AuthSessionService`, `AuthRefreshService`, `AuthLogoutService`, `AuthPasswordService` (owner + staff forgot-password), `AuthVenueService`, `AuthMfaService` (owner TOTP enroll/confirm/disable/recovery + login verify; login MFA challenge JWT stays on `AuthService.login`); `ReservationsPublicService`, `ReservationsScheduleService`, `ReservationsStaffService` (`ReservationsService` facade shell ~109 lines); `auth.types` — see [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md)  
- **Shipped:** Phases 0–9 complete; controllers unchanged; characterization gates passed per lane (`SPLIT14-*`, `SPLIT11-*`)  
- **Residual (by design, not blockers):** `AuthService` still owns registration / login / activate / `me` / shared `issueTokens` (~1 170 lines — credential + onboarding entry, not further split in this wave); `ReservationRemindersService` cron tick may remain outside the reservations facade; optional future slices (`AuthRegistrationService`, `AuthCredentialsService`, …) documented but **out of scope** for §14 exit

## §15 P1 Subscription/entitlement consolidation — DONE (PARTIAL residual)

- **Classification:** ALREADY FIXED  
- **Evidence:** pack-only `resolveModules`, entitlements helpers — [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md)  
- **Shipped:** Phase 1 pack-only module resolution (`packId` + `effectiveAddOnsForSubscription`; no belt union); runtime add-on synthesis from legacy `tier` when CSV+rows empty; derived `tier` writes via `tierForPack`; web `plan.ts` parity; `pnpm backfill:legacy-addon-tier` dry-run/`--apply`  
- **Residual (explicit checklist):** optional DROP `Subscription.tier` after soak — Gates 0–7 in [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md) (**no DROP migration on disk**). Phase 2 derived-only polish; pack-less `legacyModulesFromTier`; dedicated catalog add-ons for `multi_shop`/`integrations`; OPERATOR backfill `--apply` when scheduled  

## §16 P1 Normalize CSV permissions/add-ons — DONE (OPERATOR residual)

- **Classification:** ALREADY FIXED  
- **Evidence:** relational rows + DROP migration on disk — [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md)  
- **Shipped:** rows SoT + stop dual-write (Lane **IIIIII**); rows-primary reads; mutations write join rows only; JWT/API emit computed CSV strings; contract `20260721090000_drop_membership_permissions_subscription_addons_csv` **on disk**; `pendingAddOns` stays CSV  
- **Residual (explicit checklist):** operator expand → pre-DROP app gate → Neon DROP deploy → post-DROP verification — Gates 0–6 in [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md) ([`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) records **18/18 applied 2026-07-21** — re-verify if env diverges). Optional API arrays-only polish  

## §17 P1 Resource/dining consolidate — PARTIAL (Phase 0–2 DONE)

- **Classification:** PARTIALLY CONFIRMED  
- **Ship bar (met):** Option C locked; Phase 1 drift util + `detect:resource-dining-drift` CLI + mutation-surface contract; Phase 2 expand migrate `20260721120000_seating_source_dining_table_group` + advisory mirror dual-write (`RESOURCE_DINING_DUAL_WRITE` default on) from dining table-group CRUD + section floor/zone — [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md)  
- **Residual (explicit checklist):**  
  - **Phase 3 — UI cutover (`RES17-ui-cutover`):** web inventory (2026-07-22) — bookable floor/book paths **already Resource-only**; **no staff seating-board page** (`seating-tables-client.ts` unused); build read-only advisory summary + event-custom CRUD only; API guardrails blocking non-custom mirror edits; optional backfill; **`RESOURCE_DINING_DUAL_WRITE` stays on** through soak — [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md) §4.3–4.4  
  - **Phase 4 — DROP:** disable superseded seating CRUD + dual-write; optional archive; DROP migration **not on disk** until soak — pattern like CSV cutover  
- **Invariant (unchanged):** never auto-sync `availableCount` from public/staff dining bookings (Option C)  

## §18 P1 Unstable JSON business config — DONE (PARTIAL residual)

- **Classification:** ALREADY FIXED (ship bar) / PARTIALLY CONFIRMED (deeper normalize)  
- **Evidence:** [`GO_SPOTS_OFFERING_CONFIG.md`](./GO_SPOTS_OFFERING_CONFIG.md) (residual plan lane **OFFER18-residual-docs**)  
- **Shipped:** `@IsOfferingConfig()` / `validateOfferingConfig` on category create/update; `normalizeOfferingConfigPrices` (known keys → 4dp decimal **strings** on write/API emit); `prepareOfferingConfigForWrite` stamps `schemaVersion: 1`; typed `OfferingConfigV1` / `BowlingModeV1`; read-only `pnpm inventory:offering-config`; FX catalog reprice walks JSON via `mapOfferingConfigPrices` in the same atomic txn as `ResourceRate` + `Resource.hourlyRate` — Bible **#15 DONE** (Lanes prior validation + **EEEEEE** Phase 0 + money wire **XXXXX**)  
- **Already relational (parallel, not replaced):** `ResourceRate` rows + per-unit `Resource.hourlyRate` (`Decimal(19,4)`) — staff UI and FX reprice already treat these as the money catalog for many tariffs  
- **Residual (optional post-soak — not ship blockers):** JSON still holds behavioral overlay (`bowlingModes`, `noShowMinutes`, player bounds) **and** legacy flat price keys; **three-surface duplication** (JSON nested/top-level prices vs `ResourceRate` vs `hourlyRate`); Phase 1 optional rate de-duplication / `{ rateId }` pointers; Phase 3 optional column promote (`noShowMinutes`, …) — **no Phase 1–3 DDL / no JSON column DROP on disk**  
- **Verify:** jest offering-config **26** PASS (+ reprice **6**); operator: `pnpm inventory:offering-config` after Neon migrate soak  

## §19 P1 Unified customer ticket — PARTIAL (Phase 3a ship bar met)

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** `GuestCheck` Option A + staff open-tabs + `POST …/settle` gate (OPEN→SETTLED; **no second revenue post**) — [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md)  
- **Deferred (not abandoned):** Option B/C settle-as-revenue-root + `GO_SPOTS_FINANCE_CONTRACT.md` rewrite — **explicitly deferred** until after **ledger operator soak** (`LEDGER_DUAL_WRITE` → backfill → optional `LEDGER_READS`; §14 service splits **DONE**). Settle remains a **status/UX gate**; four-channel interim contract stays authoritative. Split tenders remain adjacent product scope.  

## §20 P1 Currency-change safety — PARTIAL (ship bar met)

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** atomic catalog reprice + preview/confirm apply + M6 stamps — [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md)  
- **Shipped:** Lane D all-or-nothing FX reprice; `POST /shop/currency/preview`; apply via `PATCH /shop/settings` + `confirm: true`; migration `20260721040000_currency_stamp_monetary_rows`; dual-write/read (`currency-stamp.util.ts`); analytics `revenueByCurrency`; conversion history API + settings UI; historical money rows never rewritten on flip  
- **Residual:** operator Gates 0–4 (Neon migrate + smoke); nullable stamp contract + optional NOT NULL tighten; pre-stamp backfill honesty limit (shops that flipped before stamps); optional FX “report currency” conversion in UI — Phases 1–3 in [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md)  

## §21 P1 Timezone/scheduling — DONE (PARTIAL residual)

- **Classification:** ALREADY FIXED (ship bar) / **PARTIAL** overall  
- **Evidence:** [`GO_SPOTS_TIMEZONE.md`](./GO_SPOTS_TIMEZONE.md) (residual plan lane **TZ21-residual-docs**)  
- **Shipped:** `Shop.timezone` column + migration `20260720220000_shop_timezone`; API `venue-timezone.util` + `loadShopVenueTimeContext`; IANA settings UI (Lane **B-timezone-ui**) + onboarding; venue day-key wiring for schedule overlap (`dayBoundsInTimeZone`), finance/menu stock reset (`venueDayKey`), opening-hours weekday keys, public booking horizon  
- **Residual:** Neon migrate apply; web display/picker paths still browser-local `toLocale*` (not venue IANA day boundaries); deprecated `dayBoundsLocal` retained; no web `calendarDayInTimeZone` mirror — Phases 1–3 in [`GO_SPOTS_TIMEZONE.md`](./GO_SPOTS_TIMEZONE.md)  
- **Operator checklist:** Gates 0–3 in [`GO_SPOTS_TIMEZONE.md`](./GO_SPOTS_TIMEZONE.md) (migrate → set venue TZ → schedule/stock smoke near midnight)  

## §22 P1/P2 Email + background jobs — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md) (residual plan lane **MAIL22-residual-docs**)  
- **Shipped:** expand-only `MailOutbox` table (migration #8); persist-first enqueue on `MailService.send`; sync deliver + exponential backoff; `MailOutboxProcessor` minute cron + GS/MO advisory lock; owner dead-letter API + settings UI; SUPER_ADMIN system-mail (`shopId IS NULL`) ops panel; jest outbox + lock **18** PASS — Bible #22 ship bar **DONE** (Lanes SS → TTTTT)  
- **Residual:** **prod retry proof** not executed (operator Gates 0–5); outbox depth / DEAD alerting deferred to [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) Phase 4; SENT-row retention purge **shipped opt-in** (Lane **MAIL22-sent-retention** — `MAIL_OUTBOX_SENT_RETENTION_CRON=on`) — Phases 1–2 in [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md)  

## §23 P2 Real-time ops — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** notifications SSE + poll fallback — [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md)  
- **Shipped:** in-process `NotificationsSseHub`; `GET /notifications/stream` (cookie JWT, shop-scoped, `@SkipThrottle`, heartbeat); web `useNotificationsSse` on notifications panel; poll fallback retained (panel ~20s; toast ~15s poll-primary)  
- **Residual:** Redis/PG NOTIFY multi-instance fan-out; floor/sessions/guest-chat SSE; shared `RealtimePublisher` bus — Phases 1–4 in [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md) (**no Redis dependency on disk**; trigger ≥2 API instances)  

## §24 P2 Observability — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) (residual plan lane **OTEL24-residual-docs**)  
- **Shipped:** Nest `Logger`; `RequestLoggingInterceptor` (method, path, status, duration, `x-request-id`, `shopId` — no secrets); health `GET /api/v1/live` `/health` `/ready` (DB); optional API Sentry init (`SENTRY_DSN`, fail-open, PII scrub); global 5xx `SentryExceptionFilter` (4xx excluded); env examples — Bible #23 ship bar **DONE** (Lane **UUUUUU**)  
- **Residual:** Full OpenTelemetry SDK + OTLP exporter + auto-instrumentation (**no app OTel bootstrap on disk** — transitive deps via `@sentry/node`/Next only); API distributed tracing / `@sentry/nestjs` perf module; web `@sentry/nextjs` client errors; metrics + log–trace correlation; operator staging DSN smoke — Phases 1–4 in [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md)  

## §25 P2 Backup/DR docs — PARTIAL / OPERATOR

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) (lane **DR25-drill-docs**)  
- **Shipped:** Neon PITR/branch restore paths, ordered post-restore verify (`DATABASE_URL` → migrate deploy if behind → `/ready`), RTO/RPO guidance, partial-outage runbook (+ in-app mirror) — Bible **#24** ship bar **DONE** (Lane **JJJJJJ**)  
- **Confirmed (operator):** Neon project `mute-butterfly-69488238` / `Gospots`; PITR retention **6 hours** (Free plan max) — recorded in DR doc  
- **Residual (OPEN — not a ship blocker):** **PITR restore drill never executed** (`Last restore drill date`: `_never_`; outcome: `_TBD_` — do not backdate); automated backup-verify job; uploads/object-storage backup  
- **Operator checklist:** [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) § Restore drill — gates 0–7 (PITR branch → staging API → migrate if behind → `/ready` → login smoke → record actual date + outcome)  

## §26 P2 Upload security — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** [`GO_SPOTS_UPLOAD_SECURITY.md`](./GO_SPOTS_UPLOAD_SECURITY.md) (residual plan lane **UPLOAD26-residual-docs**)  
- **Shipped:** MIME allowlist + magic-byte sniff + 8 MiB cap + sharp re-encode → `StoredImage`; shop-scoped delete; safe id parse; opaque public `GET /media/:id` for published assets (accepted); Phase 1 `inventory:legacy-uploads` + `migrate:legacy-uploads` CLIs; `LEGACY_UPLOADS_STATIC` gate on `main.ts` (default **on** + boot warn); no new disk writers — legacy matrix **#27 DONE** (Lanes **SSSS**, **VVVVV**) = this ship bar only  
- **Residual (operator):** live inventory → 0; migrate remaining `/uploads/…` refs; `LEGACY_UPLOADS_STATIC=false`; delete host disk tree — Gates 0–5 in [`GO_SPOTS_UPLOAD_SECURITY.md`](./GO_SPOTS_UPLOAD_SECURITY.md)  
- **Residual (future app):** `StoredImage.visibility` + auth/signed GET for private assets (Phase 2); async malware quarantine + optional object storage (Phase 3) — **no visibility column / no AV integration on disk**  

## §27 P2 Privacy/GDPR — PARTIAL

- **Classification:** PARTIALLY CONFIRMED (module + privacy docs)  
- **Evidence:** GDPR module + retention processor; [`docs/privacy/DATA_MAP.md`](../privacy/DATA_MAP.md), [`docs/privacy/RETENTION_POLICY.md`](../privacy/RETENTION_POLICY.md)  
- **Residual:** counsel-aligned public policy; automated retention schedule soak  

## §28 P2 Abuse protection — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) (residual plan lane **ABUSE28-residual-docs**)  
- **Shipped:** env `PUBLIC_THROTTLE_*` on six public creates (default **5**/min) + global/auth limits; `captcha.util.ts` verify + `assertCaptchaOrThrow` on all publicThrottle creates; optional Turnstile/hCaptcha web widget; in-memory `after_throttle` 429 escalation (`captcha-escalation.util.ts` + `CaptchaAwareThrottlerGuard`; cross-surface ≥2 kinds → all creates); default `CAPTCHA_PROVIDER=off` no-op — Bible **#26** ship bar  
- **Residual (operator):** Gates 1–3 in [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) — site+secret keys + flip `CAPTCHA_PROVIDER` / `NEXT_PUBLIC_CAPTCHA_*` together; optional Gate 4 `CAPTCHA_MODE=always`  
- **Residual (scale/future):** Redis multi-instance escalation store; `captcha_verify_fail` metrics; WAF/edge; honeypot; deeper pattern detection — **no Redis escalation store on disk**  

## §29 P2 Accessibility — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** 13-route public axe smoke (critical hard-fail; soft-log serious+); scattered `aria-*`; `confirm-dialog` alertdialog; `prefers-reduced-motion`; optional CI `web-a11y-smoke` (non-blocking, skip-if-no-Next) — [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md)  
- **Residual:** dashboard authenticated axe; shared modal focus trap; contrast pass; hard CI gate + Next boot; web eslint/jsx-a11y baseline — Phases 0–4 in [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md)  

## §30 P2 Internationalization — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** en/pl dashboard (**1992**) + public (**1020**) keyed UI chrome; `i18n:check` en⊆pl parity script; Lane **TTTTT** ship bar (auth, ops, finance, public guest flows); partial de/fr/es/ar via `i18n-locale-blocks.ts` — [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md)  
- **Verify:** `pnpm --filter @gospots/web run i18n:check`  
- **Residual:** secondary locale ops parity; API/email/legal English; `i18n:check` not CI-gated — Phases 0–4 in [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md)  

## §31 Product-focus cleanup — PARTIAL

- **Classification:** PARTIALLY CONFIRMED — **ship bars met** for commercial UX (#33), owner/guest split (#34), marketplace Phase A surfaces (#35); **NOT** full scope cut or live directory cohort  
- **Evidence (shipped):**
  - Gaming-first self-serve register/pricing/landing — three marketing bundles; restaurant/hotel → contact; hide > delete (**Lane KKKKKK**) — [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md)
  - Owner vs guest marketing separated — `/` + `/for-venues` owner; `/venues` guest (**#34 DONE**)
  - Marketplace Phase A — pilot city landing `/venues/wroclaw`, directory CTAs, in-repo GTM checklist (**Lane MMMMMM**) — [`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md)
  - Onboarding wizard reduces empty-dashboard churn (**Lane LLLLLL**, §32) — [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md)
- **Verify:** web typecheck + `i18n:check` PASS for Phase A lanes; docs-only for this §31 residual row  
- **Residual:**
  - **Product focus Phase B–D:** sidebar F&B group collapse; ops landing weight; events/marketing discoverability; subscription-before-wizard ordering; Phase C pack alias evaluation; Phase D Tier 3 manual-only sales ops — Phases B–D in [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md)
  - **Marketplace (#35):** operator S1–S4 cohort execution; S2 density gate before guest promo; M4 admin cohort; M5 free-directory entitlement split — **no live cohort claim**
  - **Intentionally not residual here:** deleting dining/menu API routes; pack catalog removal; unified ticket / model merge (separate §§)  

## §32 Onboarding — PARTIAL

- **Classification:** PARTIALLY CONFIRMED  
- **Evidence:** web first-run checklist + apply-template API — [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md)  
- **Shipped:** 10-step wizard + five templates + localStorage resume (Lane **LLLLLL**); idempotent `POST /shop/onboarding/apply-template` + web delegation (**ONBOARD32-apply-template**, **ONBOARD32-web-apply**) — **no schema**  
- **Residual:** server `onboardingCompletedAt` / multi-device progress — **Phase 1 implementation ticket** (SQL sketch + DTO + web sync design) in doc (**ONBOARD32-phase1-plan**; **no columns on disk**); mixed dining seed (Phase 3); #33 Phase B sidebar (Phase 4)  
- **Next implement lane:** `ONBOARD32-phase1-implement` (requires schema lock)  

## §33 Offline / degraded — PARTIAL (ship bar shipped)

- **Classification:** PARTIALLY CONFIRMED — **ship bar:** Modes A–C/F connectivity UX + fail-closed money/booking + ops runbook; **NOT** offline-first PWA or client mutation queue  
- **Evidence:** [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) (residual plan lane **OFFLINE33-residual-docs**)  
- **Shipped:** `ConnectivityProvider` + `/ready` probe; app-wide `OfflineBanner`; prod-safe `ApiError`; `useLiveData` / notification poll backoff + Mode F; public booking + guest chat fail-closed on A–C; DR appendix + owner Settings runbook (Lanes **QQQ→SSSSS**)  
- **Residual:** Mode E scoped degradation toasts; floor/session “as of” timestamps; finance retry UX; guest status outage cards; auth/CSRF outage copy; optional `sessionStorage` display snapshot — Phases 5–6 in doc (**no service worker / no offline queue on disk**)  

## §34 Test coverage — PARTIAL (unit + CI ship bar shipped)

- **Classification:** PARTIALLY CONFIRMED — **ship bar:** substantial API Jest suite + CI lint/build/test + ephemeral migrate dry-run + web typecheck + opt-in concurrency scaffold/bodies + optional Playwright smokes; **NOT** full e2e matrix or hard web build/eslint/i18n gates  
- **Evidence:** [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md) (residual plan lane **TEST34-residual-docs**); [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md)  
- **Shipped:** ~**105** API `*.spec.ts` (mock unit + §14 characterization + tenant isolation); CI jobs `api` / `api-migrate` / `web`; opt-in `pnpm test:concurrency` (gate **6** + C1–C3 util/lock bodies **HHHHHH**); Playwright `/login` smoke + 13-route public axe (skip-if-no-Next); Nest `app.e2e-spec.ts` health stub (**not CI-gated**)  
- **Verify:** `pnpm --filter @gospots/api test`; `pnpm --filter @gospots/web run typecheck`; `pnpm test:concurrency` (gate only without `RUN_CONCURRENCY_TESTS=1`)  
- **Residual:** full owner/staff/guest/ops Playwright matrix; hard CI `next build` / web eslint / `i18n:check`; web component unit tests; operator local Docker C1–C3 run; optional Nest service-level concurrency wrappers; broader integration DB tests — Phases 0–4 in [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md)  

## §35 Performance review — PARTIAL (light smoke shipped)

- **Classification:** PARTIALLY CONFIRMED — **ship bar:** index inventory note + Node smoke script; **NOT** full load suite  
- **Evidence:** GiST reservation exclusion + shopId indexes (`schema.prisma`, migration `20260721060000_*`); [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md); `apps/api/scripts/perf-smoke.mjs` → `pnpm perf:smoke` (`/api/v1/ready` p50/p95 + public `/public/venues` stub)  
- **Verify:** `pnpm --filter @gospots/api run perf:smoke` (API + DB up; exits non-zero if ready fails)  
- **Residual:** k6/Artillery sustained load; live EXPLAIN snapshots + Phase 3 query fixes from inventory; CI perf gate — Phases 1–4 in [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md); Phase 0 inventory [`artifacts/perf/n1-pagination-inventory.md`](./artifacts/perf/n1-pagination-inventory.md) (**6 HIGH**)  

## §36 API consistency — PARTIAL (ship bar)

- **Classification:** PARTIALLY CONFIRMED → envelope shipped  
- **Evidence:** `api-error.util.ts`, `api-error.codes.ts` (`ApiErrorCode` + status map + domain registry + `API_ERROR_CODE_CATALOG`), `SentryExceptionFilter` JSON `{code,message,details,requestId}` + `x-request-id`; **Phase 0 OpenAPI** — `ApiErrorBodyDto` + `extraModels` + pattern route `@ApiResponse` errors (lane **API36-openapi-phase0**); **Phase 2 OpenAPI catalog** — `ApiErrorCode` enum in `/docs` components (lane **API36-openapi-phase2**)
- **Residual:** domain-specific caller `code`s at throw sites; OpenAPI Phase 1 remaining controllers; web client `code` dual-read — phased plan [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md) (registry documented; **no domain throw-site migration on disk yet**)
- **Verify:** jest api-error.codes + api-error.util + sentry-exception.filter **24** PASS 

## §37 Final acceptance gates — **NOT DONE** (operator)

**Verdict:** Code, migrations, and agent board are largely complete; **production acceptance is not finished** until Render is resumed, manual smoke passes, and operator flag soaks complete. Do **not** claim ship/bible **DONE** on code alone.

| Gate | Status | Notes |
|------|--------|-------|
| 0 Agent board | **DONE** | No lanes in progress — [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) |
| 1 Repository health | **PARTIAL** | nest/web typecheck + CI green locally; **prod API suspended** on Render (`503`, `x-render-routing: suspend-by-user`) |
| 2 Data integrity | **PARTIAL** | 18 migrations **applied** on Neon (verify 58=58); safety flags **off** until soak (`TENANT_RLS`, `LEDGER_DUAL_WRITE`, `LEDGER_READS`) |
| 3 Security | **PARTIAL** | CSRF/cookies/guest hash/owner MFA ship bars on disk; RLS migration applied but **`TENANT_RLS` unset/off** |
| 4 Concurrency | **PARTIAL** | App lock + GiST exclusion **applied on Neon**; live util bodies on disk; **operator** local Docker C1–C3 Gates 0–3 [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |
| 5 Finance | **PARTIAL** | Decimal + ledger dual-write/read paths on disk; **defaults off**; `backfill:ledger` CLI not operator-run |
| 6 Maintainability | **DONE** (ship bar) | §14 finance/auth/reservations facade split **complete**; login/register/activate/`issueTokens` on `AuthService` by design — [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md) |
| 7 Deploy / env | **DONE** | Render + Vercel env set; `www.gospots.eu` / `www.gospots.pl` live; `render.yaml` hardened |
| 8 Manual smoke | **BLOCKED** | Render suspend blocks `/live`, `/ready`, login, book, Vercel `/api/v1` proxy; partial probe: Vercel web **200**, direct API **503** — [`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md) |
| 9 Flag soak | **NOT STARTED** | After smoke: RLS Gates 0–4 [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) (`TENANT_RLS=on`); ledger Gates 0–7 [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) (`LEDGER_DUAL_WRITE=on` → backfill → `LEDGER_READS`); CAPTCHA when keys set |
| 10 DR drill | **PARTIAL** | Neon PITR **6h** confirmed; restore drill **never run** (`_never_` / `_TBD_`) — explicit checklist in [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md); not a ship blocker but open |

**§37 exit criteria (all required):**

1. **Resume Render** → `GET …/api/v1/live` and `…/ready` → **200**, `database: up` (direct + via custom domain proxy)
2. **Manual smoke** — full checklist in [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) §2 / [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) §3
3. **Operator soaks** — RLS + ledger dual-write (and optional reads) with monitoring before treating finance/tenant paths as production-proven
4. Optional: Neon PITR restore drill in [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md)

## §38 Final implementation report — DONE (living)

- [`GO_SPOTS_IMPLEMENTATION_REPORT.md`](./GO_SPOTS_IMPLEMENTATION_REPORT.md) — keep appending; do not claim “prompt complete”

## §39 Final execution order — PROCESS

Use remaining work in [`GO_SPOTS_FIX_PLAN.md`](./GO_SPOTS_FIX_PLAN.md) (reprioritized from residuals).

## §40 Final behavior instruction — PROCESS

Continue: verify → fix confirmed → test → document. Do not mark a section DONE unless callers, migrations, and tests match.

---

## Crosswalk: old bible #1–35 → this §§ matrix

| Old # | Theme | Primary § |
|------:|-------|-----------|
| 1 | Money | §4 |
| 2 | Tests | §34 |
| 3 | Tenant/RLS | §6 |
| 4 | Booking races | §7 |
| 5 | Stock races | §8 |
| 6 | Ledger | §5 |
| 7 | Idempotency keys | §5/§9 adjacency |
| 8 | Lemon webhook | §9 |
| 9 | Migration safety | §2/§3 |
| 10 | GuestCheck | §19 |
| 11 | Service split | §14 |
| 12 | Pack/tier | §15 |
| 13 | CSV perms | §16 |
| 14 | Resource/dining | §17 |
| 15 | offeringConfig | §18 |
| 16 | CSRF | §10 |
| 17 | Guest tokens | §11 |
| 18 | MFA/sessions | §12 |
| 19 | Dashboard key | §13 |
| 20 | Currency FX | §20 |
| 21 | Timezone | §21 |
| 22 | Mail outbox | §22 |
| 23 | Observability | §24 |
| 24 | DR | §25 |
| 25 | GDPR | §27 |
| 26 | Abuse/CAPTCHA | §28 |
| 27 | Uploads | §26 |
| 28 | SSE realtime | §23 |
| 29 | A11y | §29 |
| 30 | i18n | §30 |
| 31 | Onboarding | §32 |
| 32 | Offline | §33 |
| 33 | Product focus | §31 |
| 34 | *(was misc)* | — |
| 35 | Marketplace | §31 |

---

## Next code priorities (from full prompt, not ship-bar theater)

1. ~~§14 continue: auth refresh extract + reservations extract~~ — **DONE (ship bar):** finance Phases 0–3 + auth session/refresh/logout/password/venue/MFA + reservations public/schedule/staff; see [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md). Residual by design: login/register/activate on `AuthService`; reminders cron may remain  
2. ~~§19 Option B/C **or** explicitly defer with finance-contract note~~ — **DONE (deferred):** Option B/C settle-as-root deferred post–ledger soak; see [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) Phase 3b  
3. ~~§27 privacy docs~~ — DATA_MAP + RETENTION exist  
4. ~~§36 API error envelope~~ — shipped; OpenAPI + domain codes **documented** [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md); app migration **residual**  
5. ~~§35 lightweight perf pass~~ → **PARTIAL DONE** (Lane **PERF35-light**); full load suite + N+1/EXPLAIN + CI gate **documented** Phases 0–4 [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md) (Lane **PERF35-residual-docs**)  
6. Operator: Resume Render → smoke → RLS Gates 0–4 [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) (`TENANT_RLS=on`) → ledger Gates 0–7 [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) (`LEDGER_DUAL_WRITE` → backfill → `LEDGER_READS`)
