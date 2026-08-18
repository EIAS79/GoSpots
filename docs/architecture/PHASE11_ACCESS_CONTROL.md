# Phase 11 — Ticketing and Access-Control Architecture

## Authority boundaries

Phase 11 does not create a second revenue system.

```text
MenuItem / ShopOrderLine
        ↓
GuestCheck → CheckSettlement (PAID/CLOSED)
        ↓
TicketOrder (fulfillment record only)
        ↓
Ticket / AccessCredential
        ↓
AccessEvent / LockerAssignment
```

A new `TicketOrder` cannot be fulfilled unless the source `CheckSettlement` belongs to the authenticated venue and is already `PAID` or `CLOSED`. The ticket row carries immutable lineage to the paid `ChargeSnapshot` / commercial line. `TicketOrder.totalMinor` remains nullable solely to preserve historical pre-Phase-11 records and is not written for new fulfillment.

RFID/NFC/wristband stored value follows the existing Phase 9 authority:

```text
AccessCredential
        ↓
StoredValueAccount
        ↓
StoredValueLedgerEntry
```

The legacy `RfidWallet` and `RfidWalletEntry` tables remain for non-destructive upgrade compatibility. Phase 11 exposes no endpoint that creates a new financial fact in those tables.

## Credential security

- QR tickets are generated from 24 random bytes (192 bits) and encoded in a `gst_...` token.
- Only an HMAC digest is persisted.
- Raw QR secrets are returned only on first successful issuance/reissue.
- Shared idempotency receipts deliberately remove raw secrets, so replay never re-exposes a one-time token.
- RFID/NFC/wristband raw UIDs are also HMACed before persistence.
- Cancel/reissue revokes the previous access credential.

## Access evaluation

The authenticated venue is always derived from JWT context. Access evaluation is performed server-side in this order:

1. resolve active zone;
2. validate scanner identity/zone/policy when a scanner is supplied;
3. validate ordered scanner sequence for replay protection;
4. resolve credential by venue + token hash;
5. row-lock credential and zone-lock access decision;
6. validate status/expiry/ticket scan limit;
7. evaluate active access rules;
8. detect duplicate enter/exit from event history;
9. enforce capacity;
10. append the access decision event;
11. advance ticket/credential state only for allowed entry;
12. enqueue a versioned domain event.

Denied credentials never disclose cross-tenant entity details.

## Occupancy authority

There is no mutable `occupancy` field. Current occupancy is a projection:

```text
SUM(AccessEvent.occupancyDelta WHERE decision = ALLOWED)
```

- ENTER = `+1`
- EXIT = `-1`
- VERIFY = `0`
- CORRECTION = explicit delta from current projection to manager-entered target

Manual correction requires a reason and writes both append-only access evidence and the central audit log. Historical events are not rewritten.

## Scanner continuity boundary

Phase 11 models only the access-specific offline requirement from its source:

- scanner has an explicit `allowOfflineCache` policy;
- optional cache TTL is stored;
- access replay carries an ordered device sequence;
- duplicate/stale sequence is rejected;
- offline replay is rejected when the scanner policy does not allow it.

This is not full venue offline authority. Checkout, cash/card mutation, Edge-local commercial state and conflict synchronization remain Phase 12 work and are intentionally not implemented here.

## Lockers

A locker can optionally reference canonical menu items for rental and deposit. If either is configured, assignment requires a paid settlement containing those commercial lines. The locker does not create its own fee/deposit amount.

Database partial unique indexes prevent:

- two active assignments on one locker;
- one credential holding two active locker assignments.

Hardware OPENED/CLOSED events remain operational evidence. A manual override requires an explicit reason and central audit entry.

## Concurrency and idempotency

Phase 11 uses the platform kernel instead of module-specific alternatives:

- `IdempotencyReceipt` + canonical request hash;
- PostgreSQL advisory locks for ticket fulfillment, ticket mutation, access-zone decisions and locker assignment/release;
- unique settlement fulfillment;
- unique `(shopId, deviceId, deviceSequence)` scanner sequence;
- unique Phase 11 event idempotency keys;
- partial unique active locker assignments;
- optimistic versions on mutable high-risk aggregates.

## Migration strategy

The migration is expand-compatible:

- legacy ticket/RFID rows are preserved;
- no legacy amount/balance is rewritten;
- canonical lineage fields are nullable for historical data;
- historical records are never fabricated into paid settlement/stored-value lineage;
- new Phase 11 tables and constraints are additive.

The Phase 11 CI gate tests both a clean PostgreSQL 17 migration and an upgrade containing representative legacy ticket and RFID records.
