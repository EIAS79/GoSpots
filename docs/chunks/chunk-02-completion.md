# Chunk 02 Completion — GuestCheck + Settlement Core

## Status

**PASS — implementation and blocking CI gate completed.**

- Branch: `agent/gospots-00-repository-baseline`
- Draft PR: #10
- Main branch: **not merged / untouched**
- Implementation verification: GitHub Actions CI #107 (`31337311787`)
- Verification commit: `bfb4cbec99a71c81f4b1eb7ce328f52211d1ae58`
- Production rollout: **not enabled**; `checkout_v2` remains off until the staged 00–03 change set is ready to deploy.

## Scope delivered

### Settlement persistence

Added the expand-only migration `20260809234000_chunk02_settlement_core` with:

- `GuestCheck.version` optimistic concurrency token;
- `GuestCheck.currentSettlementId` relationship;
- `CheckSettlement` with states `OPEN`, `CALCULATED`, `PARTIALLY_PAID`, `PAID`, `CLOSED`, `VOID`;
- immutable `ChargeSnapshot` rows;
- `Decimal(19,4)` subtotal/adjustment/tax/deposit/total/due amounts;
- unique `(guestCheckId, checkVersion)` settlement protection;
- indexed non-unique source hash for reconciliation/provenance;
- forced Shop-scoped RLS on both new settlement tables.

No existing money column was rewritten or converted.

### Checkout module and API

Added `apps/api/src/modules/checkout/` with:

- `CheckoutModule`;
- `CheckoutController`;
- `CheckoutService`;
- `ChargeCalculatorService`;
- `SettlementStateService`;
- checkout DTOs.

APIs:

- `POST /checkout/checks/:checkId/preview`
- `POST /checkout/checks/:checkId/settlements`
- `GET /checkout/settlements/:id`

All three routes are Shop-scoped and gated by `checkout_v2`.

### Source-to-charge mapping

The calculator reproduces existing finance outcomes rather than redesigning pricing:

- **ShopOrder:** active line snapshots + embedded reservation fee; explicit reconciliation line preserves the stored authoritative order total if old line derivation differs.
- **Walk-in PlaySession:** canceled and reservation-linked sessions excluded; stored amount used; existing unpaid discount applied; already-completed amount is not discounted twice.
- **Reservation/booked play:** reuses the existing `PlayBillingService.mapPlayBillingRow` pricing result, including current rate, duration, party/bowling semantics, base override and existing discount behavior.
- **Linked PlaySession:** excluded to prevent double counting with reservation billing.
- Explicit cross-currency source mismatches are rejected; Chunk 02 does not perform intra-check FX conversion.

The full contract is documented in `docs/engineering/checkout-charge-mapping.md`.

### Deterministic settlement totals

For Chunk 02:

- `subtotal = sum(ChargeSnapshot.finalAmount)`;
- `adjustments = 0` placeholder;
- `taxAmount = 0` placeholder;
- `depositAmount = 0` placeholder;
- `total = subtotal + adjustments + tax - deposit`;
- `amountDue = total` because tender/payment allocation is deferred.

`sourceHash` fingerprints the commercial snapshot content and does not include GuestCheck version, so it remains useful as a charge-state reconciliation fingerprint.

### Snapshot immutability

Settlement creation copies description, quantity, unit amount, gross amount, existing discount, final amount, currency and pricing metadata into `ChargeSnapshot`. Later source names/prices do not mutate existing snapshot rows.

No update API for `ChargeSnapshot` is introduced in Chunk 02.

### Concurrency and GuestCheck integration

- Settlement creation requires `expectedVersion`.
- GuestCheck is conditionally claimed using the supplied version in the settlement transaction.
- Successful creation increments GuestCheck version and sets `currentSettlementId`.
- Stale callers receive `VERSION_CONFLICT`.
- Legacy GuestCheck update/attach/detach/void/settle operations bump the version and clear any current settlement link so an old snapshot is not silently retained as current after those changes.
- Existing GuestCheck status semantics remain OPEN/SETTLED/VOID; the new settlement state machine is separate.

### Idempotency

Added the `checkout.settlements.create` idempotency scope.

`POST /checkout/checks/:checkId/settlements` requires `Idempotency-Key` even though Chunk 02 does not charge a tender. Repeating the same request/key replays the stored response instead of creating another settlement.

### Permissions, audit and events

Added:

- `checkout.read`;
- `checkout.write`.

Settlement creation:

- emits durable `settlement.created` through `DomainEventOutboxService` inside the same Prisma transaction;
- records an existing GoSpots audit entry after commit including correlation ID and `charged: false`.

### Finance isolation / no charging

Chunk 02 does **not** create or update:

- payment provider objects;
- guest payment/tender rows;
- `Transaction` revenue rows;
- `LedgerEntry` revenue rows.

Existing ShopOrder, PlaySession and Reservation payment/ledger posting remains unchanged. With `checkout_v2` off, current venues continue on their existing finance behavior.

## Automated test coverage added

### Charge calculator

- session-only;
- order-only;
- legacy order-total reconciliation;
- reservation-only using existing play-billing outcome;
- mixed GuestCheck;
- reservation-linked play anti-double-count;
- zero amount;
- existing discount;
- mixed explicit currency rejection;
- deterministic source hash/preview for a fixed input/time;
- `sum(snapshot.finalAmount) == subtotal == total == amountDue` invariant;
- frozen preview value survives later source edits.

### Settlement service/state

- settlement + snapshots + event written through one transaction;
- no Transaction/Ledger/payment delegate involved;
- stale GuestCheck version rejected before settlement creation;
- settlement retrieval includes actor Shop in query;
- `checkout_v2` disabled path blocks Checkout V2 without touching GuestCheck data;
- supported/unsupported settlement state transitions.

### Endpoint idempotency

- repeated create request with same Shop/key/payload executes settlement creation once and replays response;
- missing `Idempotency-Key` is rejected.

## Automated verification

GitHub Actions CI #107 passed on the implementation commit:

- API Prisma generate: **PASS**
- API Jest suite including Chunk 02 tests: **PASS**
- API production build: **PASS**
- Web TypeScript check: **PASS**
- Web production build: **PASS**
- Fresh PostgreSQL `prisma migrate deploy`: **PASS**
- `prisma migrate status`: **PASS**
- `prisma validate`: **PASS**

Strict lint remains the documented Chunk 00 advisory debt and was not mass-reformatted into this financial change set.

## Chunk 02 acceptance gate

- [x] Mixed GuestCheck returns deterministic preview for fixed source state/time.
- [x] Session-only, order-only and reservation-only calculations covered.
- [x] Existing discounts reproduced.
- [x] Snapshot line sum equals settlement subtotal/final due.
- [x] Frozen snapshot values survive later source name/price edits.
- [x] Repeated idempotent create request does not create a duplicate settlement.
- [x] GuestCheck optimistic version conflict covered.
- [x] Settlement reads/writes are Shop scoped and protected by RLS.
- [x] `checkout_v2` disabled path preserves existing behavior.
- [x] No provider payment or revenue/ledger charge is created.
- [x] Migration deploy/status/schema validation passed on disposable PostgreSQL.
- [x] Existing API/web regression gate remains green.
- [x] No merge to `main`.

## Pilot / rollout note

The execution plan calls for pilot-Shop rollout, but this project is intentionally staging Chunks 00–03 together before merge/deployment. Therefore no production Shop is enabled during Chunk 02. The feature flag defaults off in production, and a specific pilot Shop can be enabled only after the combined 00–03 build is ready for deployment.

## Rollback / compatibility notes

- Migration is additive; application rollback can leave the new tables/columns in place safely.
- Existing GuestCheck status and legacy settlement endpoint are retained.
- Existing finance ledger/revenue behavior remains authoritative while `checkout_v2` is off.
- New Checkout APIs are inaccessible without the Shop rollout flag.
- No payment-provider dependency is introduced in Chunk 02.

## Next dependency

Chunk 03 may build the cashier/Checkout V2 UI and consume these preview/settlement APIs. Chunk 03 must not merge independently; the staged branch remains unmerged until the combined 00–03 acceptance gate is complete.
