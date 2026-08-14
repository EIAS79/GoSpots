# GoSpots Financial Authority

## 1. Canonical flow

GoSpots uses one financial authority:

```text
Commercial activity
    ↓
GuestCheck / Order / Session charges
    ↓
immutable charge / price snapshots
    ↓
Settlement
    ↓
Payment / Refund
    ↓
Ledger
    ↓
Invoice / Fiscal / Reconciliation / Analytics projections
```

No report, integration, offline queue or device may create an independent authoritative revenue total.

## 2. Domain responsibilities

### GuestCheck

Owns the customer's running commercial obligation: what has been charged, adjusted and remains due. It is not proof of payment.

### Charge snapshots

Preserve the applied commercial facts used to calculate a settlement. Later catalog/rate edits must not rewrite historical charges.

### Settlement

Records the server-authoritative calculation/allocation of the check at a known version. Settlement lifecycle is separate from tender/provider lifecycle.

### Payment

Records a tender attempt and its outcome. Provider state must be mapped explicitly; a timeout/ambiguous provider result remains `UNKNOWN` or an equivalent reconciliation state until resolved.

### Refund

Creates a new financial fact. The original successful payment and sale history remain intact.

### Ledger

Represents durable financial facts used to reconcile revenue, payment/refund, cash and reporting. Legacy financial columns may remain compatibility projections while migrations are staged, but they must not become competing truth.

### Invoice / fiscal / KSeF

These are downstream legal/compliance documents and transport states. A fiscal/KSeF outage does not erase or recreate the underlying commercial/payment facts.

## 3. Money invariant

Authoritative money must use the repository's canonical decimal/minor-unit conventions, never binary floating point.

Required rules:

- currency is explicit in authoritative contexts;
- allocation and split math is deterministic;
- residual minor units are assigned deterministically;
- percentage/tax/discount rounding is defined rather than UI-dependent;
- applied prices/taxes are immutable historical snapshots;
- tips, service charges, discounts and comps are explicit facts.

## 4. Idempotency and concurrency

High-value financial mutations must use the canonical idempotency mechanism.

```text
same scope + same key + same request = deterministic replay
same scope + same key + changed request = conflict
```

Transactions/constraints/versions must prevent:

- duplicate settlement;
- duplicate tender application;
- duplicate provider charge caused by retry;
- duplicate refund;
- over-allocation across split/mixed tender;
- stale check settlement after material check mutation.

## 5. Provider uncertainty

Provider timeout is not equivalent to failure.

When an external payment result is uncertain:

1. retain the same provider operation identity;
2. mark the payment as uncertain/reconciling;
3. query or accept verified provider/webhook evidence;
4. do not issue a blind second charge;
5. settle the check exactly once when authoritative success is established.

## 6. Cash authority

Cash accountability is expressed through drawer/session/movement/count facts. Expected cash must reconcile from recorded cash movements; counted cash and variance are separate audited facts.

## 7. Offline authority

Financial actions never become offline-capable merely because they can be queued. Each operation needs an explicit offline certification policy.

Never silently merge conflicts involving:

- payment;
- refund;
- stored value;
- cash close;
- fiscal issuance.

## 8. Reporting rule

Analytics must derive from canonical financial facts and a documented metric dictionary. If checkout, ledger, cash and analytics disagree, the mismatch is a reconciliation issue to expose—not a reason to pick whichever total is convenient.

## 9. Migration rule

Future financial refactors use expand/compatible-write/backfill/verify/read-switch/contract sequencing where destructive changes would risk history. No Phase may erase historical financial facts simply to simplify a schema.
