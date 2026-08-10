# Chunk 04 — Split, Merge, Partial and Mixed Settlement

**Status:** implementation complete; final CI acceptance required before merge.

**Depends on:** Chunks 02 and 03.

## Scope delivered

Chunk 04 finishes provider-neutral bill manipulation on top of the immutable `CheckSettlement` / `ChargeSnapshot` settlement core.

Delivered:

- venue checkout `Payment` records;
- exact `PaymentAllocation` rows against immutable charge snapshots;
- payment allocation by:
  - line/item;
  - source/activity;
  - equal split;
  - percentage;
  - custom amounts;
  - remaining balance;
- partial settlement;
- mixed manual tenders (`CASH`, `MANUAL_CARD`, `OTHER`);
- full GuestCheck merge;
- selective movement of attached order/play/reservation charge sources between compatible checks;
- durable merge lineage through `GuestCheck.mergedIntoCheckId` + `GuestCheckMergeEvent`;
- cashier-visible merge history;
- per-Shop `checkout_split` kill switch;
- durable idempotency on payment, merge, and move mutations;
- optimistic concurrency and transactional row locking around payment/merge mutations;
- cashier split/mixed-tender UI integrated into the existing Checkout V2 surface.

## Deliberate boundaries

This chunk does **not** introduce an external payment provider or terminal connector.

`MANUAL_CARD` means that a cashier records an externally/manual-observed card tender. It does not contact a terminal or claim provider authorization/capture.

This chunk also does not add:

- payment-terminal/device integration — later payment/device chunks;
- refunds/refund allocations — later payment hardening chunk;
- cash drawer/session enforcement — Chunk 05;
- fiscal/KSeF posting — later fiscal/compliance chunks.

## Database delta

Expand-only migration:

`apps/api/prisma/migrations/20260810011500_chunk04_split_merge_settlement/migration.sql`

Adds enums:

- `CheckoutPaymentMethod`
- `CheckoutPaymentStatus`
- `PaymentAllocationKind`

Adds tables:

- `Payment`
- `PaymentAllocation`
- `GuestCheckMergeEvent`

Adds nullable self-reference:

- `GuestCheck.mergedIntoCheckId`

All new Shop-scoped tables enable and force the existing tenant RLS policy helper.

No existing finance/revenue table or column is dropped, renamed, or rewritten.

## Settlement invariants

### Allocation conservation

Every successful payment is calculated from its allocations in the same transaction:

```text
sum(PaymentAllocation.amount) == Payment.amount
```

The server rejects:

- zero/negative allocations;
- duplicate snapshot allocation entries inside one payment;
- allocation above a snapshot's remaining amount;
- payment above the settlement's current `amountDue`;
- allocation against a stale/non-current/void/paid settlement.

No tip/overpayment path exists in Chunk 04.

### Partial/mixed settlement

A successful payment updates only settlement progress:

```text
CALCULATED -> PARTIALLY_PAID -> PAID
```

`CheckSettlement.total` and `ChargeSnapshot` rows remain immutable. `amountDue` is reduced transactionally.

Each payment increments the owning GuestCheck version. A stale cashier/till version is rejected rather than silently allocating against changed state.

The settlement row is locked with `FOR UPDATE` before remaining balances are validated, preventing two concurrent tills from both consuming the same remaining balance.

### No duplicate revenue

Chunk 04 payment and merge services intentionally do **not** create:

- legacy finance `Transaction` revenue rows;
- `LedgerEntry` revenue rows;
- external provider charges.

Tests assert these write paths are not called.

## Split behavior

`PaymentAllocationService` computes all splits on the server from immutable snapshots minus prior successful allocations.

Supported modes:

- `LINE`
- `SOURCE`
- `EQUAL`
- `PERCENTAGE`
- `CUSTOM`
- `REMAINING`

Equal split uses 4-decimal settlement precision and assigns any rounding residue to the final part so generated groups conserve the exact remaining amount.

Quantity allocations are proportional to the allocated money amount without changing the original operational line/usage event.

## Failure handling

Each payment is its own transaction.

Therefore:

- a successful cash leg remains successful if a later manual-card/other leg is not completed;
- later failure does not roll back an earlier successful tender;
- the cashier can reload payment state and continue from the remaining balance;
- repeated mutation retries use durable idempotency receipts.

## GuestCheck merge and movement

Compatible checks must:

- belong to the same Shop;
- both be `OPEN`;
- use the same currency;
- not already be merged;
- have no successful Chunk 04 payment recorded on either check.

Full merge:

1. locks both checks in deterministic ID order;
2. verifies optimistic versions;
3. moves attached ShopOrders, PlaySessions, and Reservations to the destination;
4. invalidates the destination's current settlement snapshot;
5. marks the source check `VOID` and records `mergedIntoCheckId`;
6. writes `GuestCheckMergeEvent` containing source, destination, actor, timestamp, and moved relationship IDs;
7. emits a domain outbox event and audit record.

Selective charge movement relinks only the selected attached sources, invalidates both current settlement snapshots, increments both GuestCheck versions, and records outbox/audit context.

No merge/move operation posts revenue.

## API

Existing Checkout convention is retained under `/checkout`:

```text
GET  /checkout/settlements/:id/payment-state
POST /checkout/settlements/:id/payment-groups/preview
POST /checkout/settlements/:id/payments
POST /checkout/checks/:destinationCheckId/merge
POST /checkout/checks/:sourceCheckId/move-charges
GET  /checkout/checks/:checkId/merge-history
```

Payment, merge, and move POST mutations require `Idempotency-Key` and use Shop-scoped durable idempotency receipts.

## Cashier UI

The existing Checkout V2 surface now provides:

- direct **Cash** payment of the current remainder;
- direct **Manual card** payment of the current remainder;
- direct **Other** manual tender;
- **Split** panel with:
  - 2/3/4 and arbitrary equal-part shortcuts;
  - item split;
  - activity/source split;
  - percentage split;
  - custom amount groups;
  - remaining-balance group;
  - per-group Cash / Manual card / Other tender choice;
- live paid and remaining totals;
- payment-state continuation after partial payment;
- **Merge / move** panel with both directions;
- selective attached-source movement;
- full merge;
- visible merge history.

After the first successful payment, bill-source editing and merge/move controls are locked. This prevents later operational edits from invalidating a settlement that already has money allocations.

## Feature rollout

`checkout_split` becomes a product-default feature after this chunk.

An explicit per-Shop `ShopFeatureFlag(enabled=false)` remains authoritative as an emergency rollout/compatibility kill switch. Shop A's override does not affect Shop B.

## Automated acceptance coverage

### Allocation/property-style tests

`payment-allocation.service.spec.ts` covers:

- line split;
- source split;
- 3-way rounding residue;
- 4-way guest-style equal split;
- percentage;
- custom amounts;
- remaining balance;
- proportional/fractional quantity;
- custom over-allocation rejection;
- generated equal-split matrix across many amounts/part counts proving allocation conservation.

### Partial/mixed payment tests

`checkout-payment.service.spec.ts` covers:

- cash partial payment;
- `PARTIALLY_PAID` transition;
- manual-card remainder;
- `PAID` transition;
- zero remainder;
- mixed tender history;
- duplicate snapshot allocation rejection;
- absence of duplicate finance/ledger writes.

### Idempotency tests

`checkout.controller.spec.ts` covers durable replay of a repeated payment-allocation request so the service executes only once for the same Shop/scope/key/payload.

The existing cross-cutting idempotency suite continues to cover payload mismatch and Shop isolation.

### Merge/move tests

`guest-check-merge.service.spec.ts` covers:

- moving all supported attached source types;
- source lineage/voiding;
- version increments;
- durable merge event creation;
- successful-payment merge rejection;
- selective movement;
- invalidation of both settlement snapshots;
- absence of Transaction/LedgerEntry revenue writes.

### UI tests

Checkout presenter tests cover:

- mixed charges;
- access roles;
- disabled unauthorized controls;
- Chunk 04 manual tender labels;
- state conflict/offline states;
- empty/large bills;
- server-derived totals;
- partial-payment paid/remaining presentation.

## Gate 04 mapping

- [x] Equal/item/source/custom split work.
- [x] Percentage and remaining-balance split work.
- [x] Mixed tender data model is persisted through Payment + PaymentAllocation.
- [x] Check can be partially paid and later reach zero remainder.
- [x] Merge history is durable, auditable, and visible in Checkout.
- [x] Repeated allocation mutation is idempotent.
- [x] Merge/move operations preserve source amounts and do not post revenue.
- [x] No duplicate revenue posting is introduced.
- [ ] Final repository CI on the exact merge candidate.

## Rollback / compatibility

The migration is additive. If application rollback is needed after deployment:

1. disable `checkout_split` for affected Shops;
2. roll application code back to the prior compatible release;
3. retain the additive Payment/Allocation/Merge tables and nullable lineage column;
4. do not destructively drop financial/history rows as an operational rollback step.

The prior Checkout V2 settlement schema remains readable because existing columns/tables are not removed or repurposed.
