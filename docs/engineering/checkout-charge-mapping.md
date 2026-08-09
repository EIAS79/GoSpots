# Checkout V2 charge-source mapping — Chunk 02

## Purpose

Chunk 02 introduces an immutable settlement calculation without replacing the existing revenue-posting paths. The calculator must reproduce the amount GoSpots already considers due for each source and must not create a provider payment, `Transaction`, or `LedgerEntry`.

## Authoritative currency

1. Use `GuestCheck.currency` when present.
2. Otherwise use `Shop.currency`.
3. A source with an explicit different currency is rejected as `STATE_CONFLICT`; Chunk 02 does not perform FX conversion inside a GuestCheck settlement.

All persisted settlement money uses `Decimal(19,4)`. Calculations use Prisma Decimal helpers. The API keeps the existing fixed four-decimal money wire.

## Source mapping

### ShopOrder

- Ignore `CANCELED` orders.
- Snapshot each `ACTIVE` `ShopOrderLine` using its stored name, quantity and unit price.
- Line gross/final follows the existing order-line rounding boundary.
- If `tableReserved` and `reservationFee` is non-zero, snapshot the fee once; it is already embedded in `ShopOrder.total` and is not added a second time outside the order.
- Compare derived active-line + fee total with the authoritative stored `ShopOrder.total`.
- If they differ, add an explicit `legacy-total-reconciliation` snapshot line so the settlement total exactly preserves the existing stored order outcome.
- Do not modify or repost the ShopOrder's existing ledger entry.

### Walk-in PlaySession

- Ignore `CANCELED` sessions.
- Ignore sessions with `reservationId`; those are billed through the reservation and counting both would duplicate revenue.
- Use the stored `PlaySession.amount` as the base amount, matching the existing walk-in billing flow.
- If already paid/completed, the stored amount is treated as final and is not discounted a second time.
- If unpaid, apply the existing `billingDiscountPercent` policy.

### Reservation / booked play

- Ignore `CANCELED` and `NO_SHOW` reservations.
- Reuse the existing `PlayBillingService.mapPlayBillingRow` calculation, including current rate selection, duration, party-size semantics, bowling mode, base override and existing discount behavior.
- If already billed, the existing stored billed outcome remains authoritative.
- A non-play reservation with no existing charge basis remains a zero placeholder in Chunk 02; this chunk does not invent a new dining/event reservation fee policy.
- Reservation-linked PlaySession rows remain excluded.

## Settlement totals

For Chunk 02:

- `subtotal` = sum of immutable snapshot `finalAmount` values.
- `adjustments` = `0.0000` placeholder.
- `taxAmount` = `0.0000` placeholder.
- `depositAmount` = `0.0000` placeholder.
- `total` = subtotal + adjustments + tax - deposit.
- `amountDue` = total because payment/tender allocation is deferred to later chunks.

The invariant is:

```text
sum(ChargeSnapshot.finalAmount) == CheckSettlement.subtotal == CheckSettlement.total == CheckSettlement.amountDue
```

until later chunks add supported adjustments/tax/deposit/payment allocations.

## Snapshot immutability

`ChargeSnapshot` stores the commercial description and amounts at settlement calculation time. A later rename or price edit of a MenuItem, ShopOrderLine, resource or other source does not mutate an existing settlement snapshot.

A `sourceHash` fingerprints the charge content for diagnostics/reconciliation. It is indexed but intentionally not unique: identical financial content can legitimately be recalculated after a non-financial GuestCheck version change.

## Concurrency and idempotency

- `GuestCheck.version` is the optimistic concurrency token used by settlement creation.
- Settlement creation requires the client `expectedVersion` and an `Idempotency-Key`.
- `(guestCheckId, checkVersion)` is unique in `CheckSettlement`.
- Repeating the same request/key returns the stored idempotent response rather than creating a duplicate settlement.
- A stale version returns `VERSION_CONFLICT`.
- Legacy GuestCheck metadata/attach/detach/close mutations bump the version and clear `currentSettlementId`.

## Rollout and finance isolation

The three Checkout APIs require the Shop-scoped `checkout_v2` feature flag. Missing production flags are disabled, so existing venues continue using the current GuestCheck/finance behavior.

Chunk 02 settlement creation only writes:

- `CheckSettlement`;
- `ChargeSnapshot`;
- `GuestCheck.currentSettlementId` / `GuestCheck.version`;
- `DomainEventOutbox` (`settlement.created`);
- existing audit log after commit.

It does **not** write a provider payment, payment intent, tender, `Transaction`, or `LedgerEntry`, and therefore does not charge the guest or create a second revenue event.
