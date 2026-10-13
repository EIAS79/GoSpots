# GoSpots — Current Engineering State

Updated: 2026-10-09 (code inspection; exact branch validation pending)
Repository: EIAS79/GoSpots
Main baseline: `b3e444e4deed5b9392c947f7d9b130a118897738`
Working branch: `agent/gospots-payment-integrity-20261009` (verify GitHub ref before resuming)
Wave: W0 baseline + safe W1 financial work
Current ticket: T-002 — manual-card boundary

## Verified from live GitHub
- Root `AGENTS.md` and `docs/ai-execution/` were missing at baseline; existing `apps/web/AGENTS.md` is retained untouched.
- Source includes API, web, Prisma and Edge Hub; main HEAD is the SHA above.
- Generic `POST /checkout/settlements/:id/payments` accepted `MANUAL_CARD` and posted `SUCCESS` without provider capture. Adyen finalization reused that service method.
- Vercel's checked-in `apps/web/vercel.json` sets non-main Git deployments to false and ignores main commits without `.vercel-release` changes. Actual Vercel account/project linkage remains unverified.
- GitHub `main` branch protection is disabled as of baseline check.
- Existing production Render/Neon/Adyen identities are NOT re-verified.

## Current engineering change
- Direct manual-card endpoint/service writes rejected for both owner and cashier.
- Verified-provider internal recording checks a tenant/settlement-bound CAPTURED operation with equal amount and currency before any payment/settlement update.
- Existing valid Adyen CAPTURED finalization is routed through that explicit method.
- Regression tests added for blocked direct calls, missing capture and amount mismatch.

## Proof level
- Phase 4 focused Gate P4 suite, migration assertions and API build passed at first branch SHA ff51896d4eaf700261f703810319662795b54bb5. Full CI reported two controller test failures because a synchronous exception was asserted as an async promise; regression assertion corrected in next branch commit. Final exact-head CI still pending; no local Node 24/pnpm repository install because sandbox cannot clone GitHub (DNS restriction).
- Do NOT call T-002 SOFTWARE_DONE until focused GitHub CI passes on the exact new SHA and integrated provider flow is confirmed.
- Physical capture/refund/fiscal/Edge pilot remains EXTERNAL_BLOCKED; no live payment operations performed.
- No production deploy, main merge, migration or Edulytics environment access authorized/performed.

## October 9 verification / release blocker
- First full API Jest: 480/482 tests passed, exactly two newly added controller assertions failed due to expect(...).rejects used on synchronous throw (not production execution). Corrected test semantics; re-run required.
- Phase 17 security audit detected 2 critical and 4 high production dependency advisories, including Next.js, proxy-addr, sharp and source-map-js; release remains NO-GO pending independent security remediation and re-audit.
- GoSpots Vercel project identified under eias79s-projects; branch Git push registered a CANCELED deployment attempt (no build/READY), proving branch build suppression but not eliminating deployment records.
- This is NOT proof of a certified card capture or general production readiness.


## W1 consolidated checkpoint — 2026-10-10 (commit represented by this file)

Branch: `agent/gospots-payment-integrity-20261009`, draft PR #103.
Parent SHA: `72ee6dc1791d0280426bad98dbdeedeb3d8b74cd`.
New checkpoint commit SHA: see `git rev-parse HEAD` / GitHub PR #103 head (cannot self-reference a SHA in the commit contents).
Current wave: W1; T-002 IMPLEMENTED/CI_PENDING; T-003 IMPLEMENTED/CI_PENDING; T-006 PARTIAL/CI_PENDING.
Remote update is authorized only for this one consolidated checkpoint. Never merge or deploy without separate approval.
Changed sources/tests and exact local evidence in `W1_2026-10-09_CHECKPOINT_NOTES.md`.
Local: archive checksum PASS, synthetic 24-file transform PASS, four time-zone checks PASS under three host zones, proposed TS fragments parse PASS. Complete repo lint, Jest, build, browser E2E: NOT RUN locally.
Earlier SHA: API 104/104 suites, 482/482 tests PASS; Phase 4 PASS; general CI and Phase17 browser E2E FAIL six manual-card test scenarios; Phase17 dependency audit FAIL (two critical, four high, ten moderate, three low).
Status cannot advance to ACCEPTED until exact-new-head green tests. No production Adyen, fiscal or database work performed.
Next: (1) exact-head CI/provider/regression and browser tests, (2) T-003/T-006 deeper matrix, (3) Phase17 dependency remediation.

## W1 security and acceptance recovery — local unpushed checkpoint, 2026-10-10

Repository: EIAS79/GoSpots; development branch: `agent/gospots-payment-integrity-20261009`; verified GitHub parent: `cfd703e6e9e964e913abcc09583f218d93b84fd1`; draft PR #103. The new commit SHA is not yet assigned; after the authorized push, obtain it from GitHub HEAD.
Current wave W1. T-002 = IMPLEMENTED, LOCAL-VERIFIED / REMOTE-PENDING, NOT ACCEPTED; T-003 = IMPLEMENTED, LOCAL-VERIFIED / REMOTE-PENDING, NOT ACCEPTED; T-006 = PARTIAL / REMOTE-PENDING. Phase17 critical/high dependency remediation = LOCAL-VERIFIED / REMOTE-PENDING.
Local pnpm 10.12.1 frozen-lockfile installation PASS. Exact patched versions: next and eslint-config-next 16.3.8, sharp 0.35.5, proxy-addr 2.0.8, source-map-js 1.2.2. pnpm audit --prod --audit-level high PASS: zero critical/high, 5 moderate and 2 low remain; full no-threshold audit fails on those lower findings.
API changed production lint PASS; API full Jest pre-commit rerun 109 suites / 516 tests PASS, plus later 3 focused integration suites / 13 tests PASS; previous focused payment/provider/mail/DST suite 6 suites / 38 tests PASS. API build and Prisma schema validate PASS. Web typecheck, checkout UI 20 tests, offline 10 tests, Next.js 16.3.8 production build PASS with build-only API target. Sharp 0.35.5 in-memory PNG PASS.
Local Docker unavailable: PostgreSQL migration rehearsal and full Playwright/browser integration remain remote CI gates, not certified here. No real payments, refunds, fiscal transactions, production DB or Vercel deployments performed.
Next three: exact-new-SHA GitHub Actions and provider/booking proof; expanded T-006 RLS/tenant/background matrix; assess moderate/low production advisories and pilot readiness. Do not merge or deploy; require fresh push authorization.

## W1 continuation — 2026-10-11 (LOCAL ONLY; no push)
- Verified remote parent: `5009e114aa4a408b9488934f611e0e1172425f55` on draft PR #103. Previously 7/7 workflows green. Current changes are not in GitHub or accepted.
- Documentation plan packet SHA `0a0634962aee8ef462d0beddbc5086bc5f275628` fetched and imported locally: exactly 23 original files, documentation only. Evidence hierarchy includes P0–P17, R0–R15, six waves, T-001–T-017.
- T-002: additional database-backed checkout provider/split/refund browser case, persisted-DB assertion, refund replay/list guards prepared; new PG/browser evidence pending; NOT ACCEPTED.
- T-003: venue-authoritative customer/staff booking time conversion (including DST rejection) prepared; 5/5 focused timezone tests and web typecheck PASS; new browser E2E pending; NOT ACCEPTED. Draft PR #95 remains separate.
- T-006: tenant REST negative and disposable PostgreSQL RLS matrix prepared; PG17 CI test not yet run; PARTIAL / OPEN. RLS default off unchanged.
- See `W1_2026-10-11_ACCEPTANCE_EVIDENCE_DRAFT.md` for exact source paths, scenario IDs, blocked evidence and Wave 2 dependencies. No main merge, production deploy or release marker change.

## W1 E2E-06/E2E-04 local blocker disposition — 2026-10-11 (UNPUSHED)
- Verified parent and remote head remain `5009e114aa4a408b9488934f611e0e1172425f55`, draft PR #103; no new GitHub CI, commit, merge, release marker edit, or production deployment.
- E2E-06 fixture bug: bindVenue() returned on page.goto before VenueGate completed its second POST venue-session bind; that bind rotates the CSRF double-submit cookie, racing subsequent test-device mutations. Browser fixture now waits for the successful gate bind before continuing. An explicit forged X-CSRF-Token request returns 403 CSRF_INVALID with no created device. Previously fixed test idempotency key also changed from a cross-run constant to a unique per-run value. Repeated isolated run 3/3 PASS on disposable PG17.
- E2E-04 environment finding: earlier 24-test run against Turbopack dev had 22 PASS / 2 FAIL (E2E-06 CSRF and E2E-04 offline refresh). Identical original E2E-04 refresh/IndexedDB/one-replay assertions PASS 1/1 against production Next.js 16.3.8 build through a temporary local same-origin API gateway, with no code or assertion weakening. Root is dev-server offline asset/hydration mismatch rather than proven business-state loss; full production-browser suite NOT YET executed.
- Full API Jest latest completed 110 suites / 521 tests PASS; strict changed-production API lint PASS; API build PASS; web typecheck and production build PASS. PostgreSQL17 115 migrations & seed PASS; independent-connection refund concurrency 28 assertions PASS; unprivileged cross-tenant RLS matrix 11 tables PASS; venue timezone utility 5/5 PASS; T-002 checkout, T-003 travel, T-006 cross-tenant new browser cases passed individually.
- Disposable `gospots_e2e_w1_production` database was migrated and seeded; automated tool rejected subsequent local API restart, so do not claim the fresh production 24/24 browser campaign. T-002 and T-003 LOCAL VERIFIED / ACCEPTANCE_PENDING; T-006 PARTIAL/OPEN pending wider coverage, configured-RLS decision and exact-commit GitHub CI.
- All 23 original Venue OS docs match the documentation commit `0a0634962aee8ef462d0beddbc5086bc5f275628` and remain unpushed. Seven lower-severity advisories (5 moderate, 2 low) remain tracked separately.

## 2026-10-11 — FINAL LOCAL W1 GREEN CORE / GITHUB CHECKPOINT NOT PUSHED
- Immutable local and remote development parent `5009e114aa4a408b9488934f611e0e1172425f55`, branch `agent/gospots-payment-integrity-20261009`, draft PR #103. This evidence is LOCAL ONLY; NO new GitHub Actions has run, no commit/push/merge/production release, no Vercel marker change.
- Full Next.js 16.3.8 **production-build** Chromium suite on disposable PostgreSQL 17 `gospots_e2e_w1_production`: **24/24 PASS, 0 FAIL, 3.6 min**, 1 worker, `--fail-on-flaky-tests`. E2E-04 and E2E-06 both passed within the complete suite; E2E-04 separately passed 1/1 on another disposable database and E2E-06 separately repeated 3/3. Production gateway: temporary loopback script OUTSIDE REPOSITORY (ports 3000->3001 web, 3000/api->4000 API).
- The API's earlier restart was rejected by desktop tool inline-command safety checks; starting the identical temporary local-test environment through a PowerShell script located OUTSIDE REPOSITORY was authorized/successful. API `/api/v1/ready` returned HTTP 200. No production credential or service used.
- Canonical browser/database financial assertions **PASS** against the same database after 24 browser cases, including captured provider operation/settlement, card/cash split, exactly one succeeded refund with equal allocation, replay and UNKNOWN-to-CAPTURED. The old canonical fixed idempotency-key fixture was updated to resolve the latest run-specific key by prefix and verify that exact key has exactly one provider operation. Financial assertions were NOT removed.
- Same database independent-connection PostgreSQL refund suite: **28 assertions PASS** (competing requests, two successful halves, pending/UNKNOWN reservation, retry, failure, cross tenant and rollback). Same database RLS matrix: **11 tables PASS** (two shops, unprivileged role, foreign row read/update/outbox INSERT denial and context reset).
- API 110/110 suites, 521/521 tests PASS from latest previous local regression; API build, web production build, web TS typecheck, and PostgreSQL 115 migrations+seed PASS. New 23 original planning Markdown files verified as matching documentation commit `0a0634962aee8ef462d0beddbc5086bc5f275628` without duplicates or overwrites. No lockfile/release marker edits.
- Manual whole-file lint debt: web changed-file ESLint 6 errors/6 warnings (existing React effect patterns), API payment-domain test mock lint 121 errors/2 warnings, browser-helper/spec lint 31 errors. These must NOT be represented as clean; CI `ci.yml` requires changed API *production* lint while full API lint debt report is `continue-on-error`. Keep typed lint cleanup separately if not required by this Wave1 runtime scope.
- T-002 payment SOFTWARE evidence strong, not fully ACCEPTED before exact-new-commit CI / external Adyen validation. T-003 timezone SOFTWARE evidence strong, email/notification integration signoff pending; not fully ACCEPTED. T-006 security matrix PARTIAL: RLS production-default-off decision and broader worker/role/export security remain; NOT ACCEPTED. Seven prior lower-severity advisories separately tracked (5 moderate+2 low).

## Final checkpoint pre-approval verification (local only; 2026-10-11)
- REQUIRED changed API production-source lint (payment-domain.service.ts and provider-checkout-refund.service.ts) `pnpm ... eslint`: **PASS / exit 0**. Web `tsc --noEmit`: PASS / exit 0. Direct optional/manual whole-file eslint debt remains separately OPEN (test mocks and pre-existing React effect-state patterns); no policy suppressed.
- Confirmed exact local/remote parent `5009e114aa4a408b9488934f611e0e1172425f55`. Exactly **15 tracked modified + 32 new = 47** paths. Exactly **23/23** original Markdown plans, **zero SHA differences and zero extra/duplicate files**. `pnpm-lock.yaml` and `apps/web/.vercel-release` unchanged. `git diff --check` PASS, simple new-code secret-pattern scan zero hits; no claim that scan replaces GitHub SAST.
- Local functional evidence: full production Chromium **24/24 PASS**, canonical PostgreSQL persisted assertions PASS, independent-connection refund **28/28**, 11-table tenant-RLS PASS, API Jest prior **521/521**, web production build/typecheck PASS and 115 migrations PASS. External certification and exact-head GitHub CI still missing. Only request authorization for ONE consolidated development branch push; do not merge, deploy production, or push additional checkpoints.

## GitHub Wave 1 CI recovery — 2026-10-11
- Verified published branch HEAD `0f6ee713458ccf545d652926b7bc58a08439b5af` (tree `7b0c8272f565b86d283b21ce7968c94196f1f41f`), PR #103 DRAFT, `main` unchanged at `b3e444e4deed5b9392c947f7d9b130a118897738`.
- GitHub Actions: **11/12 workflows, 19/20 checks passed**. CI run `38137361391`, job `114463860135`, stopped at changed API lint `prisma/e2e-refund-concurrency.ts:95 @typescript-eslint/require-await`; its full API Jest and build **SKIPPED**, not passed. Minimal fixture correction: `isFeatureEnabled: () => Promise.resolve(true)`; follow-up exact-SHA CI is PENDING and must be evaluated separately.
- Phase17 run `38137361390`: 24/24 permanent browser tests PASS, independent 28 PostgreSQL refund-concurrency assertions PASS, 11-table tenant-RLS matrix PASS, production dependency audit zero critical/high PASS. Independent CI browser suite 24/24 PASS. Five moderate and two low advisories remain.
- Formal Wave1 acceptance remains **0/3**: T-002 and T-003 require final evidence, T-006 broader security review / RLS policy remains PARTIAL. Real Adyen, outbound email/calendar, Poland fiscal and physical venue certifications are not established by CI.
- Owner explicitly authorized ONE minimal development-branch correction/evidence commit and push after verifying the expected parent; no main merge, production action or further push authorized. Vercel release marker unchanged. GitHub evidence: https://github.com/EIAS79/GoSpots/pull/103#issuecomment-6108799605

## 2026-10-12 — W1/W2 LOCAL UNPUSHED TARGETED BATCH
- Latest **PUBLISHED/CI-VERIFIED** development head `57cd0b1cfed036a69641219c1ae56e0ff78d3352`; 13/13 workflows and 21/21 GitHub checks PASS. PR #103 remains draft; main not merged. No additional commit, push or production deployment authorized.
- **LOCAL PROPOSED/UNPUSHED**: T-003 reminder venue-local link/time changes, T-006 immutable nested RLS context and Jest negatives, staging-only fail-closed SQL candidate and documented rollout. Isolated Node smoke harness PASS 6/6; this is NOT repository Jest/PG17/browser CI and does not prove acceptance. Source edit applicator validates exact source anchors before writing.
- T-002 remains prior-code software-CI-verified (521 Jest, 24+24 browser, PG refund 28, RLS 11); physical Adyen/payout and reviewer acceptance separate. T-004: two Render main services, Vercel project, Neon primary observed; actual runtime connection fingerprints/Adyen merchant remain unproven.
- Acceptance remains pending for T-002/T-003/T-006. Desktop Commander unavailable owing to monthly limit; local container lacks reachable Git remote and full checkout. No new GitHub CI possible until the batch is applied in an authorized checkout and a push is explicitly approved.

### 2026-10-13 — ACTUAL repository checkout and disposable-DB pre-push verification (supersedes earlier local-blocked statements)
- Isolated Vercel development sandbox `gospots-wave1-20261013` checked out full `EIAS79/GoSpots` at exact parent `57cd0b1cfed036a69641219c1ae56e0ff78d3352`. Clean before applying; 23 engineering plans intact. Exactly 12 intended local paths changed; no push, merge, production deploy or release-marker modification as of this record.
- Actual repository API Jest after test-harness corrections: **113/113 suites, 536/536 tests PASS**. Changed production and new spec ESLint: **PASS**. API production build: **PASS**; `tsc --noEmit -p tsconfig.build.json`: **PASS**. Full `tsc --noEmit -p tsconfig.json` is **NOT GREEN** due to seven existing unrelated Prisma script diagnostics in untouched `prisma/phase9*` / `prisma/phase10*` files. Do not call the entire TypeScript tree clean.
- Disposable LOCAL PostgreSQL **18.6**: fail-closed SQL candidate verified missing-context deny, shop A/B isolation, unprivileged system/bypass denial, rollback/reset. Actual Prisma `withTenantRls` nested transaction integration verified matching context, concurrent cross-tenant/mode rejection before SQL, pool reset and exception rollback. This is NOT 17.x CI validation. RLS production setting unchanged and default off; both candidate SQL documents are **not migrations**.
- T-003, T-006 updated software paths are locally implemented and verified by Jest plus sandbox PostgreSQL, but **NOT exact-new-SHA GitHub CI** and **NOT signed software accepted**. T-002 application code unchanged; previous published SHA provider/refund/28-assertion evidence stands. T-004 GoSpots Render services identified with Vercel/Neon metadata; deployed database and Adyen merchant identities remain unproven without non-secret runtime fingerprint / external identity review. Keep formal ticket acceptance pending.
- Existing 7 nonproduction Prisma TypeScript errors are documented legacy debt, not fixed or suppressed as part of this restricted 12-file batch. No financial transactions, infrastructure config changes or production data access occurred.
