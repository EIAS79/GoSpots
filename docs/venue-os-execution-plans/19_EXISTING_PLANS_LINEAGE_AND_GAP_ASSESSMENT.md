# 19 — Existing Plans vs Actual Audit vs Newly Proposed Scope

**Purpose:** distinguish what was explicitly planned, what was observed in the inspected repo, what requires current-run proof, and what is an actual product scope expansion. **Status as of 2026-10-09; not a fresh live full-code run.**

## 1. The sources have two different kinds of authority

- The **Master Product & Engineering Execution Plan v2** is the authoritative *intended capability contract* for phases P0–P17. It describes why the project exists, architecture, domain truth map, monetary invariants, 18 phases and acceptance tests. The plan explicitly excludes full accounting/general ledger, payroll and full ERP from **initial** commercial release (section 27).
- The **FINAL Pre-Production Full Audit/Gap Closure & Go-Live Roadmap** is a *re-certification contract*, not proof of completion. Its unique new material is R0–R15 and 12 evidence outputs. After `# PART V — CANONICAL MASTER PLAN v2, FULL TEXT`, the latter **embeds the same canonical master plan**. Treat this as convenience duplication, not an extra implementation roadmap.
- The **October 9 deep read-only audit** found specific code/config concerns and missing evidence. It covered selected core source modules and repository structure, not all individual files, production data, every UI click or certified physical devices. Verified source = a fact about code as inspected, not a fact about a deployed exploit.

## 2. Full original phase lineage

| Master phase | Existing planned functionality | Deepened/added workstreams | Scope conclusion |
| --- | --- | --- | --- |
| P0 | baseline, standalone POS, dependency removal | 01, 18, 19 | Core planned; current exact RC proof and repo hygiene |
| P1 | auth, tenancy, money, time, concurrency, audit | 02, 05, 09, 11 | Planned; adversarial tenant/RLS and manual-card authority risk |
| P2 | branches, resources, rates, devices, setup | 05, 10, 12 | Planned; onboarding and physical scope expansion |
| P3 | session lifecycle, floor, waitlist, maintenance | 05, 13 | Planned; facility upkeep is deeper than table maintenance |
| P4 | check/order/settlement/ledger | 02, 04, 15 | Planned; money attestation and payout proof need attention |
| P5 | card/cash/refund/invoice/fiscal/KSeF/reconcile | 02, 03, 04, 10, 17 | Planned; external certification/fee/chargeback/bank depth |
| P6 | restaurant/KDS/QR/coursing | 06, 10 | Planned; allergen/HACCP/physical test depth |
| P7 | stock, BOM, PO, suppliers, goods, costing | 06, 07, 13 | Planned; three-way invoice matching and lot/expiry extension |
| P8 | reservations, deposits, events | 05, 08 | Planned; DST, travel and deposit reconciliation |
| P9 | customer, membership, loyalty, stored value | 08, 15 | Planned; liability, chargeback and offline double-spend proof |
| P10 | staff time, scheduling, approvals, oversight | 09, 12 | Planned; legal payroll excluded, approval coverage deepened |
| P11 | tickets, QR/RFID, access, occupancy, lockers | 08, 10 | Planned; marketed scanner hardware needs real proof |
| P12 | Edge/offline and devices | 10, 11, 16 | Planned; offline risk boundaries and physical cert incomplete |
| P13 | multi-location, SaaS, integrations | 12, 17 | Planned; commercial onboarding/support/merchant exit expanded |
| P14 | analytics/reconciliation/reports | 04, 15 | Planned; provider payout/bank reconciliations and profit definitions |
| P15 | automation/attention/AI | 15 | Planned; side-effect/grounding guardrail re-cert |
| P16 | security, privacy, DR, performance, accessibility | 11, 16 | Planned; current release restore/latency/privacy proof |
| P17 | pilot and certification | 03, 10, 12, 16 | Planned; signed physical/pilot acceptance missing |

**Conclusion:** The master has unusually broad product coverage; the newly proposed work is chiefly **operational depth and full-business back-office**, not 18 new greenfield modules. Do not destroy existing code when source-led repairs can work.

## 3. Audit finding closure matrix

| Previous finding | Evidentiary characterization | Repair owner/workstream | Verification and gate |
| --- | --- | --- | --- |
| F01 unprotected main | confirmed governance | 01/16 | enforced PR rules, exact-head checks |
| F02 generic direct manual-card paid path | confirmed inspected behavior, production misuse unproved | 02 | cashier API denied/privileged separation, payment equality |
| F03 reservation-local formatting no timezone | confirmed inspected code path | 05/17 | explicit IANA time and DST/travel E2E |
| F04 12 exact R deliverables absent | confirmed absence by filenames | 01/18/16 | current-SHA complete matrix and signed evidence |
| F05 integrated Adyen/fiscal/hardware/pilot not proven | documented externally blocked | 02/03/10/16 | real current-release provider/device/pilot record |
| F06 live GoSpots Render/Neon not available via connector | verified access mismatch | 01/11/16 | verified correct deployment/API/DB provider environment, no Edulytics mix |
| F07 `.pl` vs `.eu` host contract discrepancy | source/docs conflict | 01/17 | signed domain policy and redirect/login/payment test |
| F08 #7/#92/#95/#100 open and stale acceptance notes | repo governance/record discrepancy | 01/05 | diff-disposition vs main and current-RC acceptance report |
| F09 RLS disabled by default | code config fact, NOT a demonstrated leak | 11 | tenant abuse matrix and explicit RLS/compensating controls |
| F10 tracked `dev.db` and two lockfiles | tree confirmed; sensitive content not inspected | 01/11 | restricted review and explicit toolchain policy |
| F11 canceled latest Vercel production attempt | release trace gap, NOT established outage | 01/16 | active aliases, release-gating decision and SHA manifest |

## 4. Newly discovered planning omissions/underspecified areas

The classification here is **comparison of requested plan prose**, not exhaustive proof of missing source code. Representative automated keyword checks over the supplied original master and unique R0–R15 portion found no exact occurrences of several concepts such as `bank statement`, `chargeback`, `dispute`, `accounts payable`, `accounts receivable`, `HACCP`, `temperature log`, `cleaning checklist`, `asset maintenance`, `service level`, `customer support` and `payroll` appears only as a deliberate exclusion. Some broader equivalent concepts can still be present using different terminology. Therefore all work starts with R1/R9 audit and closes on a **verified required flow**, not a grep score.

### Priority group A — cannot sell a claim without completion

**A1 — money end-to-end:** PSP payout/fees/chargebacks, operational ledger and bank reconciliation. Original has financial reconciliation but not a complete provider→merchant bank/chargeback process. Owner needs to know **why settlement showed PLN X and bank received PLN Y**, with evidence for timing/fees/disputes. Add 04 and tie existing reporting to canonical finance.

**A2 — fiscal+KSeF legal correctness:** already planned, but requires ruleset versioning, exact real provider proofs, Polish accountant acceptance and operating outage procedure; do not market uncertified 'legal invoices'. Plan 03.

**A3 — merchant operability:** ability to install, configure, train, troubleshoot, restore and switch merchants reliably is not solved by a setup wizard alone. Add 12/16.

### Priority group B — necessary if venue wants *one daily tool*, scope-dependent

**B1 — hospitality controls:** ingredient-based allergens, temperature/cleaning/HACCP-assistance, traceability and recall, if restaurants need these workflows inside GoSpots (06/07). These are not automatically legal software obligations; the *venue* retains operating duties.

**B2 — physical site operations:** maintenance assets, table wear, cleaning, permits reminders, daily tasks and incident log (13). The master P3's `Maintenance/downtime` for game resources is not a comprehensive facilities operations suite.

**B3 — procure-to-pay:** approved supplier order→goods receipt→legal supplier invoice→payables due→bank evidence, not just stock receipt + supplier table (07/04/14).

**B4 — workforce completeness:** legal timesheet and payroll exports, tips, offboarding, staffing coverage; advanced HR/payroll only if commissioned (09/14).

**B5 — complaint and service:** merchant customer helpdesk, guest dispute/refund linked to GuestCheck, migration, cancellation/export and complete vendor escalation (08/12).

### Priority group C — optional business/vertical expansion

**C1 — full accounting general ledger and filings; C2 — payroll/ZUS/PIT**: intentionally excluded from initial GA. Strongly favor integration with established Polish payroll/accounting until product/company can support regulations and specialist staffing (14).

**C3 — broad retail/general shops:** the original master targets entertainment, dining and mixed venues—not all retail. A real retail POS expansion would need product variants, barcode/scales, serialized goods, retail exchange/return and receipts, discounts, supplier operations and stock adjustments; test legal jurisdiction first. See Plan 20. Do not sell GoSpots as certified for all store types without this vertical certification.

**C4 — autonomous bank actions, dynamic pricing AI, gaming/gambling, hotel PMS:** deliberately avoid conflating optional advanced features with launch readiness. The master excludes several of these intentionally.

## 5. Evidence limitations and ordered next action

The October 9 audit's 1,441-file tree and selected code read are useful source facts, but **a proper deep recursive implementation audit** still must generate one trace per P0–P17 atomic requirement and each mutation/role/webhook/device/queue with tests. Do not silently mark gaps as implemented. Action order: freeze release trace (01), generate executable matrix (18), close hard financial/security/time bugs (02/05/11), real external/fiscal/Edge proof (03/10), end-to-end cash/payout close (04), certify kitchen/inventory/customer/team (06–09/15), merchant onboarding/pilot (12/16), then Tier B/C if scope sold. Final results signed by qualified owners.

## 6. What does 'finished' mean?

**Tier A finished** = legally usable certified POS for specific Polish billiard/gaming/café/mixed venue configurations, no shadow POS, correct money/receipts/invoices/history and full real-day proof.

**Tier B finished** = owner can also manage purchasing, stock, people scheduling, physical upkeep, food safety tasks and exceptions in one primary UI, with accountant/bank still professionally supported.

**Tier C finished** = optional independently audited statutory accounting/payroll suite with maintained regulations, reporting and professional support. Not implied by Tier A/B acceptance.
