# Bible / 40-point progress index

> **Per-item matrix:** [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) (1–35 DONE/PARTIAL/…) · **Finished log:** [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) (append when a slice ships).  
> **Operator next steps:** [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) (migrate + env + smoke).

**As of:** 2026-07-21 (post-**OOOOOO-p2** #14 DONE Phase 0–2; **#10** DONE) · Sources: `OVERNIGHT_STATUS.md`, `REMAINING_P0_FRIDAY.md`, `AGENT_COORDINATION.md` completed lanes, design docs linked below.  
**Legend:** **Done** = ship code · **Design-only** = doc, defer impl · **Operator Friday** = human deploy/smoke · **Still deferred** = post-submit.

**Verify snapshot:** nest build **PASS** · web typecheck **PASS** · bible matrix **35 DONE** · CI `api-migrate` · pending migrations on disk through `20260721120000_seating_source_dining_table_group` (Neon deploy still operator).

---

## Done (ship code)

| Theme (audit) | Notes |
|---------------|--------|
| Money `Decimal(19,4)` + **string wire** | M1 columns + util; **#1 DONE** (**XXXXX**) — API `serializeMoney` → 4dp strings; offeringConfig string prices; web `coerceMoney`; design [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md) |
| Finance anti-double-count | Interim [`GO_SPOTS_FINANCE_CONTRACT.md`](./GO_SPOTS_FINANCE_CONTRACT.md) + channel sum |
| Unified guest check / open tabs | **#10 DONE** (**NNNNNN**) — Option A ops container; Phase 3 settle residual; design [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) |
| Financial ledger Phase 1–2 | **#6 DONE** (**LEDGER6**) — `LedgerEntry` + `LEDGER_DUAL_WRITE` dual-write; analytics interim until Phase 4; design [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) |
| Tenant isolation (app + RLS belt) | App `shopId` mutators + two-venue unit matrix; RLS migration `20260721050000_*` + `SET LOCAL` plumbing (**ZZZZZ** — **#3 DONE**); opt-in `TENANT_RLS`; opaque media GET residual; Neon migrate + flag soak OPERATOR; design [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) |
| Booking locks + stock/order txns | Resource `FOR UPDATE`; atomic SALE/lines; play-billing claim (Lane A); **#4 DONE** exclusion `20260721060000_*` (**WWWWWW**); **#5 DONE** claim-before-delete/cancel (**BBBBBB**); live C1–C3 local-only residual |
| Lemon webhook idempotency | Receipt uniqueness migration on disk |
| CSRF + cookies + Helmet + boot secrets | Prod Secure/CORS guidance |
| Guest token hash/expiry/revoke | Dual-read plaintext window remains; clear CLI (Lane PP); **#17 DONE** (**DDDDDD**); cutover/DROP design [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md) |
| Refresh family revoke + sessions API/UI | Lanes J/O/R; new-device alert (VV); owner TOTP MFA (**AAAAAA** — **#18 DONE**) |
| Timezone column + settings UI | Lane B |
| offeringConfig validation + Phase 0 version stamp | Write DTO/util; **#15 DONE** (**EEEEEE**) — `schemaVersion: 1` + typed contract + inventory CLI; hybrid design [`GO_SPOTS_OFFERING_CONFIG.md`](./GO_SPOTS_OFFERING_CONFIG.md); relational de-dup residual |
| Feature/seat asserts + staff invite lifecycle | Dual-write permissions; **#12 DONE** pack-only authz (**FFFFFF**) |
| Pack + add-ons vs legacy tier | **#12 DONE** (**FFFFFF**) — pack-only `resolveModules` + effectiveAddOns synthesis; optional DROP tier residual; design [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md) |
| Permissions/addOns CSV cutover | **#13 DONE** (**IIIIII**) — rows SoT + DROP migration on disk; `pendingAddOns` stays CSV; design [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md) |
| Atomic FX catalog reprice + preview/confirm + M6 stamps | Lanes D / CC / MM / **YYYYY** — **#20 DONE**; history UI + row stamps; OPERATOR Neon stamp migrate |
| Cron single-flight (reminders + mail outbox) | Lanes C / SS advisory locks |
| GDPR export + guest erase stub (+ forced reauth) | Lanes F/H/W/X/OO — superseded by **#25 DONE** (VVVVVV) |
| GDPR full program (export/erase/account wipe/consent/DSAR/retention) | Lane **VVVVVV** — **#25 DONE**; money amounts kept (accounting); OPERATOR Neon migrate + Lemon/Resend processor purge |
| Durable mail outbox + processor | Lane SS + dead-letter API/UI (XXXX/ZZZZ) + system-mail ops (**TTTTT**) — **#22 DONE**; OPERATOR prod retry proof |
| Client finance `Idempotency-Key` | Lanes AA / NN / GGGG / LLLL / OOOO / RRRR / **TTTT** / **NNNNN** — Tier A+B+C + currency apply + retry handoff + Phase 3 require-keys (**#7 DONE**); operator live flag flip residual |
| CAPTCHA / public abuse | Lanes BB / GGGGG / IIIII / LLLLL / MMMMM / **RRRRR** — (**#26 DONE**); operator enable secrets |
| Connectivity / offline Modes A–C/F | Lanes RR–WWW + ops runbook (**#32 DONE**) |
| Dashboard capability key | Lanes EE / IIII / MMMM / QQQQ / **QQQQQ** — Phase 3 slug-only + hash-at-rest (**#19 DONE**); Neon migrate OPERATOR; optional DROP |
| CI API build/Jest + web typecheck + ephemeral migrate dry-run + post-deploy verify | Health `/live` `/ready`; Lane **KKKKK** `api-migrate`; Lane **CCCCCC** Phase 2 template + `verify:migrations` (**#9 DONE**); Neon deploy still operator |
| Image upload harden | MIME/magic/size + Phase 1 inventory/migrate + `LEGACY_UPLOADS_STATIC` (**#27 DONE** via **VVVVV**); OPERATOR inventory=0 + flag off; opaque public GET accepted; malware/signed Phase 2–3 deferred |
| Notifications SSE + poll fallback | Lane XX + **UUUUU** — **#28 DONE**; Redis/floor SSE scale residual |
| Oversized services / capability split | **#11 DONE** (**SPLIT11**) — Phase 0 `auth.types` + Phase 1 finance reports/losses extract + characterization; Phases 2–9 residual; design [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md) |
| Owner/guest marketing route split | Lane GG (#34 DONE) |
| Product scope / gaming-first commercial UX | **#33 DONE** (**KKKKKK**) — self-serve gaming/mixed + marketing bundles; Phase B–D residual |
| Marketplace city-first GTM Phase A | **#35 DONE** (**MMMMMM**) — `/venues/wroclaw` + GTM checklist; live cohort residual |
| Connectivity / offline Modes A–C/F + ops runbook | Lanes RR–WWW + **PPPPP** (DR) + **SSSSS** (in-app settings); #32 **DONE**; design [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) |
| Optional e2e + axe a11y smoke (13 public routes) | Lanes QQ / UU / EEE / YYY / JJJJJ / **WWWWW** — **#29 DONE**; critical-clean verified; CI `web-a11y-smoke` non-blocking; dashboard residual |
| Product UI en/pl (dashboard + public + auth) | Lanes WW–HHHHH + **TTTTT** / **TTTTT-i18n-enpl-done** — **#30 DONE**; `i18n:check` **1871**+**989**; secondary locales residual |
| Observability (Sentry + request log + health) | Lanes V / Y / **UUUUUU** — **#23 DONE**; OTel residual |
| Automated testing (unit + CI + opt-in concurrency) | **#2 DONE** (**GGGGGG** + **HHHHHH**) — API Jest in CI + web typecheck + migrate dry-run + `test:concurrency` scaffold + util/lock C1–C3 bodies; OPERATOR local Docker run; web unit/CI residual; design [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |

---

## Design-only (link docs)

| Theme | Doc |
|-------|-----|
| Ledger Phase 3–5 (backfill / LEDGER_READS) | [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) — Phase 1–2 **#6 DONE**; OPERATOR Neon + flag |
| Owner 2FA / TOTP | [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md) — **#18 DONE** (ship); staff MFA residual |
| Permissions/addOns CSV cutover | [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md) — **#13 DONE**; OPERATOR Neon DROP |
| Unified guest ticket / check | [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) — **#10 DONE** Phase 0–2 Option A (**NNNNNN**); Phase 3 settle residual |
| Resource / dining model merge | [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md) — **#14 DONE** Phase 0–2 (**OOOOOO** / **OOOOOO-p2**); Phases 3–4 cutover residual |
| Observability (OTel / deeper Sentry) | [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) — **#23 DONE** for Sentry+logs+health; OTel residual |
| Full a11y / i18n sweeps | [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md) — **#29 DONE** (public axe); **#30 DONE** (en/pl product UI); secondary locales + dashboard a11y residual |
| Product scope / narrow focus | [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md) — **#33 DONE** (Phase A commercial UX **KKKKKK**); Phase B–D residual |
| Onboarding wizard | [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md) |
| Marketplace GTM (city-first) | [`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md) — **#35 DONE** Phase A (**MMMMMM**); live cohort + M4–M5 residual; checklist [`MARKETPLACE_GTM_CHECKLIST.md`](./MARKETPLACE_GTM_CHECKLIST.md) |
| CAPTCHA escalation | [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) — **#26 DONE**; OPERATOR enable secrets; Redis/metrics optional |
| GDPR retention / consent | [`GO_SPOTS_GDPR_RETENTION.md`](./GO_SPOTS_GDPR_RETENTION.md) — **#25 DONE**; OPERATOR Neon + Lemon/Resend |
| Service splits | [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md) — **#11 DONE** Phase 0+1; Phases 2–9 residual |
| Live concurrency recipes | [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) — **#2 DONE**; util/lock C1–C3 bodies shipped (**HHHHHH**); OPERATOR local Docker run |
| Dashboard key rotate / Phase 2–3 bind + hash | [`GO_SPOTS_DASHBOARD_KEY.md`](./GO_SPOTS_DASHBOARD_KEY.md) — **#19 DONE** (QQQQQ); Neon hash migrate OPERATOR; optional DROP |
| Upload / media residuals (malware, signed private, live flag-off) | [`GO_SPOTS_UPLOAD_SECURITY.md`](./GO_SPOTS_UPLOAD_SECURITY.md) — **#27 DONE**; OPERATOR inventory=0 + `LEGACY_UPLOADS_STATIC=false`; Phase 2–3 deferred |
| Realtime multi-instance / floor SSE | [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md) — **#28 DONE** for in-process; Redis/floor = scale residual |
| Pack + add-ons vs legacy `SubscriptionTier` collapse | [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md) — **#12 DONE** Phase 1; optional DROP / catalog multi_shop add-ons residual |
| OfferingConfig relational rates / column promote | [`GO_SPOTS_OFFERING_CONFIG.md`](./GO_SPOTS_OFFERING_CONFIG.md) — **#15 DONE** Phase 0; Phase 1–3 residual |
| Remaining money-path Idempotency-Key | [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) — **#7 DONE**; OPERATOR live `IDEMPOTENCY_REQUIRE_MONEY_KEYS=true` |
| Guest token dual-read stop / DROP plaintext | [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md) |
| Migration safety (Phase 1 CI dry-run + Phase 2 template + Phase 3 verify) | [`GO_SPOTS_MIGRATION_SAFETY.md`](./GO_SPOTS_MIGRATION_SAFETY.md) — **#9 DONE**; OPERATOR Neon deploy + `verify:migrations` |

---

## Operator Friday

| Action | Ref |
|--------|-----|
| Neon `migrate deploy` (pending on disk through `20260721120000_seating_source_dining_table_group`, never reset) | [`REMAINING_P0_FRIDAY.md`](./REMAINING_P0_FRIDAY.md), [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) |
| Host `CORS_ORIGINS` + cookie/CSRF/throttle prod defaults | [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md), `.env.production.example` |
| Manual smoke (login/CSRF, CORS, book, guest link, stock+sale, webhook dup) | Same |
| Deploy Node **20** LTS | Host engines |
| Confirm Neon PITR / retention + restore drill (fill TBD) | [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) — **#24 DONE** (docs); live fill-in residual |

---

## Still deferred (post-submit; residual)

| Theme | Note |
|-------|------|
| Live concurrency C1–C3 bodies (local Docker) | Util/lock bodies shipped (**HHHHHH**); harness refuses Neon; OPERATOR opt-in run residual |
| GDPR full **delete** / account erase / RTBF | **#25 DONE** — PII redact + account wipe; money rows retained by design; Lemon/Resend = OPERATOR |
| Signed / shop-scoped media URLs + malware + `/uploads` retirement | **#27 DONE** for Phase 1; OPERATOR inventory=0 + flag off; Phase 2–3 deferred |
| Pack vs tier schema collapse | **#12 DONE** for pack-only authz; optional DROP `tier` residual ([`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md)) |
| OfferingConfig relational rate de-dup / column promote | **#15 DONE** for Phase 0 version stamp; Phase 1–3 residual ([`GO_SPOTS_OFFERING_CONFIG.md`](./GO_SPOTS_OFFERING_CONFIG.md)) |
| Auth/finance/reservations service file splits | **#11 DONE** Phase 0+1 (reports/losses); Phases 2–9 residual |
| Money string JSON wire | Design [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md) |
| Marketing / branding polish | Beyond #34 route split |
| Neon PITR live confirm + restore drill | **#24 DONE** for runbook; OPERATOR fill TBD + drill residual |
| Clear leftover plaintext guest tokens + DROP columns | **#17 DONE** for hash/expiry/revoke/clear CLI; dual-read stop + DROP after verification window; design [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md) |
| Full `next build` / web eslint / hard a11y CI gate | Typecheck + optional smokes + non-blocking `web-a11y-smoke` already |

---

*Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Snapshot: [`OVERNIGHT_STATUS.md`](./OVERNIGHT_STATUS.md) · Status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) · Finished: [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md)*
