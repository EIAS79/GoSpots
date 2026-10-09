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
