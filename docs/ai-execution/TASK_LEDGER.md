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
