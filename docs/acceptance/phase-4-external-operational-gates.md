# Phase 4 — Existing External / Operational Gates

Status: **BLOCKED_ON_EXTERNAL_OR_PHYSICAL_EVIDENCE**

Baseline `main` at phase start: `f61c1b2f81eedb0ff7d5e67be4a62291c361c2bc` (merged Phase 3).

This record separates repository-executable proof from evidence that genuinely requires a provider sandbox, certified device, physical venue hardware, licensed GoPOS access, or professional Polish accounting/tax/legal review. External evidence is never inferred from unit tests or mocks.

## Chunk 07 — first real payment terminal connector

Repository engineering remains complete. The real-provider acceptance gate remains open.

Required live evidence:

- provider test credentials configured for the GoSpots pilot environment;
- supported reader/server-driven Terminal path provisioned and assigned to a pilot Shop;
- successful payment;
- decline;
- customer cancellation;
- timeout/ambiguous result represented as `UNKNOWN`, followed by reconciliation of the same provider transaction;
- duplicate client request creates one charge;
- duplicate webhook is harmless;
- refund and partial refund where supported;
- reader offline and reader reassignment behavior;
- canonical `Payment` evidence in the Settlement plus audit/correlation/provider reference;
- rollout and kill-switch evidence.

Execution evidence for this phase:

- the connected Stripe account available to this execution is a Poland account with charges enabled;
- Terminal reader listing returned no readers;
- the connected Stripe API surface exposed no supported Terminal-reader create/simulator operation that could safely provision the required reference-reader test path;
- therefore no Terminal transaction was fabricated or substituted with an online PaymentIntent.

Result: **EXTERNAL PROVIDER/READER ACTION REQUIRED**.

## Chunk 08 — Poland fiscalization + KSeF

Repository engineering remains complete. The following evidence is still required:

### KSeF TEST/DEMO

- TEST/DEMO credentials;
- challenge/authentication;
- supported FA(3) submission;
- status reconciliation;
- persisted KSeF number;
- persisted UPO where available;
- duplicate prevention;
- timeout/`UNKNOWN` reconciliation against the same submission;
- supported correction/refund lineage.

### Certified fiscal provider/device

- selected certified provider/device bridge;
- receipt issue;
- timeout/reconciliation;
- duplicate-request protection;
- device-offline/action-required state;
- persisted receipt identifier/proof.

### Professional scope review

Written Polish accounting/tax/legal review is required for the exact marketed scope: seller/tax identity, VAT mapping, receipt/invoice scenarios, FA(3), corrections/refunds, retention, certified-device obligations, operator procedure, and unsupported scenarios.

No KSeF credential, certified fiscal device/provider session, or professional sign-off is available in the execution environment. Result: **EXTERNAL PROVIDER / PROFESSIONAL REVIEW ACTION REQUIRED**.

## Chunk 13 — KDS physical pilot

Automated KDS routing, line cancellation, timing/alerts, touch-oriented UI and Edge-safe projection exist. Phase 4 still requires physical evidence for:

- real touch display;
- kitchen + bar routing on venue hardware;
- line cancellation on the physical workflow;
- late-ticket timing;
- Edge local relay where enabled;
- power/network interruption recovery.

No physical KDS/touch/venue network is attached to this execution. Result: **PHYSICAL PILOT REQUIRED**.

## Chunk 14 — Inventory operational pilot

Repository behavior covers purchase orders, goods receipt, recipe consumption, refund/cancel policy, waste/loss, stocktake variance, weighted-average cost and COGS. Phase 4 still requires a real operational pilot covering those actions plus production-scale report behavior using representative venue stock data.

No real venue stock process or receiving/stocktake operation is connected to this execution. Result: **OPERATIONAL PILOT REQUIRED**.

## Chunk 16 — live deposit-provider roundtrip

Automated Stripe-hosted deposit behavior already covers creation/reuse, webhook-authoritative capture, amount/currency mismatch rejection and duplicate handling. Phase 4 requires a live provider test roundtrip:

- provider test deposit creation;
- callback/webhook into the deployed GoSpots endpoint;
- booking confirmation;
- cancellation/refund;
- duplicate callback;
- timeout/reconciliation.

The execution environment does not expose the GoSpots target Stripe webhook secret/configuration or a safe end-to-end test deployment binding. A standalone Stripe operation would not prove the GoSpots webhook/reconciliation path. Result: **EXTERNAL PROVIDER/DEPLOYMENT CONFIGURATION REQUIRED**.

## Chunk 20 — Analytics production-size proof

Repository-executable work is included in this Phase 4 branch:

- the KPI dictionary remains the frozen semantic contract at `docs/analytics/metric-dictionary.md`;
- `growth-analytics.performance.spec.ts` adds a representative synthetic-scale regression gate covering Finance, Operations, Guests and Overview;
- the gate enforces explicit interactive response budgets (5 seconds per decision surface, 10 seconds for the aggregate Overview under CI-scale synthetic load);
- the synthetic dataset covers 20k Ledger rows, 18k provider payments, 2k refunds, 10k pricing snapshots, 10k inventory movements, 5k sessions, 5k reservations, 5k KDS tickets, 5k visits, 5k acquisition facts and 5k rule applications;
- clean Ledger/provider data must reconcile to zero variance;
- a seeded provider mismatch must remain visible as non-zero reconciliation variance;
- existing Analytics/booking tests remain the canonical Europe/Warsaw DST correctness proof.

This is a deterministic application-layer scale regression. It does not pretend to be a production-database latency benchmark. A dedicated production-like database benchmark may still be captured later if the deployed environment has materially different query latency/data distribution, but the repository now has a permanent regression guard rather than an undocumented manual expectation.

## Chunk 22 — GoPOS pilot

The connector is intentionally fail-closed without licensed official API access. No licensed GoPOS API documentation/credentials were available to this execution. Consequently no endpoint, payload or provider behavior was guessed.

Still required when licensed access exists:

- obtain current official documentation;
- map supported capabilities and source-of-truth boundaries;
- push the supported GoSpots session/check charge;
- receive payment/fiscal/status result where supported;
- verify external-reference uniqueness per Shop/provider;
- outage/retry/dead-letter behavior;
- reconciliation mismatch report;
- prove GoPOS outage cannot corrupt the internal GuestCheck.

Result: **EXTERNAL LICENSED API ACCESS REQUIRED**.

## Chunk 23 — physical hardware certification

Repository tests cover deterministic printing/device protocols but cannot certify physical hardware. Required certification remains:

- ESC/POS receipt printer;
- kitchen/bar routing;
- network interruption + retry;
- no duplicate fiscal print semantics;
- barcode scanner;
- customer display read-only behavior;
- cash drawer trigger where supported;
- device offline/last-seen diagnostics;
- Edge restart and print-claim recovery.

No supported physical printer/scanner/customer-display/cash-drawer test bench is connected to this execution. Result: **PHYSICAL HARDWARE CERTIFICATION REQUIRED**.

## Phase 4 acceptance decision

Phase 4 cannot truthfully be marked complete until the external/physical items above are evidenced. Repository-executable work must still pass exact-head CI and may be merged independently so that the project records the blockers and retains the Analytics scale regression.

Do not begin Phase 5 while this phase is being represented as complete. Phase 5 implementation is outside this branch.
