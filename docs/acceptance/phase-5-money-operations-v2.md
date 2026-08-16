# Phase 5 — Money Operations v2 Acceptance Record

**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 5  
**Repository:** `EIAS79/GoSpots`  
**PR:** #54  
**Program status after software verification:** `SOFTWARE_DONE / BLOCKED_EXTERNAL` until the provider, hardware and Polish legal gates below are evidenced.

## Canonical authority

Phase 5 does not introduce another revenue ledger. The Phase 4 chain remains authoritative:

`GuestCheck -> CheckSettlement -> Payment/Refund -> LedgerEntry -> fiscal/KSeF projections`

The Phase 5 reconciliation records persist evidence and exceptions only. They never rewrite Settlement, Payment, Refund, LedgerEntry, cash, fiscal or KSeF facts.

## Reused production foundations

- provider-neutral payment operations with explicit `UNKNOWN` and reconciliation-required handling;
- Stripe Terminal and simulated connectors;
- venue-scoped terminal registry/assignment and health metadata;
- cash drawer/session/movement/count/variance/approval flows, including blind count;
- immutable provider refund records and allocations;
- immutable compliance documents generated from paid settlement snapshots;
- concurrent invoice/receipt numbering under a locked compliance profile;
- FA(3) invoice builder;
- encrypted KSeF credentials/environment configuration;
- idempotent KSeF request records, duplicate-submission prevention, UNKNOWN handling, status reconciliation, KSeF number and UPO evidence;
- fiscal provider/device request/retry/reconciliation records.

## Phase 5 delta

### Payment contract and readiness

The payment connector contract is capability-based and now describes in-person terminal, online card, preauthorization, offline collection, tips, webhook reconciliation, optional collect/confirm/query/webhook operations and readiness. `UNKNOWN` is explicitly not failure and must be reconciled before retry.

### Refund authority

Provider refunds now require the dedicated high-risk `refund.execute` permission at the authenticated server API boundary. Ordinary `checkout.write` no longer grants access to the provider-refund endpoint.

### Offline card risk policy

New tenant-scoped policy records control:

- enabled/disabled;
- maximum single offline amount;
- maximum cumulative unreconciled amount;
- minimum operator role;
- customer warning text;
- forced reconnect threshold.

The connector must independently advertise offline-collection capability. Policy changes are audited. The new tables use PostgreSQL `FORCE ROW LEVEL SECURITY` with the canonical tenant predicate.

### Financial reconciliation

A durable reconciliation run compares, for an explicit business window and currency:

- paid CheckSettlement totals;
- successful Payment totals;
- canonical SALE LedgerEntry totals;
- successful provider Refund totals;
- canonical REFUND LedgerEntry totals;
- closed cash-shift variance;
- unresolved provider PaymentOperation records;
- unresolved fiscal/KSeF compliance requests.

Every mismatch becomes a persisted, tenant-scoped issue. The service never auto-mutates money to make a mismatch disappear.

### KSeF special legal procedures

GoSpots now records the legal/operational distinction between:

- `OFFLINE24`;
- `SERVICE_UNAVAILABLE`;
- `ANNOUNCED_FAILURE`;
- `TOTAL_FAILURE`.

The record is linked to the immutable ComplianceDocument and stores the declared issue time, legal-event reference, statutory submission deadline where submission is required, buyer delivery time, QR-evidence hashes, Offline-certificate fingerprint, linked KSeF transport request and reconciliation state. Private certificate material is deliberately not persisted in this record.

Deferred modes require an explicit deadline. A total failure is modeled as no deferred KSeF submission. Where delivery before KSeF submission requires QR evidence, the workflow rejects incomplete OFFLINE/CERTYFIKAT evidence metadata. Attention queries promote missed deadlines to explicit operator review rather than silently continuing.

The application deliberately does not invent a Polish holiday calendar or autonomously determine whether a statutory special mode legally applies. The exact deadline and legal-basis decision must come from the certified Polish compliance procedure.

## Database and migration safety

Phase 5 migrations are additive. They create policy/reconciliation/special-mode evidence tables and supporting enums/indexes/FKs/check constraints. No existing financial or compliance row is rewritten. All newly venue-scoped records are protected by RLS.

Required CI evidence before merge:

- clean PostgreSQL migration deploy;
- representative historical-data upgrade;
- Prisma generate/validate;
- API tests/build;
- web tests/typecheck/build;
- Edge tests/build;
- browser E2E smoke;
- phase regression/standalone gates.

## Phase 5 acceptance matrix

| Requirement | Software state |
| --- | --- |
| Provider-neutral payment adapter/capabilities/readiness | Implemented |
| Explicit uncertain provider outcome / no blind retry | Existing + preserved |
| Terminal venue assignment / health / simulator separation | Existing + preserved |
| Offline-card risk policy and pending exposure | Implemented |
| Cash shift / paid in-out / safe drop / variance | Existing + preserved |
| Blind count / variance approval | Existing + preserved |
| Full/partial provider refund history | Existing + permission hardened |
| Immutable invoice/fiscal document from settlement snapshot | Existing + preserved |
| Concurrent document numbering / tax rounding | Existing + preserved |
| FA(3) / KSeF environment / duplicate prevention / reconcile / UPO | Existing + preserved |
| KSeF offline/special procedure tracking and deadlines | Implemented |
| Daily cross-authority discrepancy visibility | Implemented |
| Tenant isolation of new money-operation records | Implemented with FORCE RLS |

## External acceptance gates

These are required before Phase 5 can be `ACCEPTED` for the marketed Polish/payment scope:

1. **Payment terminal/provider** — run real supported terminal and provider sandbox/reference-reader scenarios for success, decline, timeout/UNKNOWN, reconnect/reconcile, refund and duplicate callback.
2. **KSeF TEST and DEMO/pre-production** — authenticate with real permitted credentials/certificates, submit FA(3), reconcile KSeF number/UPO, exercise duplicate/UNKNOWN/correction and certified special-mode/QR flows.
3. **Fiscal provider/device** — exercise the marketed fiscal adapter against real supported hardware/provider, including outage, retry and reconciliation.
4. **Polish accountant/tax/legal review** — approve marketed invoice/fiscal/KSeF scope, special-mode applicability/deadline calculation, QR/certificate handling and correction rules.

Until these are evidenced, Phase 5 must remain `SOFTWARE_DONE / BLOCKED_EXTERNAL`, not `ACCEPTED`.
