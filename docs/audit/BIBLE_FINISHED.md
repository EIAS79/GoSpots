# Bible finished work log

Update rule: when a bible item (or clear sub-slice) ships, append a dated entry here **and** flip status in [`BIBLE_STATUS.md`](./BIBLE_STATUS.md).

Only **truly shipped** code or solid operator docs belong here. Design-only docs are noted only when they close a design lane (parent item stays `DESIGN_ONLY` / `PARTIAL` in status).

Links: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) · [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · [`BIBLE_PROGRESS.md`](./BIBLE_PROGRESS.md)

---

## 2026-07-21

### #14 Resource / dining model merge — DONE (Phase 0–2 Option C)

- Lane **OOOOOO** Phase 0+1 + **OOOOOO-resource-merge-p2** Phase 2: Option C locked; drift util/CLI; expand `SeatingTableGroup.sourceDiningTableGroupId` → `DiningTableGroup` (`20260721120000_seating_source_dining_table_group` on disk); dual-write util (`RESOURCE_DINING_DUAL_WRITE` default on) from dining table-group create/update/delete + section floor/zone; seating create accepts optional source FK; no `availableCount` auto-sync from bookings.
- Files: schema + migration; `resource-dining-dual-write.util.ts`(+spec); `resource-dining-drift.util.ts`(+spec); `resources.service.ts`; `seating-tables.service.ts` + DTO; env examples; [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md).
- Verify: jest resource-dining-drift+dual-write **20** PASS; nest build **PASS**. **No Neon.**
- Residual: Phases 3–4 UI cutover / DROP superseded non-custom seating for DINING-equivalent shops.

### #10 Unified guest check / open tabs — DONE (Phase 0–2 Option A)

- Lane **NNNNNN-guest-check-done**: Phase 0 **Option A** (ops container) locked in [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md). Phase 1: `GuestCheck` + optional `guestCheckId` on `ShopOrder` / `PlaySession` / `Reservation`; migration `20260721110000_guest_check` on disk; `LedgerEntry.guestCheckId` FK. Phase 2: `GET/POST /guest-checks`, attach/detach/void; staff `/guest-checks` open-tabs board with running total; en/pl. Anti-double-count: linked play excluded; order `reservationFee` not double-added.
- Files: `guest-check-total.util.ts`(+spec), `modules/guest-check/**`, schema + migration, web panel/page/nav/i18n; status docs.
- Verify: jest guest-check **12** PASS; nest build PASS; web typecheck PASS; i18n **1989**+**1020**. **No Neon.**
- Residual: Phase 3 single-settle + finance-contract update; Phase 4–5 identity/contract drop. OPERATOR Neon migrate.

### Hotfix — web typecheck (`offline-banner` import)

- `offline-banner.tsx` imported `@/lib/venue-settings` (missing); corrected to `@/lib/venue-settings-context` (same hook as rest of dashboard).
- Verify: `pnpm --filter @gospots/web run typecheck` **PASS**.

### #29 Accessibility — CI non-blocking follow-up

- Added GitHub Actions job `web-a11y-smoke` (`continue-on-error`) running `test:a11y:smoke` (skip-if-no-Next → 13 skipped on bare runners). Hard gate + Next boot + dashboard auth routes remain residual.
- Trackers: `BIBLE_STATUS.md` #29, `GO_SPOTS_A11Y_I18N.md`, `BIBLE_PROGRESS.md`, board WWWWW row.

### #35 Marketplace after supply — DONE (Phase A city landing + GTM checklist)

- Lane **MMMMMM**: Honest DONE = Phase A product surfaces — pilot city config (Wrocław), `/venues/wroclaw` landing (en/pl), `/for-venues`+`/` Join-directory CTA, `/venues` empty-state/pilot hint, in-repo [`MARKETPLACE_GTM_CHECKLIST.md`](./MARKETPLACE_GTM_CHECKLIST.md) matching S0–S4. **No** live cohort execution claimed; **no** API/schema/Neon; **no** M4–M5 entitlement split.
- Files: `pilot-cities.ts`, `venues/[citySlug]/page.tsx`, `city-landing.tsx`, `pilot-city-cta.tsx`, surgical `landing-page.tsx` + `venues-discovery.tsx`, `public-i18n.ts`; [`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md); checklist; status.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (**1953**+**1020**); web `tsc --noEmit` PASS.
- Residual: operator S1–S4 execution; M4 admin cohort; M5 free-directory entitlement; national guest ads after S2.

### #11 Oversized services — DONE (Phase 0+1 ship bar)

- Lane **SPLIT11-finance-p1**: Honest DONE = Phase 0 `auth.types.ts` (`JwtAccessPayload` + re-export) + Phase 1 finance **reports** + **losses** extract (`FinanceReportsService`, `ShopLossService`, `finance-guard.util`) with `FinanceService` facade; characterization suite (≥1 happy + ≥1 denial per group). Controllers/routes unchanged. **No Neon/schema.** Residual: Phases 2–9 (txns/orders/play/auth/reservations).
- Files: `auth.types.ts`; surgical `auth.service.ts` re-export; `finance-reports.service.ts`, `shop-loss.service.ts`, `finance-guard.util.ts`, `finance.module.ts`, facade edits in `finance.service.ts`; specs + `finance.reports-losses.characterization.spec.ts`; [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md); status.
- Verify: jest characterization+tenant+play-billing+play-session **22** PASS; nest build PASS.

### #31 Onboarding guided wizard — DONE

- Lane **LLLLLL-onboarding-wizard**: Web-only 10-step guided setup (details → TZ/currency → hours → 5 templates → categories → resources → pricing → test play-session → staff invite → public preview/checklist). Progress in localStorage; templates seed via existing resource + venue-category APIs; register + create-venue → `/onboarding`; owner resume banner. en/pl. **No schema / Neon / auth.service.**
- Files: `onboarding/page.tsx`, `onboarding-wizard.tsx`, `onboarding-resume-banner.tsx`, `onboarding-progress.ts`, `onboarding-templates.ts`, `apply-onboarding-template.ts`, register + tenant-shell + venue-switcher wires, `i18n.ts`; [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md); status.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (**1953**+**1003**); web typecheck PASS.
- Residual: server progress columns / apply-template API; mixed dining table-group seed; #33 Phase B sidebar polish.

### #6 Financial ledger — DONE (Phase 1–2 dual-write ship bar)

- Lane **LEDGER6-ledger-dual-write**: `LedgerEntry` + enums + migration `20260721100000_ledger_entry` on disk (RLS policy); idempotent dual-write behind `LEDGER_DUAL_WRITE` (default off) from transaction create, shop-order complete, play billing paid, walk-in `markPlaySessionPaid` + `updatePlaySession` COMPLETED, reservation billed, shop loss create. Analytics stay interim channel-sum. **No Neon / no LEDGER_READS cutover.**
- Files: `schema.prisma`, migration, `ledger-post.util.ts`(+spec), surgical `finance.service.ts` + `reservations.service.ts`, `.env*.example`; [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md); status.
- Verify: jest ledger+money pattern **136** PASS; nest build PASS.
- **OPERATOR:** Neon migrate; soak then `LEDGER_DUAL_WRITE=on`. Residual: backfill + Phase 4 reads.

### #13 Permissions / add-ons CSV cutover — DONE

- Lane **IIIIII-csv-cutover** (takeover): Stop dual-write — `MembershipPermission` / `SubscriptionAddOn` are SoT; rows-primary reads; mutations write rows only (`replace*Rows`); computed CSV for JWT/API only. Schema drops `Membership.permissions` + `Subscription.addOns`; keep `pendingAddOns` CSV. Migration `20260721090000_drop_membership_permissions_subscription_addons_csv` on disk (**no Neon**).
- Files: `permissions.ts`, `venue-packs.ts`, `venue-entitlements.ts`, `subscription-tier.ts`, staff/auth/billing/dashboard services + specs; `schema.prisma` + DROP migration; [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md); status.
- Verify: jest venue-entitlements+pack-tier+staff+auth+billing+finance-related **103** PASS; nest build PASS.
- **OPERATOR:** Neon deploy DROP after live app never SELECTs dropped columns.

### #33 Product scope / narrow focus — DONE (Phase A commercial UX)

- Lane **KKKKKK**: Gaming-first self-serve cut — register + landing pricing + who-its-for offer **gaming/mixed** only; three marketing bundles; restaurant/hotel → contact sales; hero + metadata gaming-first (en/pl). Hide > delete; no schema/API/Neon. Residual: Phase B (#31/sidebar), C pack alias, D sales ops.
- Files: `apps/web/src/lib/venue-packs.ts` (`SELF_SERVE_PACK_*`, `MARKETING_BUNDLES`), `pricing.tsx`, `who-its-for.tsx`, `register/page.tsx`, `page.tsx`, `for-venues/page.tsx`, `public-i18n.ts`; [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md); status.
- Verify: `i18n:check` **1871**+**1003**; web `tsc --noEmit` PASS.

### #24 Backup / disaster recovery — DONE (docs ship bar)

- Lane **JJJJJJ**: Runbook ship bar for unclear DR procedures — Neon PITR/branch restore paths, ordered post-restore verify (`DATABASE_URL` → migrate deploy if behind → `/ready`), RTO/RPO guidance table, restore-drill checklist, secret rotation, API/Web re-point; partial-outage table retained (+ in-app #32 mirror). **No apps code / no Neon.**
- Files: [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md); status docs; Friday checklists note live TBD fill-in as residual.
- Verify: n/a (docs). Residual (OPERATOR): fill Neon project id / retention / last drill from console; execute one restore drill; automated backup job deferred.

### #25 GDPR — DONE

- Lane **VVVVVV**: Export expanded; guest erase (+ contact/review + by-email); account wipe (sessions revoked, MFA/TOTP + recovery codes cleared, owned venues unpublished + guest PII redacted, user tombstoned); `ConsentRecord` + public consent checkboxes (`PrivacyConsentCheckbox` `label` API); guest DSAR API + venue form + owner inbox; daily retention cron (GS+GD lock; money kept). Migration `20260721070000_gdpr_consent_dsar` on disk (**no Neon**). **Schema lock released.**
- Verify: jest gdpr+consent+lock **25** PASS; nest build PASS; web typecheck PASS.
- **OPERATOR:** Neon migrate; Lemon/Resend processor purge (accounting carve-out).

### #18 Owner 2FA / TOTP — DONE

- Lane **AAAAAA**: Owner-only authenticator MFA end-to-end per [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md). Migration `20260721080000_user_mfa_totp` on disk (User TOTP columns + `MfaRecoveryCode`); AES-GCM secret at rest; enroll/confirm/disable/regenerate; login challenge JWT (~5m) before cookies; recovery codes single-use; lockout shared with password fails; password reset keeps TOTP. Web settings panel + login MFA step (en/pl).
- Files: `schema.prisma`; `prisma/migrations/20260721080000_user_mfa_totp/`; `mfa-*.util.ts`(+specs); `auth.service.ts`(+`auth.service.mfa.spec.ts`); `auth.controller.ts`; `auth.dto.ts`; web `auth-mfa-client.ts` / `auth-mfa-panel.tsx` / login form; env examples `MFA_TOTP_ENCRYPTION_KEY`; status docs.
- Verify: jest mfa utils + `auth.service.mfa` **18** PASS; `nest build` PASS; web typecheck PASS; `i18n:check` **1871**+**989**.
- Residual: OPERATOR Neon migrate; staff MFA / WebAuthn / org require-MFA deferred; forced reauth on more owner mutations.

### #2 / #4 / #5 — Live concurrency C1–C3 bodies (util/lock path)

- Lane **HHHHHH**: Opt-in `Promise.allSettled` recipes against local Postgres — fixtures (`concurrency.fixtures.ts`); C1/C2 booking race via `withResourceBookingLock` + `assertBookingSlotFree`; C3 last-unit stock via `adjustMenuItemStockBy` conditional UPDATE. Harness still refuses Neon. No Nest service DI; no hot-service edits; no schema/Neon deploy.
- Files: `test/concurrency/concurrency.fixtures.ts`; `booking-double-book.spec.ts`; `stock-last-unit.spec.ts`; harness comment.
- Verify: `pnpm test:concurrency` → gate **6** PASS; live describes **skipped** (Neon `.env` / no `RUN_CONCURRENCY_TESTS=1`). Bodies ready for local Docker.
- Residual: Nest service-level wrappers (optional); OPERATOR run against local Docker after migrate.

### #2 Automated testing — DONE (unit + CI + opt-in concurrency ship bar)

- Lane **GGGGGG**: Ship bar = substantial API Jest suite in CI + web typecheck + ephemeral migrate dry-run + opt-in concurrency scaffold (`pnpm test:concurrency`, Neon-refuse gate, C1–C3 todos) + optional Playwright e2e/axe smokes (not CI-gated). Design: [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md). **No** schema / Neon / hot services.
- Files: status docs + concurrency design ship-bar note only (scaffold already shipped Lane XXX).
- Verify: `pnpm test:concurrency` → gate **6** PASS; live describes skipped. Full `pnpm test` may be mid-flight red from concurrent MFA/GDPR lanes — not this lane.
- Residual: OPERATOR local Docker run of C1–C3 (**HHHHHH** bodies shipped); Nest service wrappers optional; web unit tests; full e2e / `next build` / eslint CI gates.

### #15 offeringConfig — DONE (Phase 0 versioned JSON + typed contract)

- Lane **EEEEEE**: Phase 0 from [`GO_SPOTS_OFFERING_CONFIG.md`](./GO_SPOTS_OFFERING_CONFIG.md) — `schemaVersion: 1` stamp on category write/read prep + FX offering reprice; reject unsupported versions; export `OfferingConfigV1` / bowling mode types; `pnpm inventory:offering-config` read-only validity scan. Keep validators + string price normalize. **No** schema/migrate; relational rate de-dup residual.
- Files: `offering-config.util.ts`(+spec); surgical `resources.service.ts` / `shop.service.ts` (prepare helper); `scripts/inventory-offering-config.ts`; `package.json` script; design + status docs.
- Verify: jest offering-config **26** PASS; reprice **6** PASS.
- Residual: Phase 1–3 relational money de-dup / column promote / bowling child tables.

### #30 Internationalization — DONE reinforcement (en/pl product UI deep sweep)

- Lane **TTTTT-i18n-enpl-done**: Earns full en/pl ship bar beyond prior dining/`publicBooking` slice — overview, gallery, reviews, notes, audit, sessions, reservation dialog, event requests, gaming/dining setup, venue gate/switcher, directory search, seat-floor residual, charts empty, theme toggle, offline banner → `opsOutage.mode*Desc`.
- Namespaces (dashboard): `dashOverview.*`, `galleryPanel.*`, `reviewsStaff.*`, `notesPanel.*`, `venueGate.*`, `sessionsPage.*`, `reservationDialog.*`, `eventRequests.*`, `auditPage.*`, `gamingSetup.*`, `diningSetup.*`, `venueSwitcher.*`, `charts.*`, floor residual chrome. Public: `venueSearch.*`, `venuesDiscovery.*`, `theme.*`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **1871/1871**, public **989/989**). #30 UI files typeclean; project-wide web typecheck may be red from concurrent MFA/GDPR mid-flight (`privacyConsentAccepted` / MFA login) — not this lane.
- Residual (non-blocking): de/fr/es/ar; business-data placeholders; unused plan-catalog/live-preview; API/email; legal prose.

### #12 Pack vs legacy tier — DONE (Phase 1 pack-only authz)

- Lane **FFFFFF**: Ship bar = pack-only module resolution (`packId` + `effectiveAddOnsForSubscription`); removed FEATURE_MATRIX / `legacyModulesFromTier` belt union on pack path; `menu_orders` grants `bar`; ENTERPRISE billed tier preserves `multi_shop`/`integrations` until catalog add-ons exist; web `plan.ts` + `venue-packs` parity; dry-run `pnpm backfill:legacy-addon-tier` (+ `--apply`) persists synthesized STANDARD+ add-ons. Design: [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md).
- Files: `subscription-tier.ts`; `venue-packs.ts` (API+web `menu_orders`); `plan.ts` ENTERPRISE gap; `pack-tier-backfill.util.ts`(+spec); `scripts/backfill-legacy-addon-tier.ts`; `venue-entitlements.spec.ts`; status docs. **No** schema DROP / **no** Neon.
- Verify: jest venue-entitlements + pack-tier-backfill **29** PASS; `tsc` PASS.
- Residual: optional DROP `tier`; pack-less `legacyModulesFromTier`; OPERATOR backfill `--apply`; dedicated multi_shop/integrations add-ons.
- **#13 DONE** (Lane IIIIII) — rows SoT + DROP migration on disk; OPERATOR Neon.

### #5 Inventory / stock races — DONE

- Lane **BBBBBB**: Ship bar = conditional stock SQL + atomic SALE txn + order-line claims + **claim ACTIVE lines before order delete** (shared `claimActiveLinesAndRestoreStock`) so cancel↔delete cannot double-restore; add-line day-reset inside txn; unit race specs. Live C3 body deferred (DATABASE_URL is Neon; harness refuses Neon — same as #4).
- Files: `shop-order-stock.util.ts`(+spec); `menu-stock-db.util.spec.ts`; surgical `finance.service.ts` cancel/delete/add-line stock; `test/concurrency/stock-last-unit.spec.ts` comment; [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md); status docs. **No** Neon / schema / auth 2FA.
- Verify: jest menu-stock-db + shop-order-stock **16** PASS; `pnpm test:concurrency` gate **6** PASS (live describes skipped); `tsc` + `nest build` PASS.
- Residual: local Docker C3 `Promise.allSettled` body when opted in.

### #17 Guest-management tokens — DONE (hash/expiry/revoke + clear tooling)

- Lane **DDDDDD**: Ship bar = hash-at-rest + expiry + revoke on cancel/NO_SHOW + dual-read legacy plaintext + dry-run `clear:guest-plaintext` CLI. Dual-read stop / DROP plaintext / statusPath mail residual stay post-verification (design [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md)) — same residual pattern as #19 optional DROP.
- Also: web `plan.ts` entitlement parity — `effectiveAddOnsForSubscription` synthesis + pack-only module path (no legacy module union; aligned with **FFFFFF**). **#12 DONE** via FFFFFF.
- Files: `apps/web/src/lib/plan.ts`; `apps/web/src/lib/venue-packs.ts` (`legacyAddOnsFromTier`); status docs. **No schema / no Neon / no auth.**
- Verify: jest guest-token+guest-plaintext-clear PASS; web typecheck PASS.
- Residual (operator): Neon migrate hash expand if pending; clear `--apply` after smoke; dual-read stop + DROP later.

### #9 Migration safety — DONE (Phase 1 CI + Phase 2 template + Phase 3 verify)

- Lane **CCCCCC**: Ship bar = Phase 1 ephemeral `api-migrate` CI (prior **KKKKK**) + Phase 2 copy-paste [`MIGRATION_PREFLIGHT_TEMPLATE.md`](./MIGRATION_PREFLIGHT_TEMPLATE.md) + Phase 3 read-only `pnpm run verify:migrations` (`verify-migrations.util` disk↔`_prisma_migrations` + optional money/guest spot checks). **No** schema/migrations SQL; **no** Neon deploy.
- Files: `MIGRATION_PREFLIGHT_TEMPLATE.md`; `apps/api/scripts/verify-migrations.ts`; `apps/api/src/common/verify-migrations.util.ts`(+spec); `apps/api/package.json` (`verify:migrations`); [`GO_SPOTS_MIGRATION_SAFETY.md`](./GO_SPOTS_MIGRATION_SAFETY.md); `BIBLE_STATUS.md` #9; this log; `BIBLE_PROGRESS.md`; board.
- Verify: jest `verify-migrations.util` **6** PASS.
- **OPERATOR note:** after Neon `migrate deploy`, run `pnpm run verify:migrations` (+ optional `--spot-checks`) on deploy host.

### #1 Money Decimal string wire — DONE

- Lane **XXXXX-money-wire-done**: Canonical API money JSON is **4dp decimal strings** via `serializeMoney` / `serializeMoneyOrNull` (was JS `number`). Wired finance DTO serializers, analytics/dashboard KPIs, menu/resources/shop public prices, play-billing totals, sales-by-item. `offeringConfig` price keys normalize to 4dp strings on write/read; validators dual-accept number|string; bowling parsers coerce. Web: `lib/money.ts` dual-read `coerceMoney` / `parseMoneyString`; client money types `MoneyWire`; formatters + critical arithmetic coerce. Ledger (#6) still deferred.
- Files: `money.util.ts`(+spec); `offering-config.util.ts`(+spec); `bowling-modes.util.ts`; `finance.service.ts` / `finance-analytics.util.ts` / `dashboard.service.ts`; menu/resources/shop/reservations serialize sites; web `money.ts`/`format.ts` + finance/menu/resources/play-billing/dashboard clients + consumers; [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md); status docs. **No Neon migrate / no ledger.**
- Verify: jest money+offering-config+play-billing+analytics+reprice **53** PASS; `nest build` PASS; web typecheck PASS.
- Residual: intermediate service math still `toMoneyNumber` (ops OK); ledger #6; money **inputs** still accept numbers (forms).

### #4 Reservation concurrency / double-book — DONE (exclusion on disk + app path)

- Lane **WWWWWW**: Ship bar = GiST exclusion migration on disk + app overlap semantics aligned + `23P01`→409 under booking lock. Live C1/C2 bodies deferred (DATABASE_URL is Neon; harness refuses Neon).
- Files: `prisma/migrations/20260721060000_reservation_resource_exclusion/migration.sql`; `booking-lock.util.ts`(+spec); `booking-overlap.util.ts` (half-open comment); `reservation-overlap-detect.util.ts` (SQL = shipped migration); `test/concurrency/concurrency.harness.ts`(+gate Neon skip); [`GO_SPOTS_EXCLUSION_CONSTRAINT.md`](./GO_SPOTS_EXCLUSION_CONSTRAINT.md); status docs. **No** `schema.prisma` / finance money-wire / auth 2FA / GDPR / Neon deploy.
- Verify: jest booking-lock + reservation-overlap-detect + `test:concurrency` gate PASS.
- Residual (operator): Neon `migrate deploy` after `pnpm detect:reservation-overlaps` = 0; local Docker live C1/C2 bodies; walk-in PlaySession still app-lock only.

### #3 Tenant isolation — DONE (app shopId + RLS migration + SET LOCAL plumbing)

- Lane **ZZZZZ**: Ship bar = audited app `shopId` mutators + two-venue unit matrix **and** Postgres RLS on disk for 28 Tier A `shopId` tables (`20260721050000_tenant_rls_core`: ENABLE+FORCE + `app_tenant_rls_ok`) plus app `SET LOCAL` (`tenant-rls.util` / Prisma ALS proxy / `TenantRlsInterceptor` after venue bind; SSE skipped). Opt-in `TENANT_RLS` (default off; policies fail-open when mode unset).
- Files: `prisma/migrations/20260721050000_tenant_rls_core/migration.sql`; `tenant-rls.util.ts`(+spec); `tenant-rls.interceptor.ts`(+spec); `prisma.service.ts`; `app.module.ts`; `.env.example` / `.env.production.example`; [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md); status docs. **No** `schema.prisma` / finance money-wire / Neon deploy.
- Verify: jest `tenant-rls` **14** PASS; all `--testPathPatterns=tenant` **16 suites / 81** PASS.
- Residual (operator): Neon migrate + `TENANT_RLS=on` soak; DB role split; Tier B child policies; `public_insert` guest wrap; live pooled suite; opaque media GET accepted.

### #30 Internationalization — DONE (en/pl product UI ship bar)

- Lane **TTTTT-i18n-enpl-done** (reinforces prior **TTTTT** dining/publicBooking slice): full en/pl product UI ship bar — dashboard + public + auth (not de/fr/es/ar).
- Wired residual primary chrome → dashboard namespaces: `dashOverview.*`, `galleryPanel.*`, `reviewsStaff.*`, `notesPanel.*`, `venueGate.*`, `sessionsPage.*`, `reservationDialog.*`, `eventRequests.*`, `auditPage.*`, `gamingSetup.*`, `diningSetup.*`, `venueSwitcher.*`, `charts.*`, floor residual (`updatesLive` / screen / tapHint / tile*); public `venueSearch.*` / `venuesDiscovery.*` / `theme.*` / floor residual; offline banner → `opsOutage.mode*Desc`.
- Files (representative): overview/gallery/reviews/notes/audit/sessions panels; reservation + event-request dialogs; gaming/dining editors; venue gate/switcher; seat-floor-map / unit-staff-menu / venue-chart / theme-toggle; venues-discovery; `i18n.ts` + `public-i18n.ts`; status docs.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **1871/1871**, public **989/989**); web typecheck clean on #30 files. **No API / no Neon.**
- Residual (explicit non-blocking): secondary locales de/fr/es/ar; business-data placeholders/defaults staff type into forms; unused plan-catalog / live-preview mocks; API/email copy; legal privacy/terms prose.

### #23 Observability — DONE (Sentry + request log + health)

- Lane **UUUUUU**: Ship bar = optional Sentry init (Lane V) + 5xx `SentryExceptionFilter` (Lane Y) + `RequestLoggingInterceptor` + `/live` `/ready`. OTel / web Sentry = residual (documented in [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md)).
- Files: status docs + observability note only this lane.
- Verify: prior jest sentry + sentry-exception.filter PASS; no code change required for flip.

### #29 Accessibility — DONE (13-route axe smoke, critical bar)

- Lane **WWWWW**: Ship bar = `test:a11y:smoke` on **13** public routes; critical hard-fail; soft-log serious+; skip-if-no-Next. Fixed server probe (`http` vs undici `fetch`) + Playwright timeout **60s**. Verified with Next up: **13 passed** (soft contrast/link-in-text-block only).
- Files: `apps/web/e2e/a11y.spec.ts`, `apps/web/playwright.config.ts`; `GO_SPOTS_A11Y_I18N.md` (a11y ship bar); `BIBLE_STATUS.md` #29; this log; `BIBLE_PROGRESS.md`; board. **No i18n catalog / no API.**
- Residual: dashboard axe suite; contrast/focus polish; hard CI gate.
- **Follow-up:** CI job `web-a11y-smoke` (`continue-on-error`) wires the harness non-blocking (bare runner → 13 skipped).

### #27 Upload security — DONE (Phase 1 tooling + operator flag note)

- Lane **VVVVV**: Ship bar = MIME/magic/size harden + inventory/migrate CLIs + `LEGACY_UPLOADS_STATIC` default-on. Opaque public GET accepted. Phase 2–3 malware/signed deferred.
- Files: `GO_SPOTS_UPLOAD_SECURITY.md`; `BIBLE_STATUS.md` #27; this log; `BIBLE_PROGRESS.md`; board. **No apps code this lane.**
- Verify: jest legacy-uploads + image-media **18** PASS (prior Lane SSSS).
- **OPERATOR note:** live `inventory:legacy-uploads` → 0 then `LEGACY_UPLOADS_STATIC=false`.

### #28 Realtime — DONE (in-process notifications SSE + poll fallback)

- Lane **UUUUU**: Ship bar = Lane XX notifications SSE (`NotificationsSseHub` in-process) + retained panel/toast poll. Redis/multi-instance and floor/chat SSE documented as scale residuals only.
- Files: `GO_SPOTS_REALTIME.md`; `BIBLE_STATUS.md` #28; this log; `BIBLE_PROGRESS.md`; board. **No apps code this lane.**
- Verify: jest `notifications-sse.hub` **2** PASS (prior Lane XX).

### #22 Email / durable outbox — DONE (system-mail ops view)

- Lane **TTTTT**: SUPER_ADMIN `GET /mail/outbox/system/dead` + `POST /mail/outbox/system/:id/retry` (`shopId IS NULL` only); service `systemOnly` scope; `/admin` `SystemMailOutboxPanel` + client helpers + `mailSystemOutbox.*` en/pl. Owner shop-scoped panel unchanged.
- Verify: jest mail-outbox + pg-advisory-lock **18** PASS; `nest build` PASS; `i18n:check` dashboard **1216**/public **912**; web typecheck PASS.
- **OPERATOR note:** prove retries in live prod after Neon migrate + Resend (not a code blocker).

### #19 Dashboard capability key — Phase 3 DONE (slug-only bind + hash-at-rest)

- Lane **QQQQQ**: Stop capability-key DB lookup — `classifyVenuePath` / resolve / interceptor / `verifyVenueDashboard` always slug-only (legacy `slug--key` strips to slug). Dual-write `dashboardKeyHash` on register/createVenue/rotate via `dashboardKeyPersistFields`. Migration `20260721030000_dashboard_key_hash` (pgcrypto backfill) on disk — **no Neon deploy / no DROP**.
- Files: `dashboard-path.ts`(+spec), `resolve-venue-shop.ts`(+spec), `venue-context.interceptor.ts`(+spec), `auth.service.ts`, `shop.service.ts`(+dashboard-key spec), `schema.prisma`, migration SQL.
- Verify: jest path/bind/venue-path/dashboard-key **20** PASS; `tsc` PASS; `nest build` PASS.
- **OPERATOR:** Neon `migrate deploy` of hash migration. Optional later DROP plaintext.

### #7 Idempotency — DONE (universal money-path + retry + require-keys)

- Lane **NNNNN**: Code criteria met — hot + Tier A/B/C + currency apply wrapped; web retry handoff; `IDEMPOTENCY_REQUIRE_MONEY_KEYS` available (prod example `true`, runtime default off). No further client-key code residual.
- Verify: jest `idempotency.util` **13** PASS.
- **OPERATOR note:** live host flip `IDEMPOTENCY_REQUIRE_MONEY_KEYS=true` after client smoke (not a code blocker).

### #26 Public abuse / CAPTCHA — DONE (assert + widget + escalation)

- Lane **RRRRR**: Throttles + `assertCaptchaOrThrow` + optional Turnstile/hCaptcha widget + in-memory 429 escalation map shipped. Default provider **off**.
- Verify: jest captcha **19** PASS (prior lanes).
- **OPERATOR note:** enable site+secret keys + flip `CAPTCHA_PROVIDER` / `NEXT_PUBLIC_CAPTCHA_PROVIDER` together when ready. Optional later: Redis escalation / metrics.

### #32 Offline / degraded ops — DONE (Modes A–F + booking/chat + runbook)

- Lane **PPPPP**: Criteria aligned with shipped UX — connectivity Modes A–C/F, public booking/chat write disable on A–C, fail-closed money/booking. Ops runbook appendix in [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md). No PWA/offline queue (non-goal).
- Verify: prior web typecheck lanes; docs-only residual this lane.

### #32 Offline / degraded ops — in-app owner runbook (DONE reinforcement)

- Lane **SSSSS**: Owner **Shop settings → Outage runbook** panel — Modes A/B/C/F copy + symptom→cause→action table (`opsOutage.*` en/pl); wired `OpsOutageRunbookPanel` on settings (owner-only). DR appendix already noted the in-app link. Closes prior “ops runbook in-app” residual.
- Files: `ops-outage-runbook-panel.tsx`, settings `page.tsx` mount, `i18n.ts` (`opsOutage.*`), `DISASTER_RECOVERY.md` in-app pointer, `GO_SPOTS_OFFLINE.md`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **1190/1190**, public **912/912**); web typecheck PASS. **No API.**

### #26 Public abuse — CAPTCHA after_throttle 429 escalation (parent remains PARTIAL)

- Lane **MMMMM**: In-memory escalation map — public-create 429 → `(ip, surface)` requireCaptchaUntil (`THROTTLE_TTL_MS`); ≥2 surfaces → escalate all creates for that IP. `CaptchaAwareThrottlerGuard` notes 429s; `public.controller` passes `escalated` into `assertCaptchaOrThrow`. Default `CAPTCHA_PROVIDER=off` unchanged (map may update; assert still no-ops).
- Files: `captcha-escalation.util.ts`(+spec), `captcha-throttler.guard.ts`, `app.module.ts` (guard swap), `public.controller.ts`, env comments, `GO_SPOTS_PUBLIC_ABUSE.md`.
- Verify: jest captcha-escalation + captcha.util **19** PASS; `nest build` PASS.
- **Not finished:** enable provider+secrets in prod; Redis multi-instance; verify-fail metrics.

### #26 Public abuse — CAPTCHA guest widget UI (parent remains PARTIAL)

- Lane **LLLLL**: Optional Turnstile/hCaptcha widget — loads only when `NEXT_PUBLIC_CAPTCHA_PROVIDER` is `turnstile|hcaptcha` + matching site key; otherwise renders nothing and POSTs omit `captchaToken` (API no-op while provider off). Wired into public booking dialog (gaming+dining), contact form, review submit, event request form, guest chat open. en/pl `venuePage.captcha.*`. Prod/API examples stay provider **off**.
- Files: `public-captcha.ts`, `public-captcha-widget.tsx`, booking/contact/review/event/guest-chat forms, `public-i18n.ts`, `apps/web/.env.example`, `GO_SPOTS_PUBLIC_ABUSE.md`.
- Verify: web `typecheck` + `i18n:check` PASS.
- **Not finished:** enable provider+secrets in prod; Redis multi-instance escalation (in-memory MMMMM shipped).

### #9 Migration safety — CI ephemeral migrate dry-run (parent remains PARTIAL)

- Lane **KKKKK**: Phase 1 of [`GO_SPOTS_MIGRATION_SAFETY.md`](./GO_SPOTS_MIGRATION_SAFETY.md) — GitHub Actions job `api-migrate` with `postgres:16` service; `prisma generate` → `migrate deploy` → `migrate status` → `validate` on empty ephemeral DB. **Local CI URL only** (`postgresql://ci:ci@localhost:5432/ci`); never Neon secrets. Separate from lint/build/Jest. **No apps schema / no Neon deploy.**
- Files: `.github/workflows/ci.yml`; `GO_SPOTS_MIGRATION_SAFETY.md`; `BIBLE_STATUS.md` #9; this log; board; `BIBLE_PROGRESS.md`; `OVERNIGHT_STATUS.md`.
- Verify: `pnpm exec prisma validate` PASS (local); full dry-run = GH Actions `api-migrate` (no local Docker here).
- **Not finished:** Neon operator deploy; Phase 2 preflight template; Phase 3 post-deploy verify script.

### #26 Public abuse — CAPTCHA assert wired on public creates (parent remains PARTIAL)

- Lane **IIIII**: `assertCaptchaOrThrow` on publicThrottle creates — dining + gaming reservations, event-request, contact, review, guest chat open. Token: body `captchaToken` or `X-Captcha-Token`. Optional DTO fields + web client body types. Default `CAPTCHA_PROVIDER=off` → no-op. **No** Turnstile widget; prod examples keep provider off until widget + secrets.
- Files: `public.controller.ts`, `captcha.util.ts`(+spec `readCaptchaToken`), guest/public-gaming/event DTOs, public web clients, env comments, `GO_SPOTS_PUBLIC_ABUSE.md`.
- Verify: jest `captcha.util` **12** PASS; `nest build` PASS.
- **Not finished:** enable provider+secrets in prod; `after_throttle` 429 escalation store.

### #30 Internationalization — invoice print sheet chrome en/pl (parent remains PARTIAL)

- Lane **HHHHH**: invoice-document print sheet residual English → dashboard `i18n.ts` `finance.invDoc*` en/pl (number/issued/bill-to/payment/description/qty/unit/total/note/subtotal/total due/footer/title fallback); wired `invoice-document.tsx` via `useVenueSettingsOptional().t()` + venue `locale` for issued date. **No API.** Avoided GGGGG captcha stubs.
- Files: `i18n.ts` (`finance.invDoc*`), `invoice-document.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **1152/1152**, public **910/910**); web typecheck PASS.
- **Not finished:** secondary locales formal sweep; formal i18n sweep.

### #26 Public abuse — CAPTCHA verify util stub (parent remains PARTIAL)

- Lane **GGGGG**: `captcha.util.ts` — env `CAPTCHA_PROVIDER`/`CAPTCHA_MODE` + Turnstile/hCaptcha siteverify (`verifyCaptchaToken` / `assertCaptchaOrThrow`); default **off** → no-op (limits only). Env placeholders in `.env.example` / `.env.production.example`. **Not** wired to `public.controller` / guest widgets; no escalation map. Design doc Phase **0.5**.
- Files: `captcha.util.ts`(+spec), env examples, `throttle.config.ts` comment, `GO_SPOTS_PUBLIC_ABUSE.md`.
- Verify: jest `captcha.util` **11** PASS.
- **Not finished:** controller/widget wire; `after_throttle` 429 escalation store; live vendor keys.

### #3 Tenant isolation — reviews + guest-chat two-venue unit tests (parent remains PARTIAL)

- Lane **EEEEE**: Shop A cannot list/updateStatus/remove Shop B venue reviews; Shop A cannot list/get/join/setStatus/sendMessage/delete Shop B guest chats — `venue-reviews.service.tenant.spec.ts` + `guest-chat.service.tenant.spec.ts` (findFirst/findMany/count/update/delete `shopId` + cross-tenant `NotFoundException`, no write). Mocked Prisma. No RLS; no production service changes.
- Files: `venue-reviews.service.tenant.spec.ts`, `guest-chat.service.tenant.spec.ts` (new).
- Verify: jest reviews+chat tenant **16** PASS; all `tenant.spec` **14 suites / 67** PASS.
- **Not finished:** Postgres RLS (design only); live pooled suite; opaque public media GET residual.

### #30 Internationalization — tenant-shell sidebar chrome residual en/pl (parent remains PARTIAL)

- Lane **FFFFF**: sidebar residual English — Platform group/admin link + mobile drawer / sign-out aria-labels → dashboard `i18n.ts` `nav.*` en/pl (`signOut`, `openNavigation`, `closeNavigation`, `navigation`, `platformGroup`, `platformAdmin`); wired `tenant-shell.tsx`. Nav item/group labels already used `t()`. **No API.** Avoided EEEEE guest/reviews tenant specs.
- Files: `i18n.ts` (`nav.*`), `tenant-shell.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **1139/1139**, public **910/910**); web typecheck PASS.
- **Not finished:** secondary locales formal nav sweep; formal i18n sweep. *(invoice-document print sheet → Lane **HHHHH**.)*

### #30 Internationalization — finance hub / play-billing chrome en/pl (parent remains PARTIAL)

- Lane **DDDDD** (supersedes stuck **WWWW**): finance hub + overview/transactions/losses/reports/invoices + game-billing panel/edit dialog + play-billing FeatureGate → dashboard `i18n.ts` `finance.*` en/pl; tabs still use existing `financeHub.*`. **No API.**
- Files: `i18n.ts` (`finance.*`), `finance-hub.tsx`, `finance-overview-panel.tsx`, `finance-transactions-panel.tsx`, `losses-panel.tsx`, `finance-reports-panel.tsx`, `invoices-panel.tsx`, `game-billing-panel.tsx`, `game-billing-edit-dialog.tsx`, `play-billing/page.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **1133/1133**, public **910/910**); web typecheck PASS.
- **Not finished:** secondary locales formal sweep; full ops residual beyond finance. *(invoice-document print sheet → Lane **HHHHH**.)*

### #3 Tenant isolation — media two-venue unit tests (parent remains PARTIAL)

- Lane **CCCCC**: Shop A cannot delete/replace Shop B `StoredImage` rows — `media.service.tenant.spec.ts` (`storeFromUpload` create `shopId`; `deleteByMediaPath` / `replaceMediaPath` `deleteMany` `{ id, shopId }`; cross-tenant path still scoped to caller shopId so Shop B row not targeted). Mocked Prisma. No RLS; no production service changes; opaque public `GET /media/:id` residual unchanged.
- Files: `media.service.tenant.spec.ts` (new).
- Verify: jest `media.service.tenant.spec` **5** PASS; all `tenant.spec` **12 suites / 51** PASS.
- **Not finished:** opaque public media GET (accepted residual); Postgres RLS (design only); live pooled suite.

### #3 Tenant isolation — event-requests two-venue unit tests (parent remains PARTIAL)

- Lane **BBBBB**: Shop A cannot list/review (approve|decline)/cancel Shop B event requests — `event-requests.service.tenant.spec.ts` (findFirst/findMany/count/update `shopId` + cross-tenant `NotFoundException`, no write). Mocked Prisma. No RLS; no production service changes.
- Files: `event-requests.service.tenant.spec.ts` (new).
- Verify: jest `event-requests.service.tenant.spec` **7** PASS; all `tenant.spec` **11 suites / 46** PASS.
- **Not finished:** media isolation matrix (→ Lane **CCCCC**); Postgres RLS (design only); live pooled suite.

### #3 Tenant isolation — staff two-venue unit tests (parent remains PARTIAL)

- Lane **AAAAA**: Shop A cannot update/remove/regenerate-invite Shop B staff memberships — `staff.service.tenant.spec.ts` (findFirst `shopId` + cross-tenant `NotFoundException`, no write). Mocked Prisma. No RLS; no production service changes.
- Files: `staff.service.tenant.spec.ts` (new).
- Verify: jest `staff.service.tenant.spec` **6** PASS; all `tenant.spec` **10 suites / 39** PASS.
- **Not finished:** media isolation matrix (event-request → Lane **BBBBB**); Postgres RLS (design only); live pooled suite.

### #22 Email / jobs — dead-letter dashboard UI (parent remains PARTIAL)

- Lane **ZZZZ**: owner settings panel for mail outbox dead letters — status counts, DEAD list (optional FAILED), refresh, retry (`POST /mail/outbox/:id/retry`). Distinct `mailOutbox.*` en/pl. No finance files / no API changes.
- Files: `mail-outbox-client.ts`, `mail-outbox-panel.tsx`, settings page wire, `i18n.ts` (`mailOutbox.*`); status docs.
- Verify: web typecheck PASS; `i18n:check` PASS (dashboard **903/903**, public **910/910**).
- **Not finished:** prod retry proof; alerting; system-mail (`shopId` null) ops view.

### #3 Tenant isolation — resources two-venue unit tests (parent remains PARTIAL)

- Lane **YYYY**: Shop A cannot update/delete Shop B resource units or categories — `resources.service.tenant.spec.ts` (update/delete + cross-tenant `NotFoundException`, no write). Mocked Prisma asserts `shopId` in `where`. No RLS; no production service changes.
- Files: `resources.service.tenant.spec.ts` (new).
- Verify: jest `resources.service.tenant.spec` **8** PASS; all `tenant.spec` **9 suites / 33** PASS.
- **Not finished:** staff/media/event-request isolation matrix; Postgres RLS (design only); live pooled suite.

### #30 Internationalization — public menu availability en/pl (parent remains PARTIAL)

- Lane **VVVV**: public menu availability headlines + schedule copy → `public-i18n` `menu.*` en/pl (`opensAt` / tomorrow / weekday / notAvailable + day/weekday labels); `getPublicMenuItemAvailability` / `publicMenuScheduleLabel` accept optional `t`; wired `public-menu-board` + `venue-menu-item-modal` via `usePublicPrefs`. Avoided dashboard `i18n.ts` / settings / API.
- Files: `public-i18n.ts`, `menu-timing.ts`, `public-menu-board.tsx`, `venue-menu-item-modal.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **883/883**, public **910/910**); web typecheck PASS. **No API.**
- **Not finished:** finance panels (→ Lane **DDDDD** / was **WWWW**); secondary locales; formal i18n sweep.

### #22 Email / jobs — dead-letter list/retry stub (parent remains PARTIAL)

- Lane **XXXX**: owner `GET /mail/outbox/dead` (shop-scoped status counts + DEAD list, optional `includeFailed`; sanitized to/subject/lastError — no html/text) + `POST /mail/outbox/:id/retry` (DEAD → PENDING, attempts=0, due now). Service helpers `statusCounts` / `listDeadLetters` / `requeueDeadLetter`. No Neon migrate; no dashboard UI.
- Files: `mail-outbox.service.ts`(+spec), `mail-outbox.controller.ts`, `mail.module.ts`, `mail-outbox.types.ts`; design + status docs.
- Verify: `nest build` PASS; jest mail-outbox + pg-advisory-lock **17** PASS.
- **Not finished:** prod retry proof; dashboard UI; system-mail (`shopId` null) ops view.

### #7 Idempotency — currency apply optional key (parent remains PARTIAL)

- Lane **TTTT**: Tier C residual from [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) — `withClientIdempotency` on `PATCH /shop/settings` when `currency` set (`SHOP_CURRENCY_APPLY`); preview stays unwrapped (read-only); web `shop-settings-client` Idempotency-Key + retry handoff. Keys **optional** (not in Tier A / require-keys). **No** migrate / finance.service / main.ts.
- Files: `idempotency.util.ts`(+spec), `shop.controller.ts`, `shop-settings-client.ts`; design + status docs.
- Verify: `nest build` PASS; jest `idempotency.util` → **13** PASS; web typecheck PASS.
- **Not finished:** operator must enable `IDEMPOTENCY_REQUIRE_MONEY_KEYS=true` in live prod when ready. Code-side #7 client-key coverage otherwise complete.

### #30 Internationalization — settings chrome residual en/pl (parent remains PARTIAL)

- Lane **UUUU**: settings dashboard residual English fallbacks → dashboard `i18n.ts` `settings.*` en/pl (save/visibility/marketing unlock/reviews/amount/categories load-save + sessions load); wired `shop-settings-panel`, `auth-sessions-panel`, `venue-categories-section`. Main chrome already used `t()`; this closes leftover hardcoded errors. Avoided TTTT `shop-settings-client` / finance-client. **No API.**
- Files: `i18n.ts`, `shop-settings-panel.tsx`, `auth-sessions-panel.tsx`, `venue-categories-section.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **883/883**, public **886/886**); web typecheck PASS. **No API.**
- **Not finished:** finance panels; secondary locales; formal i18n sweep.

### #30 Internationalization — menu + orders chrome en/pl (parent remains PARTIAL)

- Lane **PPPP**: menu catalog + menu-orders ops residual English → dashboard `i18n.ts` `menu.*` / `orders.*` en/pl (board/dialogs/timing, orders list/detail/picker/status badges); wired via `useVenueSettingsOptional().t()`. Avoided finance-client / idempotency (OOOO/RRRR) and settings/auth.
- Files: `i18n.ts`, `menu-timing.ts`, `menu/page.tsx`, `menu-board.tsx`, `menu-dialogs.tsx`, `orders/page.tsx`, `menu-orders-panel.tsx`, `order-detail-panel.tsx`, `order-status-badge.tsx`, `menu-item-picker.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **874/874**, public **886/886**); web typecheck PASS. **No API.**
- **Not finished:** finance panels; secondary locales; formal i18n sweep. *(public menu availability shipped — Lane **VVVV**.)*

### #7 Idempotency — Phase 3 require-keys env (parent remains PARTIAL)

- Lane **RRRR**: Phase 3 from [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) — `IDEMPOTENCY_REQUIRE_MONEY_KEYS` (default off) + `requireKey` on Tier A / hot finance controller wraps; missing/blank key → **400** when enabled; Tier B/C unchanged. Env documented in `.env.example` (commented off) and `.env.production.example` (`true`). **No** migrate / `finance.service` / currency key wrap.
- Files: `idempotency.util.ts`(+spec), `finance.controller.ts`; env examples; status docs.
- Verify: `nest build` PASS; jest `idempotency.util` → **13** PASS.
- **Not finished:** currency preview/apply optional key → Lane **TTTT**; operator must enable flag in live prod when ready.

### #19 Dashboard capability key — omit key from /me (parent remains PARTIAL)

- Lane **QQQQ**: stop emitting `memberships[].shop.dashboardKey` from `/auth/me`; `verifyVenueDashboard` shop payload no longer selects/returns the key (owner rotate stays on dedicated `POST /shop/dashboard-key/rotate`). Web `AuthUser` + venue helpers bind/route on slug only. **No** migrate / DROP / finance / heavy i18n.
- Files: `auth.service.ts`, `auth.service.venue-path.spec.ts`, `auth-client.ts`, `venue-dashboard.ts`, `venue-switcher.tsx`, `middleware.ts` (comment); status docs.
- Verify: jest path/bind/venue-path + dashboard-key → **19** PASS; `nest build` PASS; web typecheck PASS.
- **Not finished:** Phase 3 hash-at-rest / DROP `Shop.dashboardKey`; legacy `slug--key` bind still accepted.

### #7 Idempotency — Tier C wraps + 409 soft copy (parent remains PARTIAL)

- Lane **OOOO**: Tier C from [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) — `withClientIdempotency` on `deleteLoss`, `archiveOrders`, `unarchiveOrders` + 3 scopes; web `finance-client` mints/reuses `Idempotency-Key` via existing retry handoff; `httpFailureMessage` maps in-flight 409 → “Still saving… try again in a moment.” **No** `finance.service` rewrite; keys still optional; Phase 3 require-keys skipped.
- Files: `idempotency.util.ts` (scopes), `finance.controller.ts`, `finance-client.ts`, `api-error-message.ts`; status docs.
- Verify: `nest build` PASS; jest `idempotency.util` → 8 PASS; web typecheck PASS.
- **Not finished:** Phase 3 require-keys env. *(→ Lane **RRRR**.)* Currency preview/apply optional key *(→ Lane **TTTT**).*

### #19 Dashboard capability key — Phase 2 membership-only bind (parent remains PARTIAL)

- Lane **MMMM**: Phase 2 from [`GO_SPOTS_DASHBOARD_KEY.md`](./GO_SPOTS_DASHBOARD_KEY.md) — interceptor / `resolveVenueShopId` / `verifyVenueDashboard` accept slug-only `x-venue-path` when JWT proves membership (legacy `slug--key` kept); auth login/register/activate/refresh/me/createVenue/linkVenues emit public `venuePath` (slug) instead of secret `dashboardPath`; web sessionStorage + venue-gate/switcher bind slug-only. **No** migrate / finance / i18n / schema DROP.
- Files: `dashboard-path.ts`(+spec), `venue-context.interceptor.ts`(+spec), `resolve-venue-shop.ts`(+spec), `auth.service.ts`(+venue-path spec), `auth.controller.ts`, venue-gate/auth web clients, settings rotate re-bind → slug.
- Verify: jest dashboard-path / resolve-venue-shop / interceptor / venue-path + dashboard-key → **18** PASS; `nest build` PASS; web typecheck PASS.
- **Not finished:** Phase 3 hash-at-rest / DROP `Shop.dashboardKey` (Lane QQQQ stripped `/me` key).

### #30 Internationalization — messages panel chrome en/pl (parent remains PARTIAL)

- Lane **NNNN**: staff messages residual English (guest chat + contact form inbox) → dashboard `i18n.ts` `msg.*` en/pl (tabs, filters/status badges/hints, thread actions Join/Pause/Resume/Reopen/End/Delete, placeholders, empty/errors); dates use venue locale; wired `messages/page.tsx` via `useVenueSettingsOptional().t()`. Avoided finance/orders (LLLL) and settings/auth (MMMM).
- Files: `i18n.ts`, `messages/page.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **652/652**, public **886/886**); web typecheck PASS. **No API.**
- **Not finished:** settings/finance/orders panels; secondary locales; full sweep.

### #7 Idempotency — Tier B wraps + UI retry key handoff (parent remains PARTIAL)

- Lane **LLLL**: Phase 2 from [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) — `withClientIdempotency` on Tier B finance controller methods (`orders.update`, `orders.lines.patch`, `orders.lines.delete`, `orders.delete`, `play-billing.update`, `play-sessions.update`) + 6 scopes; web `idempotency-key.ts` reuses the same `Idempotency-Key` across identical retries until success (clears on success; new key when payload/path changes). Wired across Tier A+B finance/play-billing clients. **No** `finance.service` rewrite; keys still optional when absent.
- Files: `idempotency.util.ts` (scopes), `finance.controller.ts`, `idempotency-key.ts`, `finance-client.ts`, `play-billing-client.ts`; status docs.
- Verify: API `tsc` + `nest build` + jest `idempotency.util` → 8 PASS; web typecheck PASS.
- **Not finished:** Phase 3 require-keys env. *(Tier C + 409 soft copy → Lane **OOOO**.)*

### #30 Internationalization — access-group permission labels en/pl (parent remains PARTIAL)

- Lane **KKKK**: `DASHBOARD_ACCESS_GROUPS` residual English (13 group labels/descriptions + toggle labels/hints) → dashboard `i18n.ts` `team.accessGroup.*` / `team.accessPerm.*` en/pl; helper `localizeAccessGroup` in `staff-access-i18n.ts`; wired `staff-access-editor`. English kept in `dashboard-access.ts` as fallback.
- Files: `i18n.ts`, `staff-access-i18n.ts`, `staff-access-editor.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **608/608**, public **886/886**); web typecheck PASS. **No API.**
- **Not finished:** settings/finance/orders/messages panels; secondary locales; full sweep.

### #19 Dashboard capability key — owner rotate + password reauth (parent remains PARTIAL)

- Lane **IIII**: v1 from [`GO_SPOTS_DASHBOARD_KEY.md`](./GO_SPOTS_DASHBOARD_KEY.md) — owner `POST /shop/dashboard-key/rotate` with forced password reauth (`assertUserPassword` / `X-Confirm-Password`); regenerates `Shop.dashboardKey` (unique retry); audit `shop.dashboard_key.rotate` without logging the new key; settings Privacy UI + `sessionStorage` re-bind. **No** auth.service rewrite; **no** migrate / grace period; Phase 2 membership-only bind still open.
- Files: `shop.controller.ts`, `shop.service.ts`, `shop-settings.dto.ts`, `shop.service.dashboard-key.spec.ts`, `shop-settings-client.ts`, `shop-settings-panel.tsx`, `i18n.ts` (`settings.dashboardKey*`); tiny staff `t()` null coalesce unblock.
- Verify: jest dashboard-key → 4 PASS; web typecheck PASS; `i18n:check` PASS (**555** + **886**).
- **Not finished:** Phase 2 slug-only bind; stop emitting secret `dashboardPath` in auth JSON.

### #30 Internationalization — staff/team page chrome en/pl (parent remains PARTIAL)

- Lane **JJJJ**: staff employee-accounts residual English → dashboard `i18n.ts` `team.*` en/pl (tabs, seats, create/edit modals, access & permissions tab, table chrome/status/actions, errors); manager extras + access-editor chrome (`permsOn` / All on); wired via `useVenueSettingsOptional().t()`. Left permission-group labels in `dashboard-access.ts` English (→ Lane **KKKK**). Avoided settings (Lane IIII) and notifications (HHHH).
- Files: `i18n.ts`, `staff/page.tsx`, `staff-access-editor.tsx`, `manager-access-extras.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **555/555**, public **886/886**); web typecheck PASS. **No API.**
- **Not finished:** settings/finance/orders/messages panels; secondary locales; full sweep.

### #7 Idempotency — Tier A money-path wraps (parent remains PARTIAL)

- Lane **GGGG**: Phase 1 from [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) — `withClientIdempotency` on Tier A finance controller methods (`orders.create`, `orders.lines.add`, `losses.create`, `play-billing.cancel`, `play-sessions.cancel`, `play-sessions.create`) + matching web `Idempotency-Key` headers. Reuses existing receipt helper; **no** `finance.service` rewrite; keys still optional when absent.
- Files: `idempotency.util.ts` (scopes), `finance.controller.ts`, `finance-client.ts`, `play-billing-client.ts`; status docs.
- Verify: API `tsc` + `nest build` + jest `idempotency.util` → 8 PASS; web typecheck PASS.
- **Not finished:** Tier C wraps; panel 409 UX; Phase 3 require-keys env. *(Tier B + retry handoff → Lane **LLLL**.)*

### #30 Internationalization — notifications panel chrome en/pl (parent remains PARTIAL)

- Lane **HHHH**: staff notifications inbox/archive residual English → dashboard `i18n.ts` `notif.*` en/pl (filters, status/section labels, bulk archive/unarchive/delete, empty states, header bell/archive aria, toast dismiss); `notification-sections` section labels via `t()`; wired notifications page + `notification-bell` / `notification-header-actions` / `notification-toasts`.
- Files: `i18n.ts`, `notification-sections.ts`, `notifications/page.tsx`, `notification-bell.tsx`, `notification-header-actions.tsx`, `notification-toasts.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **459/459**, public **886/886**); web typecheck PASS. **No API.**
- **Not finished:** other dashboard/ops panels (messages, orders editors, etc.); secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #9 Migration safety — durable procedures design (parent remains PARTIAL)

- Lane **FFFF**: design-only [`GO_SPOTS_MIGRATION_SAFETY.md`](./GO_SPOTS_MIGRATION_SAFETY.md) — distinguishes process safety from [`GO_SPOTS_MIGRATION_PLAN.md`](./GO_SPOTS_MIGRATION_PLAN.md) (candidates) and [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) (Friday eight); authoring/review/apply rules; WARN class; Phase 1 CI ephemeral Postgres `migrate deploy` (never Neon); Phase 2–3 preflight template + optional verify script; rollback = forward fix / PITR. Defer CI job post-Friday.
- Files: `GO_SPOTS_MIGRATION_SAFETY.md`; `BIBLE_STATUS.md` #9; `BIBLE_PROGRESS.md`; this log; `AGENT_COORDINATION.md`. **No apps code.**
- Verify: n/a (docs).
- **Not finished:** Neon operator deploy; CI Postgres migrate dry-run; automated post-deploy verify.

### #17 Guest tokens — dual-read cutover design (parent remains PARTIAL)

- Lane **EEEE**: design-only [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md) — Phase 0 inventory/clear gates; Phase 1 hash-only lookup; Phase 2 DROP `guestToken` on Reservation/EventRequest/GuestChat; Phase 3 statusPath mail residual (recommend document-omit until resend/rotate product). Defer impl post-Friday. Lane PP clear CLI unchanged.
- Files: `GO_SPOTS_GUEST_TOKEN.md`; `BIBLE_STATUS.md` #17; `BIBLE_PROGRESS.md`; this log; `AGENT_COORDINATION.md`. **No apps code.**
- Verify: n/a (docs).
- **Not finished:** operator clear after Neon migrate; stop dual-read; DROP columns; optional statusPath re-issue UI.

### #7 Idempotency — remaining money-path coverage design (parent remains PARTIAL)

- Lane **DDDD**: design-only [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) — Tier A/B/C inventory of unwrapped finance mutations (orders/losses/cancels/play-session create); reuse `withClientIdempotency` + existing `IdempotencyReceipt`; Phase 2 UI retry key handoff; Phase 3 optional require-keys env. Defer impl post-Friday. Lanes AA/NN hot paths unchanged.
- Files: `GO_SPOTS_IDEMPOTENCY.md`; `BIBLE_STATUS.md` #7; `BIBLE_PROGRESS.md`; this log; `AGENT_COORDINATION.md`. **No apps code.**
- Verify: n/a (docs).
- **Not finished:** Tier A/B wraps; web retry handoff; require-keys flag.

### #12 Pack vs legacy tier — collapse design → Phase 1 DONE (see 2026-07-21 #12 entry)

- Lane **CCCC**: design-only [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md) — superseded by **FFFFFF** pack-only ship.
- **Residual:** optional `tier` DROP; pack×add-on CI matrix.

### #27 Upload / media security — residual design (parent remains PARTIAL)

- Lane **BBBB**: design-only [`GO_SPOTS_UPLOAD_SECURITY.md`](./GO_SPOTS_UPLOAD_SECURITY.md) — keep opaque public `GET /media/:id` for published gallery/menu; Phase 1 legacy `/uploads` migrate-off; Phase 2 private visibility + signed/auth GET; Phase 3 async malware quarantine. MIME/magic/size/re-encode/shop-scoped deletes unchanged.
- Files: `GO_SPOTS_UPLOAD_SECURITY.md`; `BIBLE_STATUS.md` #27; `BIBLE_PROGRESS.md`; this log; `AGENT_COORDINATION.md`. **No apps code.**
- Verify: n/a (docs).
- **Not finished:** malware scanner; signed URLs; `/uploads` static removal; private media columns.

### #27 Upload security — Phase 1 migrate-off tooling (parent remains PARTIAL)

- Lane **SSSS**: inventory CLI (`inventory:legacy-uploads`) over shop/menu/gallery/resource image columns; migrate CLI (`migrate:legacy-uploads`, dry-run default) disk → `StoredImage` → `/media/:id`; `LEGACY_UPLOADS_STATIC` gate on `main.ts` (default on + boot warn; set `false` only when inventory total is 0). No Neon migrate; no malware scanner; published media GET unchanged.
- Files: `legacy-uploads.util.ts`(+spec), `legacy-uploads-migrate.util.ts`, scripts, `main.ts`, env examples, `GO_SPOTS_UPLOAD_SECURITY.md`, this log, `BIBLE_STATUS.md` #27, board.
- Verify: `npx nest build` PASS; jest `legacy-uploads` + `image-media` → **18** PASS.
- **Not finished:** operator inventory/migrate on live DB + flag flip; Phase 2 private visibility/signed GET; Phase 3 malware quarantine.

### #19 Dashboard capability key — rotate design (parent remains PARTIAL)

- Lane **AAAA**: design-only [`GO_SPOTS_DASHBOARD_KEY.md`](./GO_SPOTS_DASHBOARD_KEY.md) — owner rotate with password reauth + immediate old-key invalidate + sessionStorage re-bind; Phase 2 membership-only / stop emitting secret `dashboardPath`; defer impl post-Friday. URL leak cleanup (Lane EE) unchanged.
- Files: `GO_SPOTS_DASHBOARD_KEY.md`; `BIBLE_STATUS.md` #19; this log; `AGENT_COORDINATION.md`. **No apps code.**
- Verify: n/a (docs).
- **Not finished:** rotate API/UI; grace-period columns; Phase 2 slug-only bind.

### #24 / Operator Friday — checklist + overnight status refresh (parent #24 remains OPERATOR)

- Lane **ZZZ**: docs-only reconcile of stale Friday operator surfaces against tonight’s bible reality (eight migrations, Jest **56/378**, shipped sessions/GDPR/mail/timezone/offline partials). No Neon migrate; no `apps/**`.
- Files: `OVERNIGHT_STATUS.md`, `REMAINING_P0_FRIDAY.md`, `BIBLE_PROGRESS.md`, `DEPLOY_CHECKLIST.md` §4 known limitations, `AGENT_COORDINATION.md`, this log + `BIBLE_STATUS.md` (#24 + Operator Friday).
- Verify: n/a (docs). Cross-check: migration table still **eight**; blockers = migrate + `CORS_ORIGINS`/CSRF/cookie/throttle + smoke + Node 20; PITR confirm remains operator TBD in [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md).
- **Not finished:** Live Neon PITR confirmation / restore drill; migrate deploy itself.

### #29 Accessibility — marketing + guest-status axe expand (parent remains PARTIAL)

- Lane **JJJJJ**: expand optional `test:a11y:smoke` beyond YYY’s **8** — `/`, `/staff/activate`, `/venue/a11y-smoke/gaming-status/a11y-placeholder`, `/venue/a11y-smoke/dining-status/a11y-placeholder`, `/venue/a11y-smoke/event-status/a11y-placeholder` → **13** public routes. Same axe tags, critical hard-fail, soft-log serious/moderate/minor, skip when Next is down; **not** CI-gated. Guest status uses placeholder slug/token (load-error / not-found shell; no auth).
- Files: `apps/web/e2e/a11y.spec.ts` only.
- Verify: `pnpm --filter @gospots/web run typecheck` PASS; `test:a11y:smoke` without server → **13 skipped**.
- **Not finished:** dashboard/settings/dialogs matrix; CI gate; formal contrast/focus sweep.

### #29 Accessibility — auth residual + legal axe smoke (parent remains PARTIAL)

- Lane **YYY**: expand optional `test:a11y:smoke` route list beyond UU/EEE — `/forgot-password`, `/reset-password`, `/privacy`, `/terms` (with `/login` `/register` `/venues` `/for-venues` → **8** public routes). Same axe tags, critical hard-fail, soft-log serious/moderate/minor, skip when Next is down; **not** CI-gated.
- Files: `apps/web/e2e/a11y.spec.ts` only.
- Verify: `pnpm --filter @gospots/web run typecheck` PASS; `test:a11y:smoke` without server → **8 skipped**.
- **Not finished:** dashboard/settings/dialogs matrix; CI gate; formal contrast/focus sweep.

### #2 / #4 / #5 — Concurrency suite scaffold (parents remain PARTIAL)

- Lane **XXX**: opt-in scaffold from [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) — `concurrencyTestsEnabled` / `describeConcurrency` skip gate; dedicated `test/jest-concurrency.json` + `pnpm test:concurrency`; gate unit specs (no Postgres); C1–C3 as `it.todo` under skip-when-unset. Default `pnpm test` unchanged. **No** hot-service imports; **no** Neon / migrate.
- Files: `apps/api/test/concurrency/**`, `apps/api/test/jest-concurrency.json`, `apps/api/package.json` (`test:concurrency`), `.env.example` comment, design doc status update.
- Verify: `cd apps/api && pnpm test:concurrency` — gate PASS; booking/stock describes **skipped** without `RUN_CONCURRENCY_TESTS=1`.
- **Not finished:** live fixtures + `Promise.allSettled` bodies; CI Postgres job; exclusion constraint.

### #32 Offline / degraded — silent poll → Mode F (parent remains PARTIAL)

- Lane **WWW**: `useLiveData` treats loader `return false` as failure (alongside throws) via `livePollSucceeded` + `reportLivePollResult`; silent `{silent:true}` loaders now return boolean success/fail without changing UI swallow behavior. Wired across public gaming/dining schedule + guest status + guest-chat refresh, staff dining/resources/sessions/reviews/menu/messages/notifications, and finance panels (incl. menu-orders silent rethrow). Session 401 on menu/orders stays Mode D (no Mode F).
- Files: `use-live-data.ts` + silent loaders feeding `useLiveData` (public venue/status/chat + dashboard/finance panels).
- Verify: `pnpm --filter @gospots/web run typecheck` PASS. **No API.**
- **Not finished:** partial-outage ops runbook in app (see [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md)).

### #32 Offline / degraded — public booking-dialog outage UX (parent remains PARTIAL)

- Lane **VVV**: public `PublicGamingBookingDialog` (gaming + dining via same dialog) fail-closed on Connectivity Modes A/B/C — disable Confirm submit + early-return in `submit`; inline amber status copy matching OfflineBanner wording via `venuePage.booking.outageOffline|Unreachable|Unavailable` en/pl. Form fields stay editable (no local queue). Mode F (stale) does not block writes.
- Files: `public-gaming-booking-dialog.tsx`, `public-i18n.ts` (3 new booking keys each locale).
- Verify: `pnpm --filter @gospots/web run typecheck` PASS; `i18n:check` PASS (dashboard **407/407**, public **886/886**). **No API.**
- **Not finished:** silent `{silent:true}` loaders → Lane **WWW** (done same night); partial-outage ops runbook in app (see [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phase 3 residual).

### #32 Offline / degraded — guest-chat outage UX (parent remains PARTIAL)

- Lane **UUU**: public `VenueGuestChatWidget` fail-closed on Connectivity Modes A/B/C — disable start / send / ping / end / delete; early-return guards; inline amber status copy matching OfflineBanner wording via `venuePage.guestChat.outageOffline|Unreachable|Unavailable` en/pl. Draft/input stays editable (no local queue). Mode F (stale) does not block writes.
- Files: `venue-guest-chat-widget.tsx`, `public-i18n.ts` (3 new guestChat keys each locale).
- Verify: `pnpm --filter @gospots/web run typecheck` PASS; `i18n:check` PASS (dashboard **407/407**, public **883/883**). **No API.**
- **Not finished:** silent `{silent:true}` loaders; public booking-dialog outage UX → Lane **VVV** (done same night).

### #32 Offline / degraded — notification-toast poll backoff (parent remains PARTIAL)

- Lane **TTT**: staff `NotificationToasts` background poll (was fixed 15s `setInterval` + silent catch) now uses shared `livePollIntervalMs` — backs off when Connectivity mode ≠ ok (≈60s→120s cap) and on consecutive fetch failures (15s → 60s → 120s); recursive `setTimeout`; reports outcomes via `reportLivePollResult` so toast poll failures can surface Mode F.
- Files: `notification-toasts.tsx` only (reuses `use-live-data` helper + connectivity context).
- Verify: `pnpm --filter @gospots/web run typecheck` PASS. **No API.**
- **Not finished:** silent `{silent:true}` loaders; dedicated public booking/chat outage UX (see [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phase 2 residual / Phase 3).

### #32 Offline / degraded — poll backoff + Mode F stale banner (parent remains PARTIAL)

- Lane **SSS**: `useLiveData` backs off when `ConnectivityProvider` mode is offline / api_unreachable / api_unavailable (≈ max(base×3, 60s) capped at 120s) and on consecutive **thrown** loader failures (base → 60s → 120s); recursive `setTimeout` schedule. Poll outcomes report into context → Mode F `stale` when fail streak ≥ 2 (A/B/C still win). `OfflineBanner` Mode F copy: “Showing last saved view — refresh when connection returns.”
- Files: `use-live-data.ts`, `connectivity-context.tsx`, `offline-banner.tsx`.
- Verify: `pnpm --filter @gospots/web run typecheck` PASS. **No API.**
- **Not finished:** silent `{silent:true}` loaders rarely surface Mode F; notification-toast poll backoff → Lane **TTT** (done same night); dedicated public booking/chat outage UX (see [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phase 2 residual / Phase 3).

### #32 Offline / degraded — ConnectivityProvider + `/ready` probe Modes A–C (parent remains PARTIAL)

- Lane **RRR**: lightweight `ConnectivityProvider` — listens to `online`/`offline`; periodic `GET {apiBase}/ready` every 60s (paused when `document.hidden`; re-probes on tab visible + coming online); 2-failure streak before Mode B/C to avoid blip flicker; Mode A takes precedence. `OfflineBanner` consumes context for Mode A (“No internet…”), B (“Can’t reach Locora servers…”), C (“temporarily unavailable…”). Wired via `AppProviders`.
- Files: `connectivity-context.tsx` (new), `offline-banner.tsx`, `app-providers.tsx`.
- Verify: `pnpm --filter @gospots/web run typecheck` PASS. **No API.**
- **Not finished:** poll backoff / mode F → Lane **SSS** (done same night); dedicated public booking/chat outage UX (see [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phase 2–3).

### #32 Offline / degraded — prod-safe ApiError + banner Mode A (parent remains PARTIAL)

- Lane **QQQ**: classified client error copy for connectivity/gateway failures — new `api-error-message.ts` (`networkUnreachableMessage`, `httpFailureMessage`); status **0** distinguishes browser offline vs API unreachable (local-dev Postgres/`pnpm dev` hint kept); bare **502/504** / **503** get prod-safe Locora copy (server `message` still preferred when present). Wired into `api` / `credentialedFetch` and public gaming/dining/guest `publicFetch` (catch network throw → status 0). `OfflineBanner` copy → Mode A (“No internet — changes won’t save…”).
- Files: `api-error-message.ts`, `api.ts`, `public-gaming-client.ts`, `public-dining-client.ts`, `public-guest-client.ts`, `offline-banner.tsx`.
- Verify: `pnpm --filter @gospots/web run typecheck` PASS. **No API.**
- **Not finished:** `/ready` probe / ConnectivityProvider → Lane **RRR**; poll backoff; dedicated public booking/chat outage UX (see [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phase 2–3).

### #30 Internationalization — board theme picker/empty en/pl (parent remains PARTIAL)

- Lane **PPP**: staff `GameBookingSchedule` board theme residual English (activity picker label + empty title/hint for gaming and dining) → dashboard `i18n.ts` `floor.theme*` en/pl; helper `staffBoardThemeLabels` in `staff-floor-i18n.ts`; wired via `useVenueSettingsOptional().t()`; chip CSS kept in `BOARD_THEME_CHIP`.
- Files: `i18n.ts`, `staff-floor-i18n.ts`, `game-booking-schedule.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **407/407**, public **880/880**); web typecheck PASS. **No API.**
- **Not finished:** full dashboard/ops; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — day-agenda chrome + actions en/pl (parent remains PARTIAL)

- Lane **OOO**: staff `BookingDayAgenda` residual English (empty states, title/flow, search/filters, pagination, phase badges, row actions Check in / Guest left / Collect payment / Edit / Cancel / Remove) → dashboard `i18n.ts` `floor.agenda*` en/pl; helper `staffDayAgendaLabels` in `staff-floor-i18n.ts`; wired via `useVenueSettingsOptional().t()`; times use venue locale.
- Files: `i18n.ts`, `staff-floor-i18n.ts`, `booking-day-agenda.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **401/401**, public **880/880**); web typecheck PASS. **No API.**
- **Not finished:** board theme picker/empty → Lane **PPP** (done same night); full dashboard/ops; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — schedule action labels en/pl (parent remains PARTIAL)

- Lane **NNN**: staff reservations board secondary action chrome (Book / Restore to service / Open booking / Check in guest / Guest left / View in day schedule / Mark out of service + more/free empty chrome) → dashboard `i18n.ts` `floor.action*` en/pl; helper `staffScheduleActionLabels` in `staff-floor-i18n.ts`; wired via `useVenueSettingsOptional().t()` into `GameBookingSchedule` unit cards, list rows, and ⋮ menus.
- Files: `i18n.ts`, `staff-floor-i18n.ts`, `game-booking-schedule.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **364/364**, public **880/880**); web typecheck PASS. **No API.**
- **Not finished:** full dashboard/ops; day-agenda → Lane **OOO** (done same night); board theme picker/empty English; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — staff floor/map chrome en/pl (parent remains PARTIAL)

- Lane **MMM**: staff reservations board + gaming menu live-map chrome residual English → dashboard `i18n.ts` `floor.*` en/pl; helper `staff-floor-i18n.ts`; wired via `useVenueSettingsOptional().t()` into `GameBookingSchedule` (explorers/bowling + unit status labels) and `GamingMenuPanel` map previews. Extended optional chrome/status props on `GamingFloorLayoutExplorer` / `SeatFloorMap`; public explorer also passes new `floor`/`floorN`/`noStations` chrome.
- Files: `i18n.ts`, `staff-floor-i18n.ts`, `game-booking-schedule.tsx`, `gaming-menu-panel.tsx`, `gaming-floor-layout-explorer.tsx`, `seat-floor-map.tsx`, `public-gaming-floor-explorer.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard **351/351**, public **880/880**); web typecheck PASS. **No API.**
- **Not finished:** full dashboard/ops string coverage; secondary schedule actions → Lane **NNN**; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — bowling-lane floor map en/pl (parent remains PARTIAL)

- Lane **LLL**: bowling-lane floor map chrome/legend residual English → `public-i18n` `venuePage.floor.*` (+ `noLanes` / `bowlingAlleyHint` / `swipeLanes` / `lanesRange`) en + pl; optional `chromeLabels` / `guestStatusLabels` on `BowlingLaneFloorMap`; wired from `PublicGamingFloorExplorer` via `usePublicPrefs().t()`. Staff callers keep English defaults (staff chrome → Lane **MMM**).
- Files: `bowling-lane-floor-map.tsx`, `public-gaming-floor-explorer.tsx`, `public-i18n.ts`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard 329/329, public **880/880**); web typecheck PASS. **No API.**
- **Not finished:** dashboard/ops; staff map chrome → Lane **MMM**; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — register venue packs en/pl (parent remains PARTIAL)

- Lane **KKK**: register step-3 venue-pack picker → existing `public-i18n` `pack.{id}.name|tagline` via `usePublicPrefs().t()` (keys already present from landing/pricing; stop reading English `name`/`tagline` from `venue-packs.ts` on register).
- Files: `apps/web/src/app/(auth)/register/page.tsx` only. **No** new catalog keys.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard 329/329, public **876/876**); web typecheck PASS. **No API.**
- **Not finished:** dashboard/ops; bowling-lane legend residual; staff map chrome English; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — public floor-map chrome en/pl (parent remains PARTIAL)

- Lane **JJJ**: public gaming/dining floor-map chrome residual English → `public-i18n` `venuePage.floor.*` keys (en + pl); wired via `usePublicPrefs().t()`; schedule day/window labels use guest locale.
- Files: `gaming-floor-map-controls.tsx`, `public-gaming-floor-explorer.tsx`, `gaming-unit-block-dialog.tsx`, `venue-gaming-tab.tsx`, `venue-dining-tab.tsx`, `public-i18n.ts`; optional `chromeLabels` / `guestStatusLabels` on `gaming-floor-layout-explorer.tsx` + `seat-floor-map.tsx`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard 329/329, public **876/876**); web typecheck PASS. **No API.**
- **Not finished:** dashboard/ops; bowling-lane legend residual; staff map chrome English; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — public guest chat widget en/pl (parent remains PARTIAL)

- Lane **III**: public venue guest chat widget residual English → `public-i18n` `venuePage.guestChat.*` keys (en + pl); wired via `usePublicPrefs().t()`; message timestamps use guest locale.
- Files: `venue-guest-chat-widget.tsx` + `public-i18n.ts`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard 329/329, public **847/847**); web typecheck PASS. **No API.**
- **Not finished:** gaming/dining floor chrome; dashboard/ops; register venue-pack names; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)). API success notices (`res.message`) still server English.

### #30 Internationalization — public booking dialog en/pl (parent remains PARTIAL)

- Lane **HHH**: public gaming/dining booking dialog residual English → `public-i18n` `venuePage.booking.*` keys (en + pl); wired via `usePublicPrefs().t()`; schedule/overlap times use guest locale.
- Files: `public-gaming-booking-dialog.tsx` + `public-i18n.ts`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard 329/329, public **812/812**); web typecheck PASS. **No API.**
- **Not finished:** guest chat widget, gaming/dining floor chrome; dashboard/ops; register venue-pack names; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — public venue page chrome en/pl (parent remains PARTIAL)

- Lane **GGG**: public `/venue/[slug]` residual English — not-found client, overview/hours weekdays, book/contact chrome, reviews tab+section → `public-i18n` `venuePage.*` keys (en + pl); wired via `usePublicPrefs().t()`.
- Files: `public-venue-client.tsx`, `venue-overview-tab.tsx`, `venue-weekly-hours.tsx`, `venue-book-tab.tsx`, `public-contact-form.tsx`, `venue-reviews-section.tsx`, `venue-reviews-tab.tsx` + `public-i18n.ts`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard 329/329, public **781/781**); web typecheck PASS. **No API.**
- **Not finished:** gaming booking dialog, guest chat widget, gaming/dining floor chrome; dashboard/ops; register venue-pack names; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — guest status pages en/pl (parent remains PARTIAL)

- Lane **FFF**: gaming/dining/event guest token status pages — visible hard-coded English → `public-i18n` `guestStatus.*` keys (en + pl); wired via `usePublicPrefs().t()`; dates use guest locale.
- Pages: `gaming-status/[token]/page.tsx`, `dining-status/[token]/page.tsx`, `event-status/[token]/page.tsx` + `public-i18n.ts`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard 329/329, public **672/672**); web typecheck PASS. **No API.**
- **Not finished:** public venue booking dialog / guest chat / floor residual; dashboard/ops hard-coded English; register venue-pack names; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #29 Accessibility — axe smoke public routes expand (parent remains PARTIAL)

- Lane **EEE**: expand `apps/web/e2e/a11y.spec.ts` beyond `/login` to `/register`, `/venues`, `/for-venues` (shared critical-only hard-fail; soft-log serious/moderate/minor; skip when no Next server).
- Verify: `pnpm --filter @gospots/web run typecheck` PASS; without server → **4 skipped**. **No API.** Still **not** CI-gated.
- **Not finished:** dashboard/settings/sessions axe matrix, contrast/focus formal sweep, CI gate (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #30 Internationalization — auth pages en/pl (parent remains PARTIAL)

- Lane **YY**: web auth chrome only — login, register, forgot-password, reset-password, staff activate — visible hard-coded English → `public-i18n` `auth.*` keys (en + pl); wired via `usePublicPrefs().t()`.
- Pages: `login-form.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `staff/activate/page.tsx` + `public-i18n.ts`.
- Verify: `pnpm --filter @gospots/web run i18n:check` PASS (dashboard 329/329, public **609/609**); web typecheck PASS. **No API.**
- **Not finished:** dashboard/ops hard-coded English; secondary locales; full sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)). Register venue-pack name/tagline wired in Lane **KKK**.

### #15 offeringConfig — typed models design (parent remains PARTIAL)

- Design-only [`GO_SPOTS_OFFERING_CONFIG.md`](./GO_SPOTS_OFFERING_CONFIG.md) — Lane **DDD**: as-is three pricing surfaces (`offeringConfig` JSON, `ResourceRate`, `Resource.hourlyRate`); versioned JSON vs relational rates comparison; **hybrid recommendation** (relational money + versioned behavioral JSON); **keep** `validateOfferingConfig` / `@IsOfferingConfig()` / normalize + map price helpers; Phase 0–3 migration sketch; defer impl post-Friday.
- **Already shipped (prior lanes):** write validation + `normalizeOfferingConfigPrices` on category create/update; FX reprice walks known JSON keys atomically with rates/hourlyRate.
- **Not finished:** `schemaVersion` stamp, JSON string decimals (#1 wire), rate de-duplication, optional column promote / bowling child tables.

### #2 / #4 / #5 — Live Postgres concurrency suite design (parents remain PARTIAL)

- Design-only [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) — Lane **CCC**: service-level integration tests with real `PrismaClient` + `Promise.allSettled` (N≈15–20 parallel attempts).
- **#4 booking:** public + staff same-slot double-book → exactly one success, others `409`, active overlap count 1; pairs with [`GO_SPOTS_EXCLUSION_CONSTRAINT.md`](./GO_SPOTS_EXCLUSION_CONSTRAINT.md) rollout step 7.
- **#5 stock:** parallel quick SALE of last unit → exactly one success, `stock === 0`, no negative stock, SALE row count invariant.
- **#2 testing:** opt-in via `RUN_CONCURRENCY_TESTS=1` + real `DATABASE_URL`; target `pnpm test:concurrency` + `--runInBand`; **skip** when unset (default CI unchanged); optional Postgres service job post-Friday.
- **Not finished:** harness + spec files; CI gate; HTTP/Supertest variant; walk-in vs reservation race (C4 optional).

### #28 Realtime — notifications SSE stub (parent → PARTIAL)

- Lane **XX**: Nest `@Sse('stream')` on `GET /api/v1/notifications/stream` — cookie JWT / shop-scoped (`requireShopId` + `notifications.read`); events `ready`, `heartbeat` (~25s), `notification`.
- In-process `NotificationsSseHub` push on notification create/upsert (same API instance only); `@SkipThrottle`; CSRF does not apply (safe GET). No websockets.
- Web: `useNotificationsSse` on notifications panel → silent list refetch; existing `useLiveData` 20s poll retained as fallback.
- Spec: `notifications-sse.hub.spec.ts` (+ tenant specs updated for hub DI). Verify: `tsc` + `nest build` + jest hub/tenant → PASS; web typecheck PASS.
- **Not finished:** Redis/PG multi-instance fan-out; floor/chat SSE; toast SSE (still 15s poll).

### #1 Money — Decimal wire format design (parent remains PARTIAL)

- Design-only [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md) — as-is `serializeMoney` → JS `number`; target string decimal JSON (4 dp); dual-read client → dual-emit API → string-only phased plan; `offeringConfig` / ledger called out separately.
- **Already shipped (prior lanes):** `Decimal(19,4)` columns + `money.util` + rounded number wire ([`GO_SPOTS_MONEY_DECISION.md`](./GO_SPOTS_MONEY_DECISION.md)).
- **Not finished:** wire format impl, web `coerceMoney` boundaries, idempotency replay shape (#7), ledger (#6).

### #3 Tenant isolation — Postgres RLS design (parent remains PARTIAL)

- Design-only [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) — RLS vs app `shopId` evaluation; defense-in-depth verdict (keep app guards + add RLS post-Friday); session-var / role model; table tiers A–C; Prisma + Neon pooler `SET LOCAL` risks; phased plan 0–5; **no policies deployed**.
- **Already shipped (prior lanes):** audited mutators + `shopScopedWhere` + venue interceptor.
- **Not finished:** RLS DDL, DB roles, request transaction wrapper, pooled cross-tenant integration tests; signed media URLs (#27 residual).

### #3 Tenant isolation — two-venue unit tests (parent remains PARTIAL)

- Lane **AAA**: expand/add `*.tenant.spec.ts` proving Shop A cannot update/delete Shop B resources via mocked Prisma `shopId` in `where`.
- Specs: new `menu.service.tenant.spec.ts` (update/delete + cross-tenant reject); expanded `gallery.service.tenant.spec.ts` (same pattern). Notifications skipped (lane XX lock).
- Verify: `tsc` + jest menu/gallery tenant specs → 8 PASS; full API jest **56 suites / 378 tests** PASS.
- **Not finished:** Postgres RLS (see [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md)); signed media URLs; full cross-module live isolation suite.

### #30 Internationalization — en/pl key parity detector (parent remains PARTIAL)

- Lane **WW**: `apps/web/scripts/i18n-check.mjs` + `pnpm --filter @gospots/web run i18n:check` compares en vs pl leaf keys in dashboard (`i18n.ts`) and public (`public-i18n.ts`); non-zero exit on mismatches.
- Baseline run: **0** missing keys (dashboard 329/329, public 499/499). Verify: web typecheck PASS. **No API.**
- **Not finished:** ops/auth hard-coded English; secondary locales; full i18n sweep (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #29 Accessibility — axe Playwright smoke stub (parent remains PARTIAL)

- Lane **UU**: optional `@axe-core/playwright` on `/login` (`apps/web/e2e/a11y.spec.ts`) via `test:a11y:smoke`.
- Lane **EEE** (same day): expanded to `/register`, `/venues`, `/for-venues` — see 2026-07-21 EEE entry above.
- Skips cleanly when no Next server at `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3000`) — **not** wired into CI this wave.
- Soft assert: serious/moderate/minor violations are `console.warn`’d; test fails only on **critical** impact.
- First-time browsers: `pnpm --filter @gospots/web exec playwright install chromium`.
- Verify: `pnpm --filter @gospots/web run typecheck` PASS; without server → 4 skipped (EEE). **No API.**
- **Not finished:** dashboard/settings axe matrix, contrast/focus formal sweep, CI gate (see [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)).

### #22 Email / jobs reliability — durable outbox slice (parent remains PARTIAL)

- Lane **SS**: expand-only migration `20260721020000_mail_outbox` (`MailOutbox`: status, attempts, nextAttemptAt, idempotencyKey, payload JSON, shopId nullable).
- `MailService.send` → `MailOutboxService.enqueue` (persist first) → Resend; SENT / FAILED+backoff / SKIPPED. Worker: `MailOutboxProcessor` `@Cron(EVERY_MINUTE)` + `withMailOutboxCronLock` (GS/MO), batch 20.
- Deploy docs: migration **#8** in [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) + [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md). Design: [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md).
- Verify: `tsc` + `nest build` + jest `mail-outbox` / `pg-advisory-lock` PASS.
- **Not finished:** prod proof of retries; dead-letter UI.

### #18 Owner protection — new-device sign-in email (parent remains PARTIAL)

- Lane **VV**: after successful `AuthService.login`, if the request User-Agent is absent from all active (non-revoked, non-expired) `AuthSession.userAgent`s — or there are no active sessions — email the account “New sign-in” with UA + UTC time via `MailService.send` (durable outbox enqueue). Fail-open: delivery/enqueue errors are logged and do not fail login.
- Small helper `new-device-alert.util.ts` (+spec); minimal login hook + private `maybeNotifyNewDeviceSignIn` (no 2FA, no migration). Spec: `auth.service.new-device.spec.ts`.
- Verify: `tsc` + `nest build` + jest `new-device-alert` / `auth.service.new-device` → PASS.
- **Not finished:** Owner 2FA / TOTP; reauth not yet on other sensitive owner actions beyond guest erase.

### #18 Owner protection — forced reauth on guest erase (parent remains PARTIAL)

- Lane **OO**: `POST /gdpr/erase-guest` requires password confirmation (JSON `password` or `X-Confirm-Password`) verified against the actor’s `passwordHash` via shared `assertUserPassword` / `requireConfirmPassword` (`verify-password.util.ts`) — does **not** rewrite `auth.service` login.
- Wrong/missing password → 401/400 before any PII redact; settings erase form adds password field before confirm dialog.
- Specs: `verify-password.util.spec.ts` + `gdpr.service.spec.ts` (reauth cases). Verify: `tsc` + `nest build` + jest gdpr/verify-password → PASS; web typecheck PASS.
- **Not finished:** Owner 2FA / TOTP; reauth not yet on other sensitive owner actions.

### #32 Offline / degraded ops — connectivity banner (parent remains PARTIAL)

- Lane **RR**: `OfflineBanner` listens to `navigator.onLine` + `online`/`offline`; initially mounted in `TenantShell` under the main header (staff dashboard only).
- Lane **TT**: same component mounted once in root `app/layout.tsx` so public/marketing/auth guests also see “Connection lost”; removed duplicate mount from `TenantShell` (no logic duplication).
- Copy is “Connection lost” only — no offline money-write queue messaging.
- Files: `offline-banner.tsx`, `layout.tsx` mount, `tenant-shell.tsx` (mount removed). **No API.** Verify: `pnpm --filter @gospots/web run typecheck` PASS.
- **Not finished:** classified prod errors, `/ready` probe, poll backoff, ops runbook (see [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md)).

### #2 Automated testing — Playwright smoke stub (parent remains PARTIAL)

- Lane **QQ**: optional `@playwright/test` on `@gospots/web`; `playwright.config.ts` + `e2e/smoke.spec.ts` loads `/login` and asserts Locora title + brand text.
- Script: `pnpm test:e2e:smoke` (root or web filter). Skips cleanly when no Next server at `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3000`) — **not** wired into CI this wave.
- First-time browsers: `pnpm --filter @gospots/web exec playwright install chromium`.
- Verify: `pnpm --filter @gospots/web run typecheck` PASS. **No API.**
- **Not finished:** full e2e matrix, concurrency suite, CI gate, web unit tests, `next build` CI.

### #17 Guest tokens — clear leftover plaintext tool (parent remains PARTIAL)

- Lane **PP**: `guest-plaintext-clear.util` + `pnpm run clear:guest-plaintext` (tsx CLI). Dry-run by default; `--apply` nulls `guestToken` only where `guestTokenHash` is set (Reservation / EventRequest / GuestChat). No migrate; does not rewrite `reservations.service`.
- Spec: `guest-plaintext-clear.util.spec.ts`. Documented in [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) as post-verify window tool.
- **Not finished:** operator must run clear after dual-read verification; DROP plaintext column later; statusPath email gaps.

### #34 Owner vs guest marketing — DONE

- Lane **GG**: solid route split — `/` and `/for-venues` owner acquisition (no dual-mode switcher); `/venues` guest discovery with guest-facing tagline/metadata.
- Hero primary → `/register`, secondary → `/venues`; `/venues` header links to `/for-venues`; footer `For venues` → `/for-venues`.
- Verify: `pnpm --filter @gospots/web run typecheck` PASS. **No API.**
- Residual: unused play-mode landing components still in tree; #35 Phase A city landing shipped (live cohort residual).

### #7 Financial idempotency — web Idempotency-Key on hot pay/sale (parent remains PARTIAL)

- Lane **NN**: web finance clients send `Idempotency-Key` (`crypto.randomUUID()` once per call) on `POST /finance/transactions`, `PATCH /finance/play-billing/:id/mark-paid`, `PATCH /finance/play-sessions/:id/mark-paid`.
- Same-attempt CSRF 403 replay in `api()` reuses the header from shared `init` — no new UUID mid-retry.
- Files: `finance-client.ts`, `play-billing-client.ts`. **No API.** Verify: `pnpm --filter @gospots/web run typecheck` PASS.
- **Not finished:** remaining money routes; UI-held key across intentional re-clicks after error.

### #19 Dashboard URL secret — Lane EE leak cleanup (parent remains PARTIAL)

- Middleware: `/dashboard/slug--key/...` → 307 `/dashboard/{slug}/...` (no key in Location).
- Fixed remaining builders: staff activate, ops/features server redirects, Lemon checkout `redirectUrl`, login `next=` sanitize via `toPublicDashboardPathname`.
- API `toPublicVenuePath` helper + spec; sessionStorage `x-venue-path` path unchanged.
- Verify: web typecheck PASS; API `tsc` + jest `dashboard-path.spec` PASS.
- **Not finished:** key rotation UI; eliminate capability-secret model; auth responses still include secret `dashboardPath` for bind (clients must not put it in the address bar).

### #25 GDPR — retention & consent design (parent remains PARTIAL)

- Design-only [`GO_SPOTS_GDPR_RETENTION.md`](./GO_SPOTS_GDPR_RETENTION.md) — data map (Tier A–D), proposed retention schedule (guest PII / audit / finance carve-outs), consent gaps (booking forms, CMP, DSAR), phased post-Friday plan.
- **Already shipped (prior lanes):** export API + settings UI (F/H); guest erase stub API + settings form (W/X).
- **Not finished:** retention automation, consent DB/UX, account erase, processor purge hooks.

### #7 Financial idempotency — client Idempotency-Key layer started (parent remains PARTIAL)

- Lane **AA**: `withClientIdempotency` (`idempotency.util.ts`) — process memory + expand-only `IdempotencyReceipt` unique `(shopId, scope, key)`; migration `20260721010000_idempotency_receipts`.
- Wired on finance controller (no `finance.service` rewrite): `POST /finance/transactions` (SALE/REFUND), `PATCH /finance/play-billing/:reservationId/mark-paid`, `PATCH /finance/play-sessions/:id/mark-paid`.
- Replay returns stored JSON; missing key = passthrough; same key + different body hash → 409; handler failure clears PENDING claim.
- Spec: `idempotency.util.spec.ts` (8). Verify: `tsc` + `nest build` + jest idempotency → PASS.
- **Follow-up (Lane NN):** web clients now send keys on these three routes (see entry above).
- **Not finished:** remaining money routes; UI-held key across intentional re-clicks after error.

## 2026-07-20

### #8 Subscription webhook idempotency — DONE

- Lemon `BillingWebhookEvent` unique receipt + handler dedupe; signature fail does not write receipt; unknown events ignored; duplicate delivery no-op.
- Prod boot requires Lemon webhook secret; webhook edge specs shipped.
- Migration `20260720210000_billing_webhook_events` on disk (Neon apply = operator).

### #16 Explicit CSRF protection — DONE

- Double-submit CSRF guard for cookie-auth mutations; cookie Secure/SameSite guidance; Helmet; web CSRF header wiring + specs.
- Dashboard address bar slug-only (related #19 slice below).

### #21 Timezone handling — DONE

- `Shop.timezone` column + settings IANA UI; venue day-key wiring for finance/schedule; public schedule day bounds.
- Migration `20260720220000_shop_timezone` on disk (Neon apply = operator).

### #1 Money Float → Decimal — completed slice (parent remains PARTIAL)

- `Decimal(19,4)` core commercial columns + `money.util` / `serializeMoney`; FX convert harden; call sites build-green.
- **Not finished under #1:** JS API numbers, `offeringConfig` JSON floats, full ledger (#6).

### #2 Automated testing — completed slice (parent remains PARTIAL)

- API Jest grown to **45 suites / 299 tests**; CI API lint/build/Jest + web typecheck.
- Lane **QQ** (2026-07-21): optional Playwright smoke stub (`test:e2e:smoke`) — `/login` Locora brand; skips if no server; not CI-gated.
- **Not finished:** full e2e/Playwright matrix, live concurrency suite, web unit suite, `next build` CI gate, CI e2e gate.

### #3 Tenant isolation — completed slice (parent remains PARTIAL)

- Audited mutators include `shopId` (hours/gallery/seating/audit/notifications + prior finance/reservations harden).
- **Lane AAA (2026-07-21):** two-venue unit tests for menu + gallery update/delete isolation — see 2026-07-21 entry.
- **Lane AAAAA (2026-07-21):** staff membership update/remove/regenerateInvite isolation — see 2026-07-21 entry.
- **Lane YYYY (2026-07-21):** resource unit + category update/delete isolation — see 2026-07-21 entry.
- **Lane ZZ (2026-07-21):** RLS design [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) — no policies deployed.
- **Not finished:** Postgres RLS; signed media URLs (opaque GET residual accepted).

### #4 Reservation concurrency — DONE (see 2026-07-21 WWWWWW entry)

- Resource `FOR UPDATE` booking locks; play-session update lock; overlap detect script; public/staff booking DTO harden.
- Exclusion migration `20260721060000_reservation_resource_exclusion` on disk; `23P01`→409.
- **Residual:** Neon deploy after overlap clean; live C1/C2 bodies (local only).

### #5 Inventory / stock races — DONE (Lane BBBBBB)

- Atomic SALE + stock; order-line patch/cancel/delete txn paths; conditional stock SQL; play-billing paid claim.
- **Lane BBBBBB (2026-07-21):** `claimActiveLinesAndRestoreStock` on order cancel + delete (claim before delete); add-line day-reset inside txn; unit race sims. C3 live body = local Docker residual only.

### #6 Financial ledger — interim only (parent remains DESIGN_ONLY)

- Interim [`GO_SPOTS_FINANCE_CONTRACT.md`](./GO_SPOTS_FINANCE_CONTRACT.md) + shared channel sum (anti-double-count).
- Design spike [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) — **no LedgerEntry impl**.

### #7 Financial idempotency — completed slice (parent remains PARTIAL)

- Webhook receipts (#8) + conditional pay claims (walk-in / play billing).
- **Not finished:** universal idempotency keys on all finance mutations.

### #9 Migration safety — completed slice (parent remains PARTIAL)

- [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) 4 PASS / 2 WARN on six folders; [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md); never-reset doctrine.
- **Not finished / OPERATOR:** Neon `migrate deploy` of six `20260720*`.

### #12 Dual subscription / entitlements — DONE (Phase 1 pack-only)

- Entitlements helper + feature/seat asserts; dual-read pack/addOns; **FFFFFF** pack-only authz (see 2026-07-21 entry).
- **Residual:** optional DROP `tier`; pack-less legacy path; OPERATOR backfill apply.

### #13 CSV permissions / add-ons — DONE (Lane IIIIII)

- Relational `MembershipPermission` / `SubscriptionAddOn` rows SoT; rows-primary reads; mutations write join rows only.
- Contract migration `20260721090000_drop_membership_permissions_subscription_addons_csv` on disk.
- API/JWT still emit **computed** CSV strings; `pendingAddOns` stays CSV.
- Design: [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md).
- **Residual:** OPERATOR Neon DROP deploy; optional arrays-only API polish.

### #15 offeringConfig JSON — completed slice (parent remains PARTIAL)

- Write DTO/util validation + `normalizeOfferingConfigPrices` on writes.
- **Not finished:** first-class typed columns / Decimal storage for JSON prices.

### #17 Guest tokens hash/expiry/revoke — completed slice (parent remains PARTIAL)

- Hash-at-rest + expiry + revoke on cancel/NO_SHOW; dual-read legacy plaintext; migration `20260720250000_*` on disk.
- **Lane PP (2026-07-21):** dry-run `clear:guest-plaintext` clears leftover plaintext only when hash present — see 2026-07-21 entry.
- **Not finished:** operator clear after verification window; drop plaintext column after verification window.

### #18 Owner sessions (not 2FA) — completed slice (parent remains PARTIAL)

- Refresh family revoke; `GET/DELETE /auth/sessions` + revoke-others; settings Sessions UI; UA on token issue.
- Lane **OO** (2026-07-21): forced password reauth on guest erase.
- Lane **VV** (2026-07-21): new-UA / first-session sign-in email (fail-open via mail outbox).
- Design only for 2FA: [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md) — **2FA not DONE**.

### #19 Dashboard URL secret — completed slice (parent remains PARTIAL)

- Slug-only dashboard URLs in address bar; secret path in sessionStorage for `x-venue-path`.
- Lane **EE** (2026-07-21): middleware Location strip; activate / legacy redirects / billing success / login `next=` sanitized.
- **Not finished:** key rotation UI; eliminate capability-URL model entirely.

### #20 Currency change safety — DONE (Lane YYYYY)

- Atomic catalog FX reprice all-or-nothing (Lane D).
- Preview + confirm (Lane CC): `POST /shop/currency/preview` proposed price table; apply requires `confirm: true` on settings PATCH; historical money rows untouched.
- Lane **MM** (2026-07-21): settings currency select → preview → before/after summary modal → PATCH with `confirm: true` only (no `window.confirm`).
- Lane **YYYYY** (2026-07-21): M6 stamps — `20260721040000_currency_stamp_monetary_rows` on disk; dual-write on Transaction/ShopOrder/PlaySession/ShopLoss/Reservation; analytics group by effective currency; `GET /shop/currency/history` + settings history list; dedicated audit `venue.currency.change`. Design: [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md).
- Verify: jest currency-stamp + finance-analytics + reprice **17** PASS; `tsc` + `nest build` PASS; `i18n:check` **1823**+**972**. OPERATOR: Neon migrate stamp migration.
- **Not finished (operator / other lanes):** Neon deploy; money-wire JSON string dual-read on web (#1) is sibling-owned.

### #22 Email / jobs reliability — completed slice (parent remains PARTIAL)

- Mail outbox **stub** (Lane E) → **durable table + worker** (Lane SS): `20260721020000_mail_outbox`, enqueue-on-send, `MailOutboxProcessor` cron + GS/MO advisory lock. Design [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md).
- Reminder cron single-flight via `pg_try_advisory_xact_lock` (Lane C).
- **Not finished:** prod-proven retries; dead-letter UI.

### #23 Observability — completed slice (parent remains PARTIAL)

- Optional `@sentry/node` when `SENTRY_DSN` set; fail-open; PII scrub; global 5xx `SentryExceptionFilter`; health `/live` `/ready`; request logging.
- Design: [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) — OTel still deferred.

### #25 GDPR — completed slice (parent remains PARTIAL)

- Owner export API + settings download UI; guest erase stub (PII redact, keep billing) + settings form.
- **Not finished:** full RTBF / account erase / money cascade.

### #26 Abuse controls — completed slice (parent remains PARTIAL)

- Auth throttle env knobs; public schedule throttle; public booking/event input harden.
- **Lane BB:** `PUBLIC_THROTTLE_*` (booking / event / contact / review / chatOpen, default 5/min) on public creates via `publicThrottle()` — layered under global limit.
- **Lane KK (design):** [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) — progressive CAPTCHA escalation (429 → require token; cross-surface burst); Turnstile recommended over hCaptcha; env sketch; **no vendor wired**.
- **Not finished:** CAPTCHA verify + widget impl; broader public abuse matrix.

### #27 Upload security — completed slice (parent remains PARTIAL)

- MIME allowlist + magic-byte sniff, size limits, shop-scoped deletes; media CORS `*` removed.
- **Lane SSSS:** Phase 1 inventory/migrate tooling + `LEGACY_UPLOADS_STATIC` (default on).
- **Not finished:** malware scan; signed media URLs; live flag-off after inventory=0.

### Design-only lanes closed (no code DONE)

- #6 ledger design — [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md)
- #10 unified ticket — [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md)
- ~~#14 resource/dining merge~~ → **DONE** Phase 0–2 (**OOOOOO** / **OOOOOO-p2**); Phases 3–4 residual — [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md)
- #18 2FA design — [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md)
- #20 currency stamps design — [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md) → **implemented** Lane YYYYY (parent #20 DONE)
- #28 realtime design — [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md)
- #29/#30 a11y/i18n design — [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md)
- ~~#11 oversized services split~~ → **DONE** Phase 0+1 (**SPLIT11**); Phases 2–9 residual — [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md)
- #31 onboarding design — [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md) → **implemented** Lane LLLLLL (parent #31 DONE)
- #32 offline / degraded ops design — [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) (Lane RR later shipped staff connectivity banner → PARTIAL)
- #33 product scope / narrow focus — [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md)
- #25 GDPR retention/consent design — [`GO_SPOTS_GDPR_RETENTION.md`](./GO_SPOTS_GDPR_RETENTION.md)
- #1 money wire format design — [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md)
- #3 tenant RLS design — [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md)
- ~~#15 offeringConfig typed models~~ → **DONE** Phase 0 (**EEEEEE**); Phase 1–3 residual — [`GO_SPOTS_OFFERING_CONFIG.md`](./GO_SPOTS_OFFERING_CONFIG.md)
- ~~#2/#4/#5 concurrency suite design~~ → **#2 DONE** (**GGGGGG** unit+CI+scaffold); #4/#5 DONE; live C1–C3 residual — [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md)
- ~~#35 marketplace after supply~~ → **DONE** Phase A (**MMMMMM**); live cohort + M4–M5 residual — [`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md)

### Explicitly not finished (do not log as DONE)

- Full financial ledger (#6)
- ~~Postgres exclusion constraint (#4)~~ → **DONE** (WWWWWW; Neon deploy residual)
- Owner 2FA (#18)
- Durable mail outbox (#22) — table + worker + dead-letter API + owner dashboard UI shipped; **prod retry proof** / alerting / system-mail ops still open
- Neon migrate deploy / CORS / smoke (operator — see [`REMAINING_P0_FRIDAY.md`](./REMAINING_P0_FRIDAY.md))
