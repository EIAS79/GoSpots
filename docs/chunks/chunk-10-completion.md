# Chunk 10 — GoSpots Edge Hub Completion Record

## Scope delivered

- Added `apps/edge`, a small Node.js 24 Edge service using built-in SQLite.
- Added durable local event log and GuestCheck aggregate projection.
- Added optimistic local sequencing and stable event idempotency.
- Added HTTP event replay and SSE multi-client live stream.
- Added authenticated LAN device pairing with HMAC request signatures and nonce replay protection.
- Added AES-256-GCM encryption of LAN client secrets and the Edge Ed25519 private key.
- Added Edge-to-cloud Ed25519 identity registration using a shop-bound one-time provisioning token.
- Reused the existing Device registry rather than creating a competing hardware registry.
- Refactored Offline Sync so Edge replay and browser replay share the same idempotent/versioned cloud mutation core.
- Added signed cloud heartbeat and signed replay endpoints.
- Added explicit no-money/no-fiscal Edge safety boundary for this chunk.
- Added authenticated status and diagnostics surfaces without exposing secrets.
- Added local UUID validation so committed events are always cloud-replay-compatible.
- Added Edge Node 24 tests/build to CI and root verification scripts.
- Added installation/security/recovery operational documentation.

## Architecture decision

Chunk 10 uses HTTP + Server-Sent Events rather than adding a WebSocket dependency. The execution plan allows WebSocket/HTTP and specifically says not to change stack for novelty. SSE provides ordered server-to-client LAN fan-out while authenticated HTTP handles mutations, with no new runtime dependency or lockfile churn.

## No database migration

No new cloud table is required. The existing tenant-scoped `Device.metadata` stores the registered Edge public identity and provisioning state; the existing `IdempotencyReceipt` provides durable nonce replay protection. This is expand-free and avoids introducing another device identity store.

## Verification

Local Edge test suite covers:

1. two distinct authenticated LAN POS clients sharing one ordered stream and deterministic versions;
2. restart durability;
3. same-event idempotency and changed-content conflict;
4. explicit rejection of money/compliance operations;
5. LAN nonce replay rejection;
6. cloud reconnect stable-ID replay exactly once logically;
7. rejection of invalid event IDs before unsyncable work can be committed.

Final completion requires the exact PR head CI and post-merge main CI checks recorded in `chunk-10-acceptance.md`.
