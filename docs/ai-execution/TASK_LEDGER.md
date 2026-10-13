# GoSpots — Work Package Ledger

Source: 2026-10-09 continuation kit T-001–T-017 and live main `b3e444e4deed5b9392c947f7d9b130a118897738`. These statuses are **current session classification**, not retrospective phase completion.

| Ticket | Wave | Status | Current evidence / next gate |
|---|---|---|---|
| T-001 | W0 | IN_PROGRESS | Main protection disabled; exact RC release manifest pending administrator action |
| T-002 | W1 | IN_PROGRESS | Direct MANUAL_CARD route isolated; focused CI and real provider regression remain |
| T-003 | W1 | NOT_STARTED | Format booking times in Shop.timezone; reconcile PR #95; DST tests |
| T-004 | W0/W2 | BLOCKED_EXTERNAL | GoSpots Vercel/Render/Neon/Adyen account and deployment IDs not accessible here |
| T-005 | W0 | IN_PROGRESS | Open PR #7/#92/#95/#100 disposition, dev.db review, lockfile policy pending |
| T-006 | W1 | NOT_STARTED | Tenant/IDOR, background worker and RLS negative-test campaign pending |
| T-007 | W2 | BLOCKED_EXTERNAL | Physical Adyen device/capture/recovery/refund certification pending |
| T-008 | W2 | BLOCKED_EXTERNAL | Poland fiscal device, official KSeF and expert legal signoff pending |
| T-009 | W2 | BLOCKED_EXTERNAL | Edge/KDS/printer physical outage drills pending |
| T-010 | W2/W3 | NOT_STARTED | Current RC DR/performance/security full campaign and pilot evidence pending |
| T-011 | W2/W4 | NOT_STARTED | Unmatched capture reconciliation first; bank/payout feature depth later |
| T-012 | W4 | NOT_STARTED | PO/receipt/supplier invoice three-way matching proof required |
| T-013 | W4 | NOT_STARTED | Food safety/allergens/batch/cleaning evidence scope |
| T-014 | W4 | NOT_STARTED | Facility maintenance and closure trail scope |
| T-015 | W4 | NOT_STARTED | Merchant onboarding, migration, helpdesk and merchant exit scope |
| T-016 | W5 | DEFERRED | Full statutory accounting and payroll: optional, separate approval |
| T-017 | W3/W4 | NOT_STARTED | Per-vertical/geography/provider/hardware support evidence matrix |

**Required discipline:** All T statuses must be rechecked against exact-HEAD source and tests; NOT_STARTED means no accepted new ticket work recorded in this continuation, not proof the underlying feature is absent.


## W1 consolidated checkpoint — 2026-10-10

| Ticket | Wave | Status | Evidence / remaining gate |
| --- | --- | --- | --- |
| T-002 | W1 | IMPLEMENTED / CI_PENDING / NOT ACCEPTED | HTTP 403 on generic MANUAL_CARD, atomic provider capture linkage, browser fixture correction, role and payment-invariant regressions; verify exact SHA API + six browser tests and provider recovery |
| T-003 | W1 | IMPLEMENTED / CI_PENDING / NOT ACCEPTED | staff/public/email/href venue TZ rendering, UTC midnight, DST spring/fall; verify live integration and PR #95 scope separately |
| T-006 | W1 | PARTIAL / CI_PENDING | checkout/provider shopId/currency and permission-negative cases added; broader RLS/IDOR/worker/roles matrix outstanding |
| T-010/P17 | Later wave | BLOCKED | high/critical pnpm production advisories; independent dependency remediation and green release gate required |

Branch `agent/gospots-payment-integrity-20261009` parent `72ee6dc1791d0280426bad98dbdeedeb3d8b74cd`. New SHA is the HEAD containing this ledger. Browser tests, full build and deployment certification are not claimed from standalone tests.

## W1 local remediation status — 2026-10-10 (uncommitted)

| Ticket | Status | Local acceptance evidence | Still required |
| --- | --- | --- | --- |
| T-002 | IMPLEMENTED / LOCAL TESTS PASS / NOT ACCEPTED | Provider captured/duplicate/declined/UNKNOWN/mismatch/finalization-failure unit tests PASS, checkout Jest PASS, prior exact-parent browser 21/21 PASS | New exact-SHA API+E2E with full provider capture lineage and integration |
| T-003 | IMPLEMENTED / LOCAL TESTS PASS / NOT ACCEPTED | New mail text/HTML DST cases, staff/public notification service wiring, URL safe input + Warsaw/New York date tests PASS | New SHA CI, live integration and timezone browser verification |
| T-006 | PARTIAL / LOCAL TESTS PASS | Prior foreign-settlement/denied actor/cancel/refund tests PASS; new outbox rejects conflicting payload shopId and preserves matching tenant | Full RLS/IDOR/worker/role negative matrix and database-backed isolation |
| Phase17 security | CRITICAL/HIGH LOCALLY RESOLVED / REMOTE PENDING | pnpm frozen lockfile + audit high pass; web and API builds PASS | Exact new SHA Linux CI Phase17 gate; 5 moderate + 2 low separately unresolved |

Branch: `agent/gospots-payment-integrity-20261009`. Parent commit: `cfd703e6e9e964e913abcc09583f218d93b84fd1`. No remote writes this session. No ticket marked fully COMPLETE or release-certified.

## W1 acceptance trace — 2026-10-11 (unpublished working tree)
| Ticket | Local implementation | Evidence status | Release blocker |
| --- | --- | --- | --- |
| T-002 | Fake-provider checkout capture+cash split+refund E2E, DB conservation, refund replay/list scope | Existing 5009e baseline 516 Jest & 21 browser tests green; NEW PG test NOT_RUN | Exact-new-SHA PG17, signed Adyen provider/device independently |
| T-003 | Strict venue wall → UTC, DST gap/overlap fail-closed, staff/public dialog, venue dining hold | 5/5 local converter tests and web typecheck PASS; NEW browser scenario NOT_RUN | External/browser parity of email/calendar/staff confirmation |
| T-006 | Cross-shop REST negative + explicit unprivileged PG17 RLS matrix / tenant context reset | NEW PG17 test NOT_RUN; existing actor/outbox tests pass | Full RLS, worker, export/role matrix + review; stays PARTIAL |
| Phase17 audit | No dependency changes this wave | Last remote high/critical=0, remaining moderate=5 low=2 | Track lower-severity advisories separately |
Documentation import: exactly 23 original workstream files from `0a063496...`, uncommitted. No acceptance signoff; crosswalk in `W1_2026-10-11_ACCEPTANCE_EVIDENCE_DRAFT.md`.

## Wave1 browser blockers — evidence update 2026-10-11 (local only)
| Ticket | Verification | Remaining gate |
| --- | --- | --- |
| T-002 | Real PG17 provider capture/split/refund browser case PASS; 28 independent-connection refund concurrency assertions PASS, full API 521/521; E2E-06 UNKNOWN reconciliation 3/3 repeated PASS and invalid-CSRF denial asserted | Full 24 browser cases in production build on fresh seeded DB; canonical DB assertions at next SHA; exact-new-SHA CI, live provider/device certification separately |
| T-003 | 5/5 IANA/DST tests; staff/public venue timezone conversion; traveling-user browser PASS; earlier email/notification API cases retained | Production suite and PR95 viewer parity reconciliation; exact-new-SHA CI, visual/email end-to-end signoff |
| T-006 | Cross-shop POST/read/refund browser negative PASS; PG17 11-table unprivileged RLS plus outbox forged insertion, denied update, context-reset PASS | Complete roles/exports/workers authorization matrix, RLS default-off rollout decision, exact-new-SHA remote security CI |
| E2E-04 | Original offline refresh, IndexedDB durability and exactly-once replay browser test PASS 1/1 against production frontend; dev-mode 24-suite earlier failure 1/1 | Fresh production 24 browser suite rerun; full-suite non-flakiness |
| E2E-06 | Venue-gate CSRF rotation race prevented in test helper; forged-CSRF 403/no device; unique cross-run key; repeat 3/3 PASS | Full 24 production CI regression |
No T-002/T-003/T-006 COMPLETE claims. No audit-bypass or remote write. Seven moderate/low advisories remain separately open.

## 2026-10-11 FINAL LOCAL ACCEPTANCE EVIDENCE — checkpoint request pending
| Key | Local evidence at unpushed worktree | Acceptance |
| --- | --- | --- |
| E2E permanent browser | 24 PASS / 0 FAIL production Next 16.3.8, 3.6m, PG17, --fail-on-flaky-tests | LOCAL VERIFIED, exact SHA CI pending |
| E2E-04 offline lite | Pass in full suite, separate pass 1/1 in independent production build/local gateway; IndexedDB refresh + exactly-one replay assertions unchanged | LOCAL VERIFIED; device/offline hardware separate |
| E2E-06 UNKNOWN | Pass full suite; 3/3 repeat separately; forged CSRF 403 and no device writes; successful UNKNOWN reconciliation | LOCAL VERIFIED; real terminal separate |
| T-002 | Checkout provider split/card/cash/refund browser PASS, canonical PG17 persistence PASS, independent refund concurrency 28/28 PASS, full API 521/521 PASS | NOT COMPLETE: remote CI, real Adyen and payout proof |
| T-003 | strict venue ISO UTC time, public/staff/traveling UI, 5/5 DST cases and E2E travel PASS; existing notification tests API suite pass | NOT COMPLETE: end-to-end email/calendar confirmation/evidence |
| T-006 | cross-venue browser PASS, RLS PG17 11 tables, forged outbox INSERT, foreign update/read and reset PASS | PARTIAL/OPEN: expanded worker/roles/export checks, default-off security decision and review |
| Local builds/migrations | API build, web prod build/typecheck, 115 PG17 migration apply and seed PASS | LOCAL only |
| Lint | Required CI changed-API-production lint scope tracked; manual direct full web 6 errors/6 warnings, API test mocks 121 errors/2 warnings, E2E helpers 31 errors; full API lint debt step continue-on-error | Non-gating lint debt OPEN, not suppressions |
GitHub draft PR #103 untouched; 23 source-exact plans imported locally; no production changes; 7 moderate/low advisories separate.

## Final checkpoint pre-approval verification (local only; 2026-10-11)
- REQUIRED changed API production-source lint (payment-domain.service.ts and provider-checkout-refund.service.ts) `pnpm ... eslint`: **PASS / exit 0**. Web `tsc --noEmit`: PASS / exit 0. Direct optional/manual whole-file eslint debt remains separately OPEN (test mocks and pre-existing React effect-state patterns); no policy suppressed.
- Confirmed exact local/remote parent `5009e114aa4a408b9488934f611e0e1172425f55`. Exactly **15 tracked modified + 32 new = 47** paths. Exactly **23/23** original Markdown plans, **zero SHA differences and zero extra/duplicate files**. `pnpm-lock.yaml` and `apps/web/.vercel-release` unchanged. `git diff --check` PASS, simple new-code secret-pattern scan zero hits; no claim that scan replaces GitHub SAST.
- Local functional evidence: full production Chromium **24/24 PASS**, canonical PostgreSQL persisted assertions PASS, independent-connection refund **28/28**, 11-table tenant-RLS PASS, API Jest prior **521/521**, web production build/typecheck PASS and 115 migrations PASS. External certification and exact-head GitHub CI still missing. Only request authorization for ONE consolidated development branch push; do not merge, deploy production, or push additional checkpoints.

## W1 exact-head CI recovery gate — 2026-10-11
| Ticket/gate | Current verified evidence | Outstanding acceptance |
| --- | --- | --- |
| T-002 | Provider/cash split and refund browser tests in two independent 24/24 suites; independent PostgreSQL refund concurrency 28 assertions; persisted payment/settlement assertions pass at `0f6ee713` | Full API Jest/build blocked by one lint failure at this SHA; real Adyen and settlement/payout acceptance separate; NOT ACCEPTED |
| T-003 | IANA/DST/traveling-user browser and API prior evidence, 24/24 browser on last published SHA | Outbound email/calendar end-to-end and PR #95 reconciliation; NOT ACCEPTED |
| T-006 | Cross-tenant browser negative tests and 11-table PostgreSQL RLS matrix executed in Phase17 | Roles/worker/outbox/export/SSE/cache negative breadth, RLS default-off rollout decision, independent security review; PARTIAL |
| GitHub required CI | 11/12 workflows and 19/20 checks PASS at `0f6ee713`; API changed-lint fails `require-await` at refund test harness line 95 | One-line Promise-returning mock correction; exact-new-SHA lint/full API Jest/build NOT YET VERIFIED |
| Phase17 dependency policy | 0 high/critical production advisories; five moderate/two low remain | Lower-severity follow-up separate; not go-live certification |
Owner authorizes one consolidated follow-up development commit only. No signed Wave1 ticket acceptance (0/3), main merge, real payment, fiscal action, production deploy or further push. Source: https://github.com/EIAS79/GoSpots/pull/103#issuecomment-6108799605

## 2026-10-12 — unpushed W1 focused batch ledger
| Item | Implemented in exact-head patch recipe | Locally tested | New-SHA CI | Software acceptance |
| --- | --- | --- | --- | --- |
| T-003 reminders | Venue IANA zone per cron phase; calendar-day href + clock with DST offset; new Jest regressions | Isolated logic 2/2; repo Jest blocked | NOT RUN | PENDING integration/delivery review |
| T-006 nested RLS | No cross-shop/mode switching in shared interactive transaction; rejection before SQL; concurrency/rollback/missing-context Jest regressions | Isolated logic 4/4; repo Jest/PG17 blocked | NOT RUN | PENDING full security matrix + role review |
| T-006 notifications | SSE cross-shop/user, scoped CSV export, foreign IDOR and owner-only destructive action new Jest tests | Repo Jest NOT RUN | NOT RUN | PENDING independent wider worker/cache/admin verification |
| T-006 SQL rollout | Disposable-only opt-in candidate and negative-query skeleton; no auto Prisma migration, production default unchanged | Static only; PG17 and connection-pool probe NOT RUN | NOT RUN | NOT ACCEPTED |
| T-002 | No source modifications; previous exact-SHA provider/refund/concurrency/software evidence preserved | Previous exact-SHA CI passed | Previous SHA PASS, this batch NOT RUN | PENDING signoff; physical provider/payout under W2 |
| T-004 | Read-only Render/Vercel/Neon identity inventory, Adyen route discovery | Nonsecret API reads | Not applicable | Mapping provisional pending deployed config fingerprint |

### 2026-10-13 — ACTUAL repository checkout and disposable-DB pre-push verification (supersedes earlier local-blocked statements)
- Isolated Vercel development sandbox `gospots-wave1-20261013` checked out full `EIAS79/GoSpots` at exact parent `57cd0b1cfed036a69641219c1ae56e0ff78d3352`. Clean before applying; 23 engineering plans intact. Exactly 12 intended local paths changed; no push, merge, production deploy or release-marker modification as of this record.
- Actual repository API Jest after test-harness corrections: **113/113 suites, 536/536 tests PASS**. Changed production and new spec ESLint: **PASS**. API production build: **PASS**; `tsc --noEmit -p tsconfig.build.json`: **PASS**. Full `tsc --noEmit -p tsconfig.json` is **NOT GREEN** due to seven existing unrelated Prisma script diagnostics in untouched `prisma/phase9*` / `prisma/phase10*` files. Do not call the entire TypeScript tree clean.
- Disposable LOCAL PostgreSQL **18.6**: fail-closed SQL candidate verified missing-context deny, shop A/B isolation, unprivileged system/bypass denial, rollback/reset. Actual Prisma `withTenantRls` nested transaction integration verified matching context, concurrent cross-tenant/mode rejection before SQL, pool reset and exception rollback. This is NOT 17.x CI validation. RLS production setting unchanged and default off; both candidate SQL documents are **not migrations**.
- T-003, T-006 updated software paths are locally implemented and verified by Jest plus sandbox PostgreSQL, but **NOT exact-new-SHA GitHub CI** and **NOT signed software accepted**. T-002 application code unchanged; previous published SHA provider/refund/28-assertion evidence stands. T-004 GoSpots Render services identified with Vercel/Neon metadata; deployed database and Adyen merchant identities remain unproven without non-secret runtime fingerprint / external identity review. Keep formal ticket acceptance pending.
- Existing 7 nonproduction Prisma TypeScript errors are documented legacy debt, not fixed or suppressed as part of this restricted 12-file batch. No financial transactions, infrastructure config changes or production data access occurred.
