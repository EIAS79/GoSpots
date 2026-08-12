# Chunk 09 — Offline Lite completion record

## Status

**VERIFYING on PR #36.** This record supersedes the earlier restricted implementation that supported only GuestCheck create/update.

## Delivered

Offline Lite now provides the execution-plan single-browser WAN resilience model:

- service-worker app-shell/static caching with API responses excluded;
- credential-free auth/venue recovery snapshots;
- user + Shop namespaced IndexedDB caches and outbox;
- stable device ID, operation ID, payload hash, occurrence time and expected version;
- cached open GuestChecks, Operations floor/resources and ordering catalog;
- local elapsed timers;
- operator-visible pending/conflict/failed sync state;
- serial reconnect replay using durable `IdempotencyReceipt` receipts;
- deterministic same-ID/different-content conflict;
- no conversion of an ambiguous already-dispatched online mutation into a second local mutation.

### GuestChecks

Offline create/update remains versioned and settlement-aware.

### Orders

Offline Lite can now add safe/simple orders locally. The browser queues references and marks the local row `pendingServerPricing`; during replay the API validates current catalog references and calls the canonical `OrderingPricingService` inside the transaction. Authoritative price/tax totals are therefore never client-generated.

### Gaming sessions

Offline Lite can now start and end gaming/resource sessions locally. Replay uses resource locking/conflict checks, validates current reservation/maintenance/rate-plan state, resolves the server rate snapshot, and uses the canonical Operations accrued-money calculation. Session end requires the captured expected version.

### Explicit online-only boundary

Cash settlement finalization, card/terminal payment, fiscalization, KSeF, refunds, subscription billing and final reconciliation remain online-only. This is intentional: the execution plan permits offline cash only when an approved compliance/device mode exists. Chunk 09 does not pretend the browser is a fiscal/payment authority. Multi-device local authority remains Chunk 10 Edge Hub.

## Verification

The API tests cover durable replay, version conflict, client-addressed creation, server-authoritative offline-order replay and deterministic resource conflict. The web Offline Lite suite covers capability policy, mutation envelope, offline clients, refresh recovery, timer behavior, SW API exclusion and ambiguous-online-mutation safety.

See `chunk-09-acceptance.md` for the exact gate checklist. The record becomes **DONE** only when the final PR #36 head has all blocking CI jobs green.

## Rollout

1. Deploy with `offline_lite` disabled for production Shops unless already approved.
2. Enable an internal/pilot Shop.
3. Seed the dashboard/floor/menu/check cache while online.
4. Exercise WAN loss: start a resource session, add an offline-safe item, end the session, refresh, reconnect.
5. Confirm the outbox drains once and any conflict is operator-visible.
6. Do not enable offline payment/fiscal completion through this browser path.

## Rollback

Disable the Shop `offline_lite` flag. Do not silently delete unresolved local mutations; review/discard them explicitly. Logout/session revocation still purges local private state.
