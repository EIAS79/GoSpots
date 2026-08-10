# Chunk 06 Completion — Device Registry + Payment Domain Hardening

Status: **Complete**

Implementation branch: `feat/gospots-06-device-payment-domain`

## Scope delivered

Chunk 06 establishes a provider-neutral device/payment foundation before any real payment-terminal integration. Existing Checkout cash/manual-card behavior remains unchanged.

### Device registry

Added Shop-scoped models:

- `Device`
- `PaymentTerminal`

Initial device types:

- `POS`
- `PAYMENT_TERMINAL`
- `EDGE_HUB`
- `PRINTER`
- `KDS`

The registry supports label, type, provider metadata, enable/disable state, terminal external ID/capabilities, heartbeat-derived online state, and `lastSeenAt`.

All new device rows are tenant-scoped and protected by forced PostgreSQL RLS using `app_tenant_rls_ok(shopId)`.

Settings now contains a **Devices** panel with:

- label
- type
- provider
- online/offline
- last seen
- enable/disable
- heartbeat/ping

Registry writes require `shop.manage`. Provider credentials are intentionally not stored in Device/PaymentTerminal records.

## Provider-neutral payment connector boundary

Added `PaymentConnector` with the execution-plan contract:

- `capabilities()`
- `createPayment()`
- `getPayment()`
- `cancelPayment()`
- `refundPayment()`
- `health()`

`PaymentConnectorRegistry` resolves normalized provider keys. Checkout does not contain provider-specific `if/else` branches and does not import a concrete provider implementation.

Chunk 06 does not activate Stripe, Mollie, or any terminal SDK for venue Checkout. A real connector is a Chunk 07 concern.

## Durable payment operation lifecycle

Added `PaymentOperation` as the provider-facing lifecycle separate from the existing finalized/manual Checkout `Payment` tender row.

States:

- `CREATED`
- `PROCESSING`
- `REQUIRES_ACTION`
- `AUTHORIZED`
- `CAPTURED`
- `FAILED`
- `CANCELED`
- `UNKNOWN`
- `PARTIALLY_REFUNDED`
- `REFUNDED`

### UNKNOWN semantics

`UNKNOWN` is not treated as failure.

A payment that times out or otherwise has an uncertain provider outcome is persisted with:

- state `UNKNOWN`
- `reconciliationRequired = true`

It cannot be blindly moved to another state or retried as though it failed. Provider reconciliation via `getPayment()` or normalized provider-status evidence must resolve the operation first. This prevents a timeout from becoming a duplicate charge.

## Idempotency

Provider payment creation requires an `Idempotency-Key`.

The durable uniqueness boundary is:

`(shopId, provider, idempotencyKey)`

The normalized request hash is persisted with the operation:

- same Shop/provider/key + same request => replay existing operation
- same Shop/provider/key + different request => conflict

Refunds have the same durable request-hash/idempotency protection per payment operation.

## Refund model

Added:

- `Refund`
- `RefundAllocation`

Refund rules implemented:

- only captured or partially refunded provider payments can be refunded
- amount must be positive
- allocations are required
- every allocation must point to a Checkout `PaymentAllocation` and/or `ChargeSnapshot`
- allocation total must equal refund amount
- cumulative successful refunds cannot exceed captured amount
- successful partial refund => `PARTIALLY_REFUNDED`
- successful full refund => `REFUNDED`

Refund allocation rows preserve immutable lineage back to the original Checkout financial snapshot/allocation.

## Provider event deduplication

Added `PaymentWebhookEvent` for normalized provider-event receipt and deduplication.

Unique boundary:

`(shopId, provider, eventId)`

Duplicate delivery is acknowledged as duplicate and does not apply the payment transition twice.

A provider event may reconcile an `UNKNOWN` operation because it represents provider-status evidence.

## Fake connector / simulation

Added a deterministic test-only fake connector supporting:

- successful capture
- decline
- requires action
- timeout => `UNKNOWN`
- timeout where later reconciliation returns `CAPTURED`
- cancel
- refund
- health/capability contract

The fake connector is not registered in the production module.

## Tests and acceptance

Chunk 06 tests cover:

- connector registry resolution without Checkout provider branching
- fake successful capture
- decline
- timeout/unknown
- `UNKNOWN` reconciliation requirement
- timeout => `UNKNOWN` => reconciliation => `CAPTURED`
- payment idempotent replay
- idempotency-key payload mismatch
- refund allocation lineage
- partial refund lifecycle
- duplicate normalized webhook delivery
- cross-Shop payment-operation isolation
- Shop-scoped device listing
- heartbeat-derived online status
- terminal provider requirement

### CI acceptance

Implementation commit:

`84e4c5b18f3098d467ea51c2b9e5997bbffbb2dc`

GitHub Actions CI run #160 (`31379136061`) passed all jobs:

- API lint / Jest tests / Nest build
- Web Checkout tests / TypeScript / Next.js build
- Prisma generate
- fresh PostgreSQL `prisma migrate deploy`
- migration status with no pending migrations
- Prisma validate

This satisfies Gate 06:

- Checkout does not depend on a provider implementation
- simulated connector completes the required lifecycle cases
- refunds have durable allocation lineage
- device registry is tenant-scoped

## Feature flags and rollout

- `device_registry`: product-default enabled, with explicit per-Shop override/kill switch
- `payments_v1`: **disabled by default**
- `payment_terminals`: **disabled by default**

Therefore deploying Chunk 06 does not switch venue Checkout to a real provider payment path.

## Rollback / incident response

The schema change is expand-only. Do not perform destructive production rollback of the new tables merely to disable the feature.

Operational rollback:

1. set `payments_v1 = false` for affected Shops
2. set `payment_terminals = false`
3. set `device_registry = false` if the Settings registry itself must be hidden/disabled
4. leave existing cash/manual-card Checkout paths active
5. reconcile any `UNKNOWN` payment operation with its provider before retrying or replacing it

Because Checkout is not coupled to a concrete connector in Chunk 06, disabling the provider flags does not require reverting Checkout code.

## Chunk 07 handoff

Chunk 07 should:

1. implement one real `PaymentConnector`
2. register it through `PaymentConnectorRegistry`
3. map provider terminal discovery/health/capabilities into `PaymentTerminal`
4. preserve the existing `PaymentOperation` state machine and idempotency boundaries
5. reconcile timeouts as `UNKNOWN`; never map timeout directly to `FAILED`
6. normalize provider webhooks into the existing event/deduplication path
7. keep provider-specific code outside Checkout
8. enable `payments_v1` / `payment_terminals` only for controlled pilot Shops after real-connector acceptance tests pass
