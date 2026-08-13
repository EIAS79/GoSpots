# Phase 2 cross-cutting integrity contracts

This document is the acceptance record for Phase 2 of the GoSpots Program Completion, Integrity and Improvement Plan. New late-domain work must use these primitives rather than introducing local variants.

## 1. Server-authoritative feature availability

`FeatureFlagGuard` is the HTTP enforcement point for `@RequireFeature(...)`.

The guard delegates to `CapabilityService`, which composes the canonical `FeatureFlagService` decision with the Shop subscription lifecycle. A missing subscription row preserves legacy behavior; once a subscription exists, only `TRIAL` and `ACTIVE` are entitled.

Role/permission authorization remains a separate mandatory layer through `@RequirePermissions(...)`. A capability can deny access, but it never grants a permission.

Current late-domain gates:

| Domain | Feature |
| --- | --- |
| Ticketing / RFID / Access | `access_v1` |
| Automation | `automation_v1` |
| AI insights | `ai_insights` |
| Integrations | `integrations_v1` |

There is no OWNER bypass. OWNER, MANAGER and STAFF all require feature/capability availability before the permission guard can authorize the request.

`CapabilityService.snapshot(shopId)` is the server readiness query for cross-cutting capabilities. It derives:

- card-payment readiness from subscription entitlement + `payments_v1` + `payment_terminals` + an active enabled terminal;
- fiscal readiness from subscription entitlement + `fiscal_pl` + a configured compliance profile + enabled fiscal device;
- Offline Lite, Access, Automation and AI availability from entitlement + their canonical feature flag;
- venue type and pack as returned context for callers that need product-specific UX decisions.

## 2. Canonical idempotency contract

All guided state-changing late-domain retries use `withClientIdempotency` from `apps/api/src/common/idempotency.util.ts`.

Identity:

```text
Shop + operation/scope + Idempotency-Key + deterministic request hash
```

Required semantics:

- same key + same payload: replay the stored response;
- same key + different payload: `409 IDEMPOTENCY_CONFLICT`;
- concurrent same key: one claimant executes and concurrent callers replay or receive the deterministic in-progress conflict;
- external/provider uncertainty must reconcile the same provider operation and must not be converted into a blind new write;
- memory cache is only a warm path; the database receipt is the durable source of truth.

The request hash canonicalizes object-key ordering recursively and deliberately preserves array ordering.

Current late-domain adoption:

- ticket issuance;
- ticket scan/redeem path;
- RFID load, spend, refund, reversal and tap;
- automation manual trigger;
- AI run when the client supplies an explicit idempotency key, in addition to the run's deterministic snapshot/provider/input dedupe;
- integration outbound job enqueue.

Ticket issuance does **not** persist raw admission tokens inside an idempotency receipt. Raw tokens are one-time secrets returned only to the winning first request; replays return durable ticket/order state without re-exposing the token.

### TTL and cleanup

The default receipt TTL is 24 hours. Expired receipts are ignored and deleted opportunistically when the same `(shop, scope, key)` is reclaimed. Operations may additionally prune expired rows in batches using `expiresAt`; deleting an expired `COMPLETED` or abandoned receipt does not alter the underlying domain mutation. No cleanup process may delete a non-expired `PENDING` receipt.

## 3. Durable domain-event version contract

Every new `DomainEventOutbox` payload is persisted with:

```json
{
  "eventSchemaVersion": 1
}
```

Compatibility policy:

- historical rows without `eventSchemaVersion` are interpreted as version 1;
- version 1 is the current supported schema;
- producers are rejected if they attempt to emit an unsupported version;
- consumers must use `DomainEventConsumerService` before event-specific decoding;
- an unknown future or invalid version is marked `DEAD` with an explicit error before a handler runs;
- handler failures are retriable and become `DEAD` after the bounded attempt ceiling;
- rows are claimed with `FOR UPDATE SKIP LOCKED`, then processed, then committed `PROCESSED`/`FAILED`/`DEAD`.

### Event registry convention

An event contract is identified by the pair:

```text
(eventType, eventSchemaVersion)
```

`eventType` is lower-case dot-separated text (for example `guest-check.updated`). The producer and consumer fixture for a new event type must be added in the same change. A payload-shape change that is not backward compatible requires a new schema version before a consumer depends on it.

Long-lived pre-Phase-2 outbox rows are not rewritten merely to add the marker; the compatibility reader treats a missing marker as v1. This avoids a destructive backfill while retaining an explicit contract for every new event.

## 4. Late-domain database integrity — expand/contract plan

Migration `20260813090000_phase2_late_domain_integrity` is the **expand** step.

It adds same-Shop composite foreign keys for the lifecycle relationships that are not polymorphic, Shop ownership FKs for late-domain rows, and database checks for nonnegative balances/counts. Foreign/check constraints are installed `NOT VALID` deliberately:

1. deployment cannot be blocked by historical dirty rows;
2. PostgreSQL still enforces the constraint for every new/updated row immediately;
3. production orphan queries can be run without taking a long validation lock;
4. after any historical orphan is repaired or explicitly archived, a later contract migration may `VALIDATE CONSTRAINT` without changing application semantics.

Protected lineage includes:

- ticket -> product/order;
- scan -> ticket;
- RFID credential/entry/tap -> wallet/credential and reversal -> original entry;
- automation execution -> rule, step/dead-letter -> execution;
- AI run -> snapshot, insight -> run, feedback -> insight.

The composite `(shopId, parentId)` relationships prevent a child from pointing at an otherwise valid parent in another Shop.

### Intentionally FK-less references

The following remain intentionally polymorphic/opaque and therefore do not receive a relational FK in Phase 2:

- `RfidWalletEntry.referenceType/referenceId`: may identify several business aggregate types;
- `actorUserId` / AI feedback `actorId`: retained as audit attribution and may reference identities with different retention lifecycle;
- opaque customer reference hashes: intentionally not relational customer identifiers;
- scanner/device textual references where the producing device may be external or retired.

These references must continue to be tenant-scoped by the owning row and may not be used as an authorization boundary.

`prisma/phase2-integrity-assert.ts` is the database contract assertion for the required constraints after migration.

## 5. Phase 2 change rule

A new late-domain PR must not:

- authorize a gated API with a client/UI-only check;
- bypass capability/feature availability because the actor is OWNER;
- implement a new replay table/helper when `withClientIdempotency` applies;
- persist a durable event without an explicit supported event schema version;
- add a lifecycle parent id without either a database FK or a documented polymorphic/retention reason.
