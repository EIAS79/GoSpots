# GoSpots — Work Package Ledger

Source: 2026-10-09 continuation kit T-001–T-017 and live main `b3e444e4deed5b9392c947f7d9b130a118897738`. These statuses are **current session classification**, not retrospective phase completion.

| Ticket | Wave | Status | Current evidence / next gate |
|---|---|---|---|
| T-001 | W0 | IN_PROGRESS | Main protection disabled; exact RC release manifest pending administrator action |
| T-002 | W1 | SOFTWARE_VERIFIED_SIGNOFF_PENDING | 28 PG17 refund assertions and strict E2E verified at parent; Adyen hardware, payout and signed acceptance external |
| T-003 | W1 | SOFTWARE_INTEGRATION_IN_PROGRESS | Public/staff outbound-mail boundary tests pass with mocked transport across host timezones and DST; real SMTP/calendar signoff pending |
| T-004 | W0/W2 | READ_ONLY_MAPPING_IN_PROGRESS | Render, Neon and Vercel IDs known; fingerprint tool built; actual service/database/merchant links unverified |
| T-005 | W0 | IN_PROGRESS | Open PR #7/#92/#95/#100 disposition, dev.db review, lockfile policy pending |
| T-006 | W1 | SECURITY_IN_PROGRESS | 11 PG17 tenant tables verified at parent, new background concurrency tests pass; full role/cache/SSE/export/IDOR soak and independent review open |
| T-007 | W2 | TEST_PREFLIGHT_VERIFIED | Offline Adyen test-terminal readiness tested, physical device/webhook/provider acceptance pending |
| T-008 | W2 | SANDBOX_ENDPOINT_GUARD_VERIFIED | KSeF official TEST/DEMO/PRD host routing tested, live sandbox token/fiscal and accountant approval pending |
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

### 2026-10-13 — LOCAL CHECKPOINT FINAL VALIDATION (UNPUSHED)
- Verified complete clean-at-parent Git worktree `/vercel/GoSpots-wave2`; HEAD remains `17e1403dfa39b4e5ed86193b935ec091967cb108`. Exactly 15 paths locally changed; all 23 existing engineering plan files preserved. No source push/merge/deploy or release-marker modification.
- Complete API Jest **118/118 suites, 565/565 tests PASS**. Changed-source/test ESLint **PASS**, production typecheck `tsc --noEmit -p tsconfig.build.json` **PASS**, API build **PASS**; read-only runtime fingerprint CLI **PASS**. Added targeted tests: 4 outbound mail transport, 3 concurrent tenant worker/ALS, 3 runtime fingerprint, 8 Adyen TEST preflight, 11 KSeF sandbox routing assertions. Do not claim exact-new-SHA GitHub CI for this local-only batch.
- Existing parent CI `17e140...` is green (13/13 workflows, 21/21 checks); previous refund 28-assertion PG17 and 11-table RLS evidence retained without unnecessary payment reruns.
- **NOT SOFTWARE ACCEPTED YET** without owner/security signoff: remaining T-003 real SMTP+calendar client evidence, T-006 role/IDOR/export/SSE/cache/pool cross-tenant pen-test matrix and RLS rollout decision, T-002 payment finance acceptance attestation. Wave2 T-004 fingerprint collection from actual Render runtimes; T-007 physical Adyen TEST-terminal and webhook certification; T-008 official KSeF sandbox/physical fiscal/accountant signoff.
- The test logs are within this sandbox at `/tmp/gospots_w2_{full_jest,final_lint,prod_tsc,api_build,identity_cli}.log`; the consolidated binary patch is saved outside Git at `/vercel/gospots_wave2_20261013_unpushed.patch` (hash recorded in next session after generation). A new checkpoint push is **NOT AUTHORIZED**.

## 2026-10-14 — W1 local pre-push delta at published SHA 7663a7f (UNCOMMITTED)
| Ticket | IMPLEMENTED / TESTED | VERIFIED | ACCEPTED / EXTERNAL BLOCKER |
| --- | --- | --- | --- |
| T-006 | Notification mutator RBAC and atomic actor restrictions; 2 new Jest tests; 22 assertions on disposable PostgreSQL 18.6 with 2 shops and unprivileged role | Focused 7 suites / 33 tests; historical PG17 11-table matrix | NOT ACCEPTED: new fixture not yet run on PG17; independent full endpoint/role/export/stream/worker review and RLS rollout soak pending; production default off |
| T-003 | New fake-credential loopback Resend HTTP sink; three booking states plus 503/outbox retry 4/4; previous DST/staff/public/reminder tests | Focused tests green | NOT ACCEPTED: real email deliverability, actual calendar-client checks and stakeholder signoff external |
| T-002 | Finance-owner signoff checklist; no financial code modification | Historical exact-SHA 28 PG17 refund assertions, 24+24 browser, 565 API Jest | Software implementation verified; finance-owner acceptance pending. Physical terminal/payout W2 |
| T-004 | Read-only Vercel aliases, Render live commit, Neon primary branch and env metadata | Vercel frontend 8f07715a, Render Frankfurt b3e444e, Neon br-lucky-wave-aln8lhk8 ready | NOT ACCEPTED: actual frontend API proxy, Render database and Adyen identities unknown |
- No GitHub writes or exact-new-SHA CI. Await authorization for one development-branch commit/push after local validation.

### 2026-10-14 — Supervisor security follow-up before publication
- T-006 `unarchive()`: **IMPLEMENTED + TESTED**, missing notification permission now checked before zero-result return or mutation; staff denied on ids, allMatching and no-op, authorized owner/staff shop/recipient/archived predicates verified. Notification-boundary suite 8/8, seven focused suites 35/35 total; PG18 22/22.
- New standalone PG18 integration **NOT CI-WIRED**: existing `.github/workflows/phase17-validation.yml` invokes the distinct PG17 `prisma/e2e-tenant-assert.ts`. Adding a workflow path would exceed approved nine-file scope. PG17 parity of new script is **NOT VERIFIED**. Preserve distinction after publication.

### 2026-10-14 — Local T-006 PostgreSQL 17 workflow certification readiness
| Ticket | IMPLEMENTED / TESTED | VERIFIED | ACCEPTED / EXTERNAL BLOCKER |
| --- | --- | --- | --- |
| T-006 | One gated Phase17 PostgreSQL17 isolated DB step; fail-closed standalone Prisma tenant fixture with 24 local assertions, SCRAM credential, success/failure cleanup. Notification code reviewed unchanged. | PG18.6 SCRAM 24 PASS, intentional failure NONZERO with role/table absent; static CI YAML & shell validation; PG17 CI NOT RUN | NOT ACCEPTED: one authorized push to obtain PG17 CI evidence; independent security owner review/RLS rollout separate |
| T-004 | Read-only alias/deploy/branch comparison; existing nonsecret runtime fingerprint utility inspected | Frontend deployment, Render LIVE SHA and Neon primary branch metadata only | UNVERIFIED: actual API_PROXY_TARGET, Render database host/branch, deployed Adyen environment/merchant |
| T-002 | Updated finance acceptance packet (no payment code edit) | SHA 3191946b exact-SHA 573 Jest/48 browser, 28 PG17 refund, 11-table RLS already green | Finance approver name/date/decision/exceptions pending; TEST terminal and payout W2 |
| T-003 | Test-recipient Resend/mailbox/calendar runbook (no transport code edit) | Published local HTTP sink DST/error/outbox regression only | Provider delivery, bounce/retry and manual Apple/Google/Outlook interpretation remain EXTERNAL |
- NO remote push, no new exact-SHA CI, no release or live change in this preparation batch.
- **Final local fixture (version pinned):** PG18.6 SCRAM 25/25 assertions PASS with `postgresMajor=18`, deliberately wrong expected major 17 NONZERO, setup fault NONZERO and cleanup checked. Existing Phase17 step pins expected PG major 17 and is gating; PG17 outcome NOT RUN.

### 2026-10-14 — Superseding W1 publication acceptance gate + bounded W2 readiness
- **T-006 W1 AUTOMATED VERIFIED / INDEPENDENT ACCEPTANCE PENDING:** development f7acffd6060c568e34f75164894a6be0ab975688, Phase17 run 38490169615/job 115613226953; PG17 25/25 true integration assertions SUCCESS, guarded cleanup; 13 workflows/20 jobs pass. Old local PG17-not-executed notes are now superseded for **this** published SHA. Production RLS disabled.
- **T-002 W1 VERIFIED / FINANCE OWNER SIGNOFF PENDING:** signed/date/exception cells remain blank. **T-003 W1 VERIFIED LOCAL / COMMUNICATIONS OWNER SIGNOFF PENDING:** Resend provider mailbox and calendar clients not certified.
- **T-004 W2 METADATA VERIFIED / END-TO-END ROUTING UNVERIFIED:** Vercel protected proxy, Render→Neon actual runtime branch and Adyen environment/merchant not attested. **T-007 W2 SOFTWARE TEST PREFLIGHT VERIFIED / PROVIDER-DEVICE EXTERNAL BLOCKER:** authorized TEST merchant+assigned POIID+webhook+terminal required. **T-008 W2 OFFICIAL ROUTING VERIFIED / EXTERNAL TAX+FISCAL BLOCKER:** explicit TEST/DEMO/PRD policy matches official /v2 endpoints; approved proxy support is not present in current allowlist.
- Narrow W2 operator matrices/readiness evidence: `W2_2026-10-14_INTEGRATION_READINESS.md`. No source/provider/production mutation and no GitHub push in this W2 batch.
- **T-008 source correction in this local stage:** KSeF successful invoice submission now closes the interactive session before SUBMITTED; ambiguous close preserves UNKNOWN and never resends. Four focused mock-only regressions, including asynchronous acknowledgement and timeout; no provider execution. External KSeF TEST/DEMO and accountant signoff remain outstanding.

### 2026-10-14 — W2 operational local checkpoint (supersedes stale ticket statuses above; NO REMOTE PUBLICATION)
| Ticket | Software evidence/this bounded delta | Acceptance still missing |
| --- | --- | --- |
| T-009 W2 | IMPLEMENTED/PREVIOUS CI VERIFIED for Edge outage, offline journal and KDS projections; **DEMONSTRATED print crash/double-dispatch defect LOCALLY FIXED + SQLite/connection-loss regressions TESTED** | Real WAN/LAN/Edge/KDS/ESC-POS/fiscal and printer-owner physical certification, audited uncertain-print resolution/reprint workflow |
| T-010 W2/W3 | CI security, backup restore, DR and simulated mixed load VERIFIED at f7acffd and 5f024fd; no new broad CI; CI p95 <5s over 30 mixed reads and restore <7200s are **regression budgets** | Independent pentest, production p95/p99/saturation/SLO/RPO/RTO, incident paging, recovery/pilot and release owner signoff |
| T-011 W2/W4 | Canonical financial issues existing; **DEMONSTRATED half-written RUNNING run LOCALLY FIXED** with atomic Prisma transaction and focused regressions | W2 finance exception owner review; W4 payout/bank/fee/chargeback statement product depth and provider+finance certification |
| T-004/T-007/T-008 | No source reopen or external calls | Runtime fingerprint; Adyen TEST terminal/webhook/statement; KSeF official TEST session/status/UPO/accountant |
| T-002/T-003/T-006 | Published W1 software evidence unchanged | Finance, communications, independent security owner signatures UNSIGNED |
- **2026-10-14 supervisor-gate update (LOCAL, not CI-certified):** T-009 additional queue-progress and cloud-reclaimed duplicate-ID handling implemented within already approved Edge paths; manual review/physical certification still pending. T-011 mocked rollback durability and idempotent existing-correlation case covered; pre-transaction financial reads are not serializable/snapshot-certified. No T-010 new release evidence claimed, no external signoff or hardware activity.

### 2026-10-14 — T-009 cross-device safety checkpoint, LOCAL/NO PUSH
| Ticket | Current disposition | Remaining acceptance |
| --- | --- | --- |
| T-009 W2 | **DEMONSTRATED CROSS-DEVICE DUPLICATE PRINT DEFECT; LOCAL FAIL-CLOSED FIX + TARGETED REGRESSIONS.** Expired CLAIMED/PRINTING no longer QUEUED; typed pre-I/O unsupported only; ambiguous post-I/O and FAILED callbacks quarantined; legacy uncertain retry blocked; unrelated queued work proceeds. Published parent c6c3455 unchanged | Physical Edge/KDS/printer/WAN test, owner-authorized audited resolution/reprint interface, independent security/operator signoff |
| T-011 W2/W4 | Published atomic run/issues/finalization **VERIFIED IN CI**; no new T-011 code | Snapshot consistency not established; payout/statement/bank match and finance-owner signoff EXTERNAL |
| T-002/T-003/T-004/T-006/T-007/T-008/T-010 | Software evidence carried forward unchanged | Existing finance, communications, runtime fingerprint, security, Adyen TEST, KSeF TEST/UPO and production resilience owners still pending |
