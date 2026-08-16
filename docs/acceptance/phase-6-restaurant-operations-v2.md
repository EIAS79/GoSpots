# Phase 6 — Restaurant / Bar / Café Operations v2

**Source:** GoSpots Master Product & Engineering Execution Plan v2 — Phase 6  
**Repository:** `EIAS79/GoSpots`  
**PR:** #56

## Canonical authority

Phase 6 extends, rather than replaces, the existing operational spine:

`MenuItem -> VenueOrder -> VenueOrderLine -> PrepTicket -> GuestCheck -> CheckSettlement`

`VenueOrder` remains order truth. `GuestCheck` and settlement remain commercial/financial truth. Phase 6 records restaurant-specific fulfillment metadata only: course/fire state, table-transfer history, tab state, KDS controls, printer delivery evidence, public QR token state, and menu service-mode/presentation availability.

## Implemented scope

### Menu and availability

- per-service-mode item eligibility for dine-in, takeaway, bar/cashier and QR table ordering;
- separate customer-facing and kitchen-facing item names;
- item/modifier expected-restock metadata;
- modifier 86 state and reason;
- time/day/stock/service-mode checks in canonical staff ordering and QR ordering;
- race-safe tracked-stock decrement with automatic item 86 at zero;
- versioned `restaurant.menu_availability.changed.v1` outbox events for availability changes.

### Fulfillment lifecycle

Restaurant fulfillment is explicit and separate from settlement:

`DRAFT -> PLACED -> ACKNOWLEDGED -> IN_PREPARATION -> READY -> SERVED -> CLOSED`

Cancellation is allowed before terminal fulfillment. Closing fulfillment requires canonical commercial completion; fulfillment state does not itself settle money.

### Table / seat / course operations

- table/resource and seat transfer;
- selected-item split to another table/resource;
- combine orders only when doing so does not silently merge different GuestChecks;
- immutable modifiers, price/tax snapshots and course metadata preserved during moves;
- already-fired KDS lines are re-parented rather than duplicated when an order is split after firing;
- line course numbers and `HOLD` / `FIRE_LATER` / `FIRED` controls;
- fire course or selected lines;
- existing KDS auto-routing now respects Phase 6 hold/fire metadata while preserving legacy routing for records without Phase 6 metadata.

### Bar / counter / takeaway

- named open bar tabs;
- optional same-venue authorized/captured preauthorization reference;
- repeated ordering through an idempotent append operation;
- unsettled-tab listing;
- close only after canonical order completion/refund;
- cashier origin, takeaway prep state, prep quote and ready/collected pickup state.

### KDS

- station groups and expo grouping metadata;
- configurable warning/overdue timer thresholds;
- ticket acknowledge, recall, priority/rush and hold controls;
- existing durable PrepTicket/PrepTicketLine state remains KDS authority;
- existing Edge projection/reconnect model retained;
- kitchen-facing item names feed production snapshots.

### Printer routing

- station printer and fallback printer mapping;
- durable queued/failed/printed job state;
- per-printer monotonic sequence allocation under a transaction advisory lock;
- one job per ticket/line deduplication;
- primary failure may move once to configured fallback;
- successful completion is idempotent.

### QR table ordering and customer display

- signed HMAC table token with expiry, revocation, use limit and hash-only persistence;
- tenant/resource mapping is revalidated server-side;
- public menu response contains customer-safe menu data only and applies service mode, stock, timing and 86 rules;
- QR mutations require a canonical `Idempotency-Key` and reuse the repository `IdempotencyReceipt` contract;
- repeated uses of one table token remain attached to one open GuestCheck;
- QR orders use the same VenueOrder, immutable pricing, stock, KDS and later checkout/fiscal pipeline;
- public display exposes an order number and fulfillment/pickup state without guest PII.

## Database and migration safety

Phase 6 migrations are additive and do not rewrite prior order, GuestCheck, settlement, payment or ledger facts. Every new venue-scoped table uses PostgreSQL `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` with the canonical `app_tenant_rls_ok("shopId")` predicate.

## Required acceptance evidence

Before merge, PR #56 must contain exact-head evidence for:

- Prisma generate/validate;
- clean PostgreSQL migration chain;
- representative historical-data upgrade;
- API lint/tests/build;
- web tests/typecheck/build;
- Edge tests/build and hard-outage regression;
- browser E2E;
- Phase 3 and Phase 4 regression gates;
- standalone-product boundary.

After merge, `main` post-merge checks and the production deployment/runtime must be verified before Phase 6 can be accepted.

## Physical hardware note

The Phase 6 software printer queue/fallback/retry/dedup contract is provider-neutral. A venue-specific physical kitchen printer drill remains hardware acceptance evidence where a specific printer model is marketed; it must not be confused with software correctness or used to introduce printer-vendor truth into orders/KDS.
