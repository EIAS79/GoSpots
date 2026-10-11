# GoSpots W1 acceptance evidence — local unpushed draft (2026-10-11)

## Immutable references
- Repository `EIAS79/GoSpots`; working branch `agent/gospots-payment-integrity-20261009`; draft PR #103.
- Last **remote-verified** SHA `5009e114aa4a408b9488934f611e0e1172425f55`; seven GitHub workflows and 15 checks passed there. Nothing from this local work has been pushed or is accepted at a new SHA.
- Original 23 engineering plans: `docs/gospots-venue-os-plans-20261011` at `0a0634962aee8ef462d0beddbc5086bc5f275628`; read-only fetched and verified, exactly 23 documentation-only paths. Originals imported into isolated checkout without commit; verify HEAD again before integrating.
- Canonical source hierarchy: master P0–P17, readiness R0–R15, six waves, T-001–T-017, and supplementary plans 00–22. Packet workstreams are not an invented P18.
- Expected next checkpoint status: `NEEDS_TEST`, not VERIFIED, until exact-head GitHub PG17, E2E, API, web and security gates pass.

## T-002 payment software boundary — evidence status
Scenario B02/B03/B04/B05/B07/B08/B10 from plan 22. New `apps/web/e2e/integrity/wave1-checkout-provider.spec.ts` drives real Nest HTTP + disposable PostgreSQL with the deterministic fake connector: captured provider operation, atomic checkout card linkage, two-tender split, retry idempotency and re-used-key amount conflict, full provider refund and replay, cross-tenant refund denial. Extended `apps/api/prisma/e2e-assert.ts` verifies persisted card/cash conservation, one confirmed linked provider operation and only one succeeded refund with matching allocation. Existing Adyen signed HMAC/merchant/deduplication tests preserved in `adyen-terminal-webhook.controller.spec.ts`. `ProviderCheckoutRefundService` now returns same-key full-refund responses and denies foreign settlement listing; negative Jest spec added.
- Baseline before these changes: exact-head API 516/516 and browser 21/21 each. This new E2E/PG contract is **NOT EXECUTED yet**; local unit and TypeScript tests are not sufficient to accept B02/B05/B08 in a real Adyen test environment. Production/physical terminal is separate T-007 external certification.
- Refund idempotency and foreign-list guard are implementation changes requiring fresh exact-SHA CI.

## T-003 booking timezone — evidence status
Scenario D04/D05/D06. Compared PR #95 HEAD `27ea9eed8da1a096998b036a963e95d7b37b755d`: that PR uses viewer/device-local conversion and does not explicitly reject gap/overlap. Do not merge blindly. Local `venue-booking-datetime.ts` converts an IANA venue wall time to UTC, rejects ambiguous/nonexistent DST inputs, and formats UTC instants back to venue date/time. Staff and public booking dialogs now use shop timezone; public dining no-show interval uses elapsed UTC minutes, venue-based default time. Editing unchanged existing reservation retains its original authoritative ISO instants. New timezone tests: 5/5 PASS on local Node 24; web typecheck PASS. Existing API staff/public/email/timezone CI at prior SHA remains green. New exact-SHA full browser integration is pending.

## T-006 tenant isolation — evidence status
Scenarios A01–A05, A07/A10. New `apps/web/e2e/integrity/wave1-tenant-payment.spec.ts` exercises authenticated tenant A versus shop B REST read/write/settlement/payment/provider/refund boundaries with no payment-state mutation. Existing negative payment/outbox Jest suites preserved. New `apps/api/prisma/e2e-tenant-assert.ts` requires explicit disposable-DB marker; tests TENANT mode under separate unprivileged PostgreSQL role with 10 financial/event tables, row visibility in two shops, forbidden cross-tenant UPDATE, unchanged financial state, and context-reset across transactions. Wired only to disposable Phase 17 PostgreSQL E2E gate; production RLS default unchanged. These Postgres tests are **NOT EXECUTED yet** and broader penetration/worker/cache/export review remains; T-006 stays PARTIAL.

## Risks and certification limits
- The Windows workstation has no locally available Docker/PostgreSQL service. No shared Neon/Render from another project is used. No production financial actions, hardware, real Adyen money or fiscal transactions.
- The e2e app installs its Playwright harness separately; browser discovery/local checks must finish before checkpoint request. No GitHub Actions at the new code until authorized push.
- Real Adyen HMAC/capture/refund/terminal certification, merchant identity and production payout/bank reconciliation are external/operational gates; simulated fake connector cannot sign them.
- RLS currently defaults off and policy helper fails open when GUC unset; test is active only under explicit tenant GUC. A fail-closed rollout decision requires independent review, staged migration/soak and risk acceptance.
- Seven production dependency findings (5 moderate + 2 low) remain tracked separately; last confirmed high/critical gate zero. Do not re-run baseline remediation or suppress audit.

## Next three tasks in dependency order
1. Run focused checks for this local delta (new provider refund Jest, venue DST Node tests, web/API typecheck, E2E discovery), then authorize a single checkpoint. After authorization run PG17-backed checkout/tenant E2E and verify exact-SHA CI; fix any failures locally and request new push authorization.
2. Complete T-006 cross-tenant negative matrix including background events/workers, webhook wrong merchant, optional SQL RLS-on/off decision and independent security review; complete T-003 traveling/browser receipt/email parity. Do not close tickets without current-SHA proof.
3. Only after Wave 1 software acceptance: dependency-order Wave 2 T-004 production identity → T-007 Adyen sanctioned test hardware → T-008 fiscal/KSeF certified vendor/accountant → T-009 Edge+KDS physical interruption → T-010 DR/performance/pilot readiness → T-011 payout exception console. Keep seven lower-severity advisories separate.

## Source crosswalk
- Plan 02: money authority/provider idempotency/refunds → T-002, E2E B02/B05/B07/B08, `financial-reconciliation-evidence.md` **not signed**.
- Plan 05: UTC/venue-local/DST and PR #95 → T-003, D04/D05/D06, `venue-timezone-business-day-contract.md` **not signed**.
- Plan 11: tenant RLS/off + compensating controls → T-006, A01–A10, `tenant-isolation-and-rls-decision-record.md` **not signed**.
- Plan 16/18/22: exact-SHA evidence; retain `NEEDS_TEST` and `EXTERNAL_BLOCKED` where appropriate, no claimed P0–P17/R0–R15 completion.


## Latest browser-blocker verification — 2026-10-11 (additional local evidence; no GitHub push)

E2E-06 root cause: overlapping venue-gate session POST and test fixture API mutation. The venue-session POST rotates the CSRF double-submit cookie. `bindVenue` now waits for successful mounted gate binding; the test proves invalid `x-csrf-token` returns HTTP 403 `CSRF_INVALID` and does not create a device. Original fixed cross-run idempotency key was also replaced with a unique per-test key, without changing same-key retry semantics. Isolated browser test repeated **3/3 PASS**. CSRF guard remains mandatory.

E2E-04 root cause isolated to test-server selection: a Turbopack development-server offline reload showed a partially rendered image-only shell. Re-tested the **unchanged offline-lite.spec.ts** using actual production Next.js 16.3.8 build, a local same-origin reverse-proxy harness outside the repository and disposable PostgreSQL 17, with **1/1 PASS**. The original IndexedDB refresh persistence and exactly-once replay assertions remain. Production build PASS. The application production API_PROXY_TARGET localhost protection remains enabled, with non-local placeholder at build and loopback only in temporary test gateway.

Historical local full browser run on development server was **22 PASS / 2 FAIL** (E2E-06, E2E-04), before corrections. A new disposable `gospots_e2e_w1_production` database completed all 115 migrations and E2E seeding, but the remote desktop tool blocked the subsequent API restart, so **DO NOT CLAIM a fresh production 24/24 PASS**. Local full API Jest last completed **110/110 suites and 521/521 tests PASS**; independent PG17 refund **28 assertions PASS**, RLS **11 tables PASS**, timezone utility **5/5 PASS**, additional T-002/T-003/T-006 browser scenarios passed individually. No exact-new-head GitHub CI has run.

Manual ESLint against the two E2E TypeScript files reported **31 `no-explicit-any` errors in existing type-weak test-helper/spec lines**; this non-gating lint debt is not represented as PASS. `git diff --check` PASS and the required changed-production API lint was previously PASS. No lint rules or tests disabled. Recheck complete modified-file scope before checkpoint.

Remaining requirement: production mode complete 24-scenario browser suite, repeated Offline Lite on isolated seed, fresh canonical DB assertions, RLS/app negative matrix, and exact-new-SHA CI. T-002/T-003 are locally supported but **NOT ACCEPTED**, T-006 remains PARTIAL/OPEN. No commit or push authorization exists for this delta; no merge or production deployment.

## FINAL LOCAL RUN — 2026-10-11 (not remote CI)
- Full 24/24 release-style Playwright Chromium production Next.js build, PG17 disposable database, --fail-on-flaky-tests, 3.6 minutes, no failures. Includes E2E04 offline and E2E06 UNKNOWN, T002 provider/split/replay/refund, T003 traveling-user display, T006 cross-tenant REST. E2E06 separate 3/3 repeat; offline separate production-build 1/1. Session-bind CSRF race corrected and forged-CSRF 403/no-write asserted. Offline persistence test assertions unchanged.
- Canonical database E2E assertions on SAME seeded database PASS; fake provider UNKNOWN lookup uses unique browser key prefix and exact matching count 1. Real transaction concurrency 28 PASS; direct PG17 tenant-RLS 11-table PASS. API Jest 521/521 prior verified; API build/web production build/web typecheck/115 migration apply PASS.
- Full whole-file ESLint debt remains (see CURRENT_STATE.md), not a claimed pass; CI changed-production-file API lint is separate required check. No credentials, production endpoints, release marker or lockfile added as part of current source scope; docs original hashes remain exact. T002/T003 NOT COMPLETE, T006 PARTIAL. Await explicit approval for one consolidated commit/push; no GitHub CI results exist for current local delta.
