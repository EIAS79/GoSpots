# Phase 4 — Canonical Commercial Core

## Scope

Phase 4 makes `GuestCheck -> CheckSettlement -> Payment -> LedgerEntry` the single commercial path for venue revenue.

It covers session time, menu/product orders, services, fees, reservation charges, deposits, gratuity, authorized adjustments, split allocation, partial/mixed tender, tab transfer/merge, commercial receipts and commercial day-close tab policy.

It does **not** implement fiscal issuance, KSeF, terminal lifecycle, refund provider orchestration or cash-shift lifecycle. Those remain later-phase responsibilities.

## Canonical authority map

| Concern | Canonical authority |
| --- | --- |
| Open customer/group bill | `GuestCheck` |
| Tab context | `GuestCheckCommercialProfile` |
| Legacy order charge | `ShopOrder` |
| Modern order charge | `VenueOrder` + immutable `VenueOrderLine.priceSnapshot` |
| Legacy timed charge | `PlaySession` |
| Live-operations timed charge | `OperationsSession` |
| Reservation charge | `Reservation` |
| Discount / comp / override / deposit application | `CommercialAdjustment` |
| Service charge | `GuestCheckServiceCharge` |
| Gratuity | `GuestCheckTip` |
| Immutable bill snapshot | `CheckSettlement` + `ChargeSnapshot` |
| Payment attempt/fact | `Payment` + `PaymentAllocation` |
| Monetary ledger | **`LedgerEntry` only** |
| Ledger semantic classification | `LedgerFactMetadata` (no amount/currency columns) |
| Non-fiscal receipt | `CommercialReceipt` |
| Merge/transfer lineage | `GuestCheckMergeEvent` + `CommercialMergeEvent` |
| Commercial day-close boundary | `CommercialDayClose` |

`LedgerFactMetadata` is deliberately non-monetary. It cannot hold a balance or become a second source of financial truth.

## Unified settlement projection

`CommercialSettlementService` is the controller-facing calculation/settlement authority.

It combines:

1. legacy `ShopOrder` charges;
2. legacy `PlaySession` charges;
3. reservation charges;
4. modern `VenueOrder` line snapshots including stored tax/price metadata;
5. finished Phase 3 `OperationsSession.accruedMinor` usage;
6. authorized commercial adjustments;
7. service charges;
8. gratuity.

When an `OperationsSession` owns a reservation, the reservation's legacy timed line is suppressed from the same projection. This prevents the same visit from being charged once as a reservation/play line and again as the canonical Phase 3 operations session.

A settlement cannot be created while a participating modern order or operations session remains unresolved. The API returns a `FINALIZE_BILL` state conflict with explicit blockers.

## Money and split invariants

All persisted monetary values use the repository money helpers/Decimal or integer minor units. No new floating-point financial persistence is introduced.

The existing `PaymentAllocationService` remains canonical for split calculations. Equal split assigns deterministic residual minor value to the final part; custom/by-line/by-source/percentage allocation is reconciled to the authoritative outstanding amount. Successful payments must equal the sum of their allocations.

A `CheckSettlement` is immutable for a GuestCheck version. Mutating a still-unpaid check voids its current calculated settlement and increments the check version. A paid settlement is never silently recalculated.

## High-risk commercial mutations

- Manual percentage/fixed/promotion discount requires `discount.manual`.
- Manager comp requires `comp.apply`.
- Price override requires `price.override` and targets exactly one charge line.
- Reopen requires `checkout.reopen`.
- All use required idempotency keys at the HTTP mutation boundary.
- All use optimistic GuestCheck/order versions.
- All significant mutations are audited with reason and before/after context.
- Venue policy controls maximum discount basis points, maximum comp amount and maximum price reduction.

## Reopen boundary

A settled check with any successful payment or non-zero canonical ledger fact is financially immutable.

A reopen request is recorded as `REFUND_RESALE_REQUIRED` and rejected without mutating the check. Later refund/re-sale/fiscal behavior must operate as new financial facts; it may not erase or rewrite the historical settlement.

Only a settled check with no financial effect can be reopened directly, with reason, audit and version increment.

## Ledger durability

Phase 4 database triggers post source events into `LedgerEntry` independent of the legacy `LEDGER_DUAL_WRITE` flag. The writer is idempotent on the existing `(shopId, sourceType, sourceId, kind)` uniqueness boundary.

Bridged sources include:

- `ShopOrder` completion;
- `VenueOrder` completion;
- `PlaySession` completion;
- `OperationsSession` finish;
- billed reservation;
- successful checkout payment;
- cash movement;
- quick-sale/expense/refund `Transaction`;
- `ShopLoss`;
- stored-value ledger entries;
- reservation-deposit ledger entries;
- legacy tip ledger entries;
- Phase 4 adjustments, deposit application, service charge and gratuity when the settlement closes.

Historical rows are backfilled through the same idempotent posting function. Merge/transfer operations do not rewrite old ledger rows; lineage records preserve how source charges moved between GuestChecks.

## Commercial receipt

Closing a fully paid settlement writes one immutable `CommercialReceipt` containing the exact settlement, `ChargeSnapshot` rows and successful payment rows. The document type is explicitly `NON_FISCAL_COMMERCIAL_RECEIPT`.

Phase 4 must never represent this document as a fiscal receipt or invoice.

## Commercial day close

Phase 4 enforces unresolved-tab policy independently of Phase 5 cash shifts.

`POST /commercial/day-close`:

- succeeds normally when no open GuestChecks remain;
- may succeed with unresolved tabs when venue policy explicitly allows it;
- otherwise blocks staff;
- allows OWNER/MANAGER override only with an explicit reason;
- stores the open-tab count, override flag/reason, actor and business date;
- is idempotent by business date and by the canonical HTTP idempotency mechanism.

This is the Phase 4 commercial boundary only. It does not close tills, fiscal days or accounting periods.

## Compatibility

Legacy source models remain supported while they are still used elsewhere in the product. They are adapters into the same settlement and ledger authority, not competing check/ledger systems.

New work must not:

- create a second monetary ledger;
- settle modern `VenueOrder` outside `CheckSettlement`;
- settle `OperationsSession` usage through a separate payment authority;
- mutate paid `CheckSettlement` / `ChargeSnapshot` history;
- infer authorization from hidden UI controls;
- treat non-fiscal commercial receipts as fiscal documents.
