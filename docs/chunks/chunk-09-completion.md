# Chunk 09 — Offline Lite — completion record

## Status

Engineering implementation complete behind the per-Shop `offline_lite` feature flag, subject to the exact-head and post-merge CI gates recorded on PR #22.

## Delivered

### Browser resilience

- Service worker app-shell/static caching.
- API responses are never cached by the service worker.
- Only the most recently opened dashboard navigation shell is retained for hard-refresh WAN recovery.
- Private navigation cache is purged on logout/session revocation.
- Minimal credential-free auth snapshot and last venue-settings snapshot allow an already-entitled venue dashboard to reopen during transient WAN loss.
- No access token, refresh token, session cookie, payment-provider secret, KSeF credential or fiscal-device credential is copied into Offline Lite storage.

### IndexedDB cache + outbox

- `gospots-offline-v1` IndexedDB database with explicit `cache` and `outbox` stores.
- Data is namespaced by authenticated user + Shop.
- Stable browser `deviceId` and stable UUID `operationId`.
- Canonical payload SHA-256.
- Outbox records expected entity version, operation type, payload hash, creation time, attempts, last error and terminal state.
- Venue switches purge the prior Shop namespace, including across React layout remounts.
- Logout/session revocation purges IndexedDB, entitlement metadata, auth/venue snapshots and private navigation shell.

### Replay safety

Dedicated `POST /offline-sync/operations` command boundary; ordinary online mutation endpoints are not blindly replayed.

Supported Offline Lite write commands in this chunk:
- `CHECK_CREATE`
- `CHECK_UPDATE`

Server guarantees:
- existing `IdempotencyReceipt` is the durable replay receipt;
- same device/op ID + same content returns the completed response;
- same device/op ID + different content returns `IDEMPOTENCY_CONFLICT`;
- check updates require `expectedVersion`;
- newer server version returns `VERSION_CONFLICT` without overwrite;
- non-open/settlement-started checks return deterministic state conflict;
- Shop isolation and `offline_lite` feature flag are enforced server-side.

A request that was dispatched while online but lost its response is **not** converted into a new offline create/update. Only work known to be offline before dispatch enters the local outbox. This avoids a second mutation after an ambiguous committed response.

### Offline GuestCheck workflow

- Successful online OPEN-check reads seed the local cache.
- Known-offline OPEN-check reads use the cache.
- Known-offline check create/update writes are applied optimistically and queued with predictable versions.
- Browser refresh preserves those records in IndexedDB.
- Reconnect replays serially to maintain predicted version order.
- Conflict/failed operations remain visible in `/offline-sync`; operator can retry the same operation ID or explicitly discard it.

### Connectivity and operator state

- Browser online/offline events plus `/ready` API probe.
- Explicit `offline`, `api_unreachable`, `api_unavailable`, and `stale` modes.
- Outbox counts shown in the global outage banner.
- Dedicated Offline Sync review page.
- Replay runs on reconnect/readiness and periodic 15-second outbox checks; readiness probe is 60 seconds.

### Unsupported action matrix

The following are explicitly disabled for Offline Lite rather than queued optimistically:
- card authorization/settlement;
- fiscal receipt completion;
- KSeF submission;
- refunds;
- SaaS subscription billing changes;
- final financial reconciliation;
- order mutation until authoritative stock/conflict semantics exist;
- gaming session start/end until authoritative resource conflict semantics exist.

Checkout tenders display an online-only state during WAN/API loss.

### Timers

- `startedAt`-derived elapsed-time utility computes locally.
- No 1-second API write loop is introduced.
- Existing game-billing live reconciliation remains periodic (15 seconds), while second-level elapsed math is client-local.

## Gate 09 automated coverage

- replay receipt does not apply a mutation twice;
- exact version conflict refuses overwrite;
- stable client-addressed check creation;
- deterministic payload hashing;
- explicit unsupported financial/provider/compliance matrix;
- hard-refresh recovery source contracts for service worker, auth snapshot and venue snapshot;
- ambiguous online GuestCheck mutation is not converted to a second local create;
- local elapsed-time math;
- service worker API-cache prohibition.

## Rollout

1. Deploy with `offline_lite` disabled for production Shops.
2. Enable one pilot Shop.
3. Open the target dashboard while online so the current shell/auth/venue/check cache is seeded.
4. Exercise controlled WAN loss and review `/offline-sync` after reconnect.
5. Resolve every conflict explicitly before expanding rollout.

## Rollback

- Disable Shop feature flag `offline_lite`.
- Do not silently delete unresolved local work; operators should review/discard it intentionally where possible.
- A logout/session revocation purges all local Offline Lite state.
- Financial/provider/compliance actions remain online-authoritative regardless of the flag.

## Deliberate scope boundary

Offline Lite is single-browser/device resilience, not a venue LAN authority. Multi-device local authority belongs to Chunk 10. Order and gaming write candidates remain blocked in Chunk 09 until their conflict semantics are implemented; the implementation does not claim those candidates are replay-safe merely because the execution plan lists them as possibilities.
