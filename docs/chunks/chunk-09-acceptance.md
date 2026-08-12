# Chunk 09 — Offline Lite acceptance

## Status

**DONE on PR #36.** The implementation covers the full initial offline-safe operation list from the execution plan, subject to the plan's explicit compliance boundary for cash/payment/fiscal operations.

## Browser resilience

- [x] Service worker provides app-shell/static resilience and never caches API responses.
- [x] IndexedDB retains cached venue state and queued mutations across browser refresh.
- [x] Cached open checks remain available.
- [x] Operations floor/resources are cached for local inspection.
- [x] Ordering catalog/menu is cached for local inspection/order entry.
- [x] Local timers derive from timestamps and never require 1-second server writes.
- [x] Local state is namespaced by authenticated user + Shop and purged on logout/session revocation/venue switch.

## Durable mutation outbox

Every queued operation contains stable:

```text
operationId / clientMutationId
deviceId
operationType
entityId
expectedVersion when required
occurredAt
payloadHash
payload
state / attempts / error
```

- [x] same operation ID + same content replays one durable server receipt;
- [x] same operation ID + changed content returns `IDEMPOTENCY_CONFLICT`;
- [x] ambiguous requests dispatched while believed online are not converted into a second local mutation.

## Offline-safe mutations

### GuestCheck

- [x] create with client-addressed stable ID;
- [x] update with expected version;
- [x] settlement-started/non-open checks reject local edits;
- [x] deterministic `VERSION_CONFLICT`/`STATE_CONFLICT`.

### Order add

- [x] operator can add a simple menu item locally while WAN is down;
- [x] offline order has a stable client order ID and local occurrence time;
- [x] replay validates menu item/variant/modifier references;
- [x] replay recalculates price/tax using the existing server `OrderingPricingService` inside the transaction;
- [x] client marks local order as pending server pricing and never makes its preview authoritative money;
- [x] items requiring mandatory modifier interaction remain clearly online-only in the current Offline Lite UI rather than being guessed.

### Gaming session start/end

- [x] local start uses a stable session ID and local `occurredAt`;
- [x] replay locks/revalidates the target resource and rejects cloud/resource conflicts deterministically;
- [x] replay validates maintenance, GuestCheck, group, reservation and rate-plan state;
- [x] authoritative rate snapshot is resolved on the server;
- [x] local end carries expected version and local `occurredAt`;
- [x] replay computes final accrued money server-side using the canonical Operations rate calculation;
- [x] stale session version/state is rejected instead of overwritten.

## Unsupported offline actions

The execution plan permits offline cash only when compliance rules allow an explicitly configured mode. GoSpots does not currently have an approved Offline Lite fiscal/drawer authority, therefore these remain deliberately disabled rather than guessed:

- [x] cash settlement finalization;
- [x] terminal/card authorization;
- [x] fiscal completion;
- [x] KSeF submission;
- [x] refund;
- [x] SaaS subscription billing;
- [x] final financial reconciliation.

Multi-device LAN sequencing remains Chunk 10 Edge Hub, not browser Offline Lite.

## Acceptance Gate 09

- [x] browser refresh during WAN outage preserves cached/local work;
- [x] reconnect uses durable idempotency and cannot duplicate the same queued operation;
- [x] GuestCheck/session/resource conflicts are deterministic;
- [x] unsupported money/provider/compliance actions are clearly disabled;
- [x] timer does not depend on 1-second API writes;
- [x] plan-listed local order addition is implemented;
- [x] plan-listed local session start/end is implemented with conflict/version policy;
- [x] Offline Lite remains protected by the per-Shop `offline_lite` feature flag;
- [x] final PR #36 exact-head blocking CI is green before ready-for-review transition.
