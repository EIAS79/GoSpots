# 22 — Golden Scenarios and Adversarial Certification Library

**Purpose:** a reusable scenario corpus to make every plan auditable, mapped to master P0–P17 and R0–R15. **These are test specifications; none is marked executed.** Scenario runner must append `{scenarioId, exact SHA, env, actor, tenant, device/profile, expected, observed, run_id, artifact, reviewer, result}`.

## Group A — Security, isolation and financial permissions

| ID | Scenario | Pass evidence |
| --- | --- | --- |
| A01 | Tenant A user GETs shop B checkout history | 403/404 without data leak, audit |
| A02 | Tenant A tries B's payment refund ID in own body | Denial, untouched money |
| A03 | Staff changes client-supplied shop/path header | Server derives permitted tenant |
| A04 | Background cron job sees two shops in one worker | Correct scope, no pooled connection bleed |
| A05 | Support user attempts write without merchant authorization | Denial, no privileged backdoor |
| A06 | Basic cashier submits `MANUAL_CARD` direct API | No provider-backed success or hidden settled due change |
| A07 | Cashier attempts self-approval of high-risk void/refund | Permission denial and full audit |
| A08 | Expired/revoked staff PIN during Edge offline session | Bounded policy and no unlimited write privileges |
| A09 | Reused CSRF token/mismatched origin browser mutation | Appropriate rejection |
| A10 | Download URL reused for another tenant's invoice | Signed, scoped authorization on download |

## Group B — Checkout, provider, refund and ledger

| ID | Scenario | Pass evidence |
| --- | --- | --- |
| B01 | Cash sale with change and cash drawer handover | Correct due, change, cash events |
| B02 | Card capture accepted, response never reaches browser | Reconcile one capture, one allocation |
| B03 | Card decline, customer retries cash | One paid check, failed attempt preserved |
| B04 | Card `UNKNOWN` for 30+ minutes | No optimistic paid, owner alert and recovery |
| B05 | Provider webhook arrives 3 times out of order | Exactly one economic capture |
| B06 | Two cashiers settle same check version | No oversettlement or lost refund |
| B07 | Cash + Adyen mixed tender, partial item return | Deterministic allocation/refund/tax |
| B08 | Full refund requested twice simultaneously | Total refunded <= eligible original paid |
| B09 | Customer paid prepaid/gift and cash | Liability reduction and cash correct, no duplicated revenue |
| B10 | Adyen terminal other venue/mismatched merchant | Cannot allocate to wrong shop |
| B11 | Offline provider-enabled card store-and-forward later declined | Proper merchant-risk/uncollected state, not hidden cash receipt |
| B12 | Refund authorized after prior day close | Correcting journal, original immutable |
| B13 | Provider payout includes fee + chargeback + refund | Exact transaction/payout/bank bridge |
| B14 | Import same payout statement twice | No duplicated booking/journal |
| B15 | Bank credit appears late or value date differs | In transit until matched, no fake discrepancy |

## Group C — Polish fiscal and legal invoices

| ID | Scenario | Pass evidence |
| --- | --- | --- |
| C01 | Consumer sale, fiscal required | Certified fiscal record, device proof and correct tax |
| C02 | Card terminal prints a slip | Never classified as fiscal receipt |
| C03 | Fiscal device returns unknown response | Check status stays auditable; no duplicate blind print |
| C04 | Buyer with NIP requests compliant invoice | Correct invoice/customer tax info and KSeF lifecycle |
| C05 | KSeF accepts FA(3) invoice | Official identifier/UPO persisted, original immutable |
| C06 | KSeF rejects invalid schema/data | Correct review action; no fake legal acceptance |
| C07 | Correct a legally issued invoice | Proper signed correction, old original still retrievable |
| C08 | Offline24 qualified issue followed by reconnect | Correct legal mode, QR/cert/deadline and official result |
| C09 | KSeF account credential expires during issue | Quarantined, recoverable, no silent success |
| C10 | Two shop/NIP configs submit invoices concurrently | Auth and document numbers isolated |

## Group D — Venue resources, bookings, kitchen and stock

| ID | Scenario | Pass evidence |
| --- | --- | --- |
| D01 | Two cashiers start same table simultaneously | At most one authoritative active session |
| D02 | Move paid session to new table after price update | Frozen tariff + explicit transfer policy |
| D03 | Pause timed session across 04:00 day boundary | Accurate charged minutes and business day |
| D04 | Warsaw DST spring missing wall-clock hour | Invalid time guarded and explained |
| D05 | Warsaw DST fall duplicate hour | Reservation disambiguated by offset |
| D06 | Browser in a different country books Warsaw 19:00 | All venue communications 19:00 Warsaw |
| D07 | Reservation last table races with walk-in | No overbooking |
| D08 | Customer prepays deposit then no-shows | Forfeiture/refund and correct ledger/tax lifecycle |
| D09 | Menu order contains modifier allergy change | Approved computed allergen representation |
| D10 | KDS printer jams and operator reprints | One preparation unit, copy clearly identified |
| D11 | QR table link altered or stale | No order/check access |
| D12 | Accepted PO partial receipts + supplier legal invoice | No duplicate stock or payable, variance visible |
| D13 | Recipe component changed, order in flight | Correct recipe version and stock consumption |
| D14 | Stocktake occurs during offline Edge replay | No silently negative/invented stock |
| D15 | Perishable batch recalled | Available traceability and flagged unknowns |
| D16 | Equipment table blocked by maintenance | Reservations and sessions respond safely |

## Group E — Offline, deployment, privacy and merchant day

| ID | Scenario | Pass evidence |
| --- | --- | --- |
| E01 | WAN lost; Edge+LAN running | Only certified operations available; no data loss |
| E02 | Edge crashes before ACK | Durable command replay exactly once |
| E03 | Edge disk full or clock drift | Safe read-only/blocked behavior with operator alert |
| E04 | Cloud+Edge split-brain session command | Fenced authority; no double check |
| E05 | Payment terminal unavailable during customer checkout | Correct block/fallback and unreconciled state |
| E06 | Fiscal printer unavailable after card capture | Lawful recovery; does not invent fiscal receipt |
| E07 | Production-shaped PG17 upgrade | No missing invoice/ledger/customer-value rows |
| E08 | Encrypted backup restore with queue reconciliation | Data and audit recover to declared RPO/RTO |
| E09 | GDPR subject request on customer with tax invoices | Lawful retention + restricted personal access |
| E10 | Tenant exports complete histories then cancels subscription | Reconciled export, keys revoked, records handled legally |
| E11 | SaaS Stripe subscription fails during busy shift | Merchant financial ledger not conflated with SaaS receivable |
| E12 | New merchant setup and cutover from old system | Opening balances, stock, reservations correct |
| E13 | Staff opens/closes full real busy shift | No shadow POS/spreadsheet/raw SQL, all money accounted |
| E14 | Rollback of web/API after feature release | Code/DB schema compatibility and no receipt/invoice loss |
| E15 | Untrusted order note attempts AI prompt injection | No autonomous refund, data export or privilege change |

## Execution evidence policy

Each completed scenario must link to a current release SHA and, if external, the named **authorized test environment**, sanitized reference, model/firmware and provider proof; simulations are never physical certification. Tests that intentionally disconnect payment devices must follow provider-approved environment and not risk active customer sale. Legal receipt tests use authorized fiscal validation steps approved by vendor/accountant, never fake fiscal transaction payloads represented as legal customer receipts.

## Mapping to original roadmap

- A tests map P1/P10/P16 and R2/R6/R9/R10.
- B tests map P4/P5/P9/P14 and R4/R5/R8/R11.
- C tests map P5/P17 and R4/R11.
- D tests map P2/P3/P6/P7/P8, R3/R5/R7.
- E tests map P12/P13/P15/P16/P17, R7/R9/R10/R12–R15.

**Acceptance scoring:** `NOT_RUN`, `PASS_EXACT_RC`, `FAIL`, `BLOCKED_EXTERNAL`, `OUT_OF_MARKETED_SCOPE`. A PASS at older SHA retains historical context but must be marked `STALE_FOR_RC` when affected behavior changed. Any S0 failed scenario blocks GA for that configured capability. Automated coverage is insufficient if an external fiscal/payment/hardware gate remains unsigned.
