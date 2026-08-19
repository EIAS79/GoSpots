# Phase 17 — Pilot and Go-Live Runbook

This runbook is the release-control procedure for GoSpots Phase 17. It does not override domain state machines or permit manual database edits as routine recovery.

## Opening checklist

Before a pilot shift starts, record the operator, venue, software revision and device set, then verify:

- venue identity, address, currency, timezone and business-day boundary;
- tax/fiscal profile for the marketed scope;
- owner/manager/cashier/server/kitchen users and permissions;
- floor/zones and all active resources;
- session rates/packages and any time bands;
- menu/catalog, modifier availability and current 86 state;
- opening inventory count/balance and unresolved negative-stock exceptions;
- POS/Edge/KDS/printer/scanner/customer-display assignments that are part of the pilot;
- Adyen terminal/provider readiness if card acceptance is in scope;
- cash shift open with recorded opening float;
- backup/restore evidence is current for the release revision;
- Attention/Reconciliation Center has no unexplained pre-existing critical item.

A failed mandatory check blocks that pilot workflow. Do not bypass it with a direct database edit.

## Adyen Terminal opening checks

For a venue where Adyen card-present payments are enabled:

1. confirm the GoSpots deployment is the exact intended revision;
2. confirm `ADYEN_TERMINAL_ENABLED=true` only in the environment being certified;
3. confirm API credential, merchant account and Standard webhook HMAC are configured through secret management, never source control;
4. confirm the assigned GoSpots `PaymentTerminal` provider is `adyen` and its external terminal ID is the actual boarded POIID;
5. run connector readiness and verify the Cloud Device API can see the merchant device environment;
6. ensure provider/card uncertainty is visible to operators and the reconciliation path is available before taking payments;
7. retain only transaction/provider identifiers needed for reconciliation. Never record PAN, CVV, cardholder secrets or API keys in certification evidence.

Stripe Billing remains the GoSpots SaaS subscription/features billing provider; it is not the venue GuestCheck/card-present authority for this certification.

## Busy-shift certification script

Execute a representative sequence and retain correlation IDs/evidence:

1. start multiple timed sessions and confirm exclusive occupancy;
2. pause/resume one session and move another resource;
3. create/arrive a reservation and seat/start it once;
4. add a waitlist party and resolve the queue state;
5. add F&B to the same commercial check as timed usage;
6. submit restaurant items to KDS and advance production states;
7. exercise a split check and mixed tender;
8. record a cash payment and an Adyen card-payment scenario;
9. exercise an authorized discount/approval path;
10. exercise a refund/correction path without mutating original payment history;
11. introduce a printer failure and verify queued/fallback/retry visibility;
12. disconnect internet for the certified offline subset, continue allowed work, restore connectivity and reconcile without duplicate money;
13. verify unresolved provider/fiscal/offline uncertainty remains visible rather than being rewritten as success/failure.

Automated CI performs the software/simulator form of this script. A physical pilot must repeat the applicable device and provider steps with actual marketed equipment.

## Adyen card-present certification script

Use a real Adyen test merchant and boarded test terminal before claiming provider certification. Record GoSpots operation/refund IDs, Adyen PSP references, terminal POIID and timestamps, but never secret credentials or card data.

Required sequence:

1. **Success:** send a card-present payment and prove one GoSpots `PaymentOperation` reaches `CAPTURED` for one Adyen transaction.
2. **Decline:** force/test a refusal and prove it reaches `FAILED` without creating captured money.
3. **Uncertain timeout:** cause a communication timeout/ambiguous response. GoSpots must record `UNKNOWN`; do not start a replacement charge.
4. **TransactionStatus recovery:** reconcile the same original SaleID/ServiceID/POIID until the provider returns the final repeated payment response. Prove there is no duplicate charge.
5. **Cancel in progress:** send AbortRequest and verify final state through TransactionStatus rather than assuming the abort succeeded.
6. **Referenced refund:** refund against the original terminal transaction identity. A successful ReversalResponse is only request acceptance; the GoSpots Refund must remain non-final until the asynchronous provider notification.
7. **CANCEL_OR_REFUND:** receive a valid HMAC-signed event, deduplicate repeated delivery and move the refund/payment net state exactly once.
8. **Late refund exception:** where Adyen test facilities allow, exercise or inject provider-certified `REFUND_FAILED` / `REFUNDED_REVERSED` evidence and confirm GoSpots removes stale refund certainty through the explicit reconciliation transition.
9. **Final reconciliation:** compare provider references/amounts with GoSpots payment, refund, settlement and ledger evidence.

A simulated HTTP fixture proves adapter semantics only. It does not satisfy the real-provider/terminal gate.

## Day close

Do not declare the shift closed until the following are either clear or explicitly recorded as unresolved exceptions:

- active/paused sessions reviewed; forgotten sessions resolved;
- open tabs/checks listed and resolved or manager-accepted according to policy;
- cash shift counted; expected cash, counted cash and variance recorded;
- card totals reconciled to Adyen provider evidence for the pilot;
- refunds/corrections visible and attributable, including any late provider failure/reversal;
- fiscal/KSeF pending/error/UNKNOWN states reviewed;
- inventory negative/variance/waste exceptions reviewed;
- staff time/shift state reviewed;
- payment/settlement/ledger reconciliation has no silent mismatch;
- offline/Edge sync backlog and dead-letter/conflict queues are clear or explicitly owned.

## Release tiers

### Internal

Our-CS controlled validation only. Simulators and non-production provider environments are allowed. No commercial readiness claim.

### Design partner

One or two cooperative venues with explicit support coverage. Only capabilities whose physical/provider certification evidence exists may be marketed or enabled as certified.

### Limited production

Controlled venue set after repeated stable design-partner evidence, release revision traceability, incident ownership and support coverage are demonstrated.

### General availability

General availability is blocked until every applicable Gate P17 item is satisfied, including marketed hardware evidence, Adyen real-provider evidence, fiscal/KSeF evidence for marketed Polish scope, and a full pilot venue day without a shadow spreadsheet/POS for core workflows.

## Rollback

### Pre-release requirements

- confirm the release is based on the intended exact `main` SHA;
- confirm clean and representative-upgrade migration gates are green;
- review whether the release contains a new migration and whether it is expand/compatible;
- record feature/capability flags that can disable newly introduced behavior;
- record the previous known-good application revision and deployment identifiers;
- verify backup/restore evidence.

### Application rollback

1. disable the affected feature/capability when that safely stops new writes;
2. redeploy/promote the previous known-good compatible application revision;
3. verify health, authentication and core operational paths;
4. verify queues/outbox/Edge replay remain idempotent;
5. run reconciliation before reopening the affected workflow.

Do not roll the database backward destructively merely because application code is rolled back. Expand/contract migrations are designed so a compatible older application can be restored where documented.

### Committed business facts

Payments, refunds, ledger facts, fiscal documents, stored-value movements, cash closes and other committed business facts are not erased to make a rollback look clean. If an application defect committed an incorrect fact:

- stop further affected writes;
- identify exact entities/correlation IDs;
- use the domain's supported reversal/correction/reconciliation path;
- retain the original audit trail;
- obtain manager/compliance approval where required;
- document the incident and resulting correction.

A provider-confirmed failed/reversed refund is a reconciliation fact, not an application rollback. GoSpots may move the payment's net refund state from `REFUNDED`/`PARTIALLY_REFUNDED` back toward `CAPTURED` only through the provider-reconciliation path and retained webhook evidence.

### Roll-forward

Prefer a tested roll-forward when schema compatibility or already-committed facts make rollback unsafe. The correction release must pass the same exact-head gates before broad rollout.

## External certification evidence record

For every certified hardware/provider model record at least:

- manufacturer/model/provider and environment;
- connection/driver/SDK/version;
- supported OS/device and GoSpots adapter/revision;
- online success and restart evidence;
- disconnect/reconnect evidence;
- duplicate/retry/UNKNOWN behavior;
- error surfaced in GoSpots operator UI;
- Edge relay evidence where applicable;
- production/pilot evidence date and operator;
- unresolved limitations.

For KSeF/fiscal/legal scope, attach the environment/reference identifiers and professional validation outcome without storing private credentials/certificate secrets in the evidence document.

## Stop conditions

Stop or narrow the pilot immediately for:

- unexplained financial mismatch;
- duplicate payment/refund/stored-value fact;
- cross-tenant data exposure;
- critical/high unresolved security vulnerability affecting production;
- lost kitchen/print work with no visible recovery path;
- offline divergence that cannot be deterministically reconciled;
- provider uncertainty being presented as successful payment;
- provider-confirmed refund failure/reversal left as settled refund certainty;
- inability to restore service within the documented incident/runbook path.

Phase 17 certification evidence may be recorded as `SOFTWARE_DONE / BLOCKED_EXTERNAL`; it must not be promoted to `ACCEPTED` while any applicable external item is missing.
