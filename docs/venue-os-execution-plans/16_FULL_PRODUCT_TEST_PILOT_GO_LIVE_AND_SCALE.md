# 16 — Full-System Certification Campaign, Venue Pilot and Controlled Production Scale

**Classification:** R0–R15 `CURRENT_PROOF_MISSING` as combined current-RC certification | **Priority:** P0 | **Maps:** P16/P17, all other plans.

## Non-negotiable distinction

Successful GitHub workflows and unit/Edge simulations establish implementation quality, **not** legal fiscal compliance, confirmed card authorization, data recovery or a venue's operational independence. Current previous audit decision was **NO-GO for unconditional GA based on evidence**, not 'the application is down'. The original R0–R15 already specifies the final campaign and 12 files. This plan operationalizes it without creating Phase 18.

## Work execution sequence and stop points

| Stage | Execution and evidence | Stop condition |
| --- | --- | --- |
| R0 | Freeze one baseline SHA, reconcile PRs and deployed GoSpots identities, protect main | Unknown live environment or release SHA |
| R1 | 100% atomic requirements P0–P17 + runtime surfaces classified, ownership and gaps | Unclassified production action |
| R2–R3 | tenancy/auth/API, venue setup and game sessions | Tenant escape, double resource ownership |
| R4 | checkout, external capture, refund, ledger, fiscal and KSeF | Silent duplicated/lost funds or invalid legal doc |
| R5–R6 | kitchen/inventory/customer/workforce/access/multi-venue | Irrecoverable stock/customer-value discrepancy |
| R7 | hard Edge failure and actual marketed hardware | Unsupported 'offline works' claim |
| R8–R9 | analytics/AI and exhaustive routes/controllers/jobs permissions | Reachable bypass or ungrounded money result |
| R10 | security, privacy, migration, load and restore | Restore impossible, auth/security S0 |
| R11 | physical Adyen/fiscal/KSeF/Edge/QR certification | Unverified marketed provider/device |
| R12 | one exact-RC whole-product automation campaign | Current RC regressions or unresolved S0/S1 |
| R13 | staging full-day dress rehearsal with fault injection | Shadow POS/spreadsheet/raw SQL needed to complete |
| R14 | real staffed design-partner day and limited canary | Merchant cannot open, sell, close, export independently |
| R15 | signed GO/LIMITED/NO-GO | Missing required signoff/evidence |

## Engineering quality layers

**A. Contract tests:** schema validations, strict tenant guards, per-role allowed+denied route matrix, idempotency with same/different payload, transaction versions and timing/timezone cases. Preserve supported OpenAPI contracts and create provider adapters with fake+real sandbox suites.

**B. Property and invariant tests:** split checkout, rounding, refund liability and multi-party race; stock conservation, package/stored-value consumption; monotonic occupied time; no duplicated order KDS side effect or provider allocation. Use generators and shrinkable failure seeds stored in CI.

**C. Database tests:** migrate PG17 from empty and upgrade from anonymized representative production shape; verify indexes, backfill integrity, queues, rollback/forward-fix, row-level policy and long transaction performance. Do not store prod personal data in public fixtures.

**D. Browser/device tests:** desktop and tablet cashier, owner portal, bookings, 2 concurrent operators and two different roles, customer QR, languages and accessibility. No mocked external provider response presented as real provider certification.

**E. Environment/failure tests:** cold start, Neon pool pressure, webhook order inversion, network partition, Edge disk failure, KDS printer jam, terminal decline and UNKNOWN, KSeF outage, slow upstream, power restore, data export and GDPR event. Capture operator-visible instruction and back-office recovery results.

**F. Nonfunctional targets:** baseline latency distributions for cash close, start timer, pay button, order→KDS; p95/p99 and concurrency from real pilot; documented SLO and RPO/RTO with capacity budget and load profile. Choose signed measurable thresholds based on actual venue traffic, not arbitrary numbers in a planning document.

## Golden end-to-end merchant day

1. Provision empty GoSpots venue: business/NIP, fiscal profile, merchant account, authorized staff, floor resources, kitchen and menu, hardware.
2. Manager opens cash drawer and approves configured checklists. Cashier starts a timed billiard walk-in and records food, waiter sends order to KDS.
3. Two customers race for the last available table; capacity invariant holds. Online reservation with deposit checks in and transitions to correct session/check.
4. Pause/move game table, apply loyalty and one permitted manager discount; quoted and charged rates match snapshot.
5. Split bill: cash + Adyen capture, one provider declines, one `UNKNOWN` times out and eventually reconciles, full/partial refund with original capture lineage.
6. Issue actual legally appropriate fiscal receipt and relevant VAT invoice with accepted KSeF status; test an outage/correction workflow in permitted safe test setting.
7. Receive supplier stock, sell recipe items, record waste, stocktake; KDS printer fails and recovery produces exactly one kitchen work item.
8. WAN outage/Edge, LAN failure and full restart as safely testable; restore without double charge. Any unsupported operation is correctly blocked.
9. Close staff shifts/cash, reconcile sales vs check allocations, PSP events, fiscal docs, gift/store liabilities, stock and owner reports; compare bank/payout feed where available.
10. Search old transaction, export complete original invoice and signed history, restore from backup in isolated rehearsal and prove referential consistency.

## Evidence and reviewer contract

Every test record captures scenario ID, exact commit/container+DB migration, deployment ID, environment, device model+firmware, timestamp/local timezone, test operator, test/real money indicator, inputs, expected/observed, source log/provider proof IDs (redacted), result, incident, retest and reviewer signature. External checkout test must be explicitly in sanctioned test environment with approved test cards/terminal; no real customer charges as unattended testing.

## Promotion policy, support and exit

- `NO-GO`: unresolved S0/S1, unknown legal or external status, unsafe offline behavior, inability to restore, money/history mismatch, no pilot.
- `LIMITED PRODUCTION`: only one/defined venue types, certified providers/devices and regional legal profile; supervised pilot, 24/7 or contracted coverage actually available, daily reconciliation, feature flags and easy isolation/rollback.
- `GENERAL AVAILABILITY`: no S0/S1 in sold scope, all required gates accepted, multiple stable merchant shifts, continuous operations verified, clear S2 dispositions, data export + support processes proven and product/legal owners sign.

**No silent deployments:** one deliberate release PR, exact-head GitHub checks, consolidated production promotion using current `.vercel-release` policy, read-only smoke+physical operator verification; rollback plan with schema limits. Build flags and per-merchant entitlements prevent selling unfinished feature packs.

## Final package

All twelve canonical R deliverables from Plan 18 plus a versioned release manifest, signed product/legal/security/finance/support acceptance, verified service runbook, venue pilot evidence, hardware/provider references and go/no-go minutes. A plan file or simulator output cannot sign itself off.
