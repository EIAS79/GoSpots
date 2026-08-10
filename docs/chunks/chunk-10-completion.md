# Chunk 10 — GoSpots Edge Hub Completion Record

## Status

**DONE.** Chunk 10 is merged and post-merge verified. PR #23 exact head `282a32cabb925f7877b2ede04734e7ed4d697556` passed GitHub Actions CI #265; merge commit `dba833a830495b42fe0043eab3d60bc9d6d9352d` passed post-merge `main` CI #266. Vercel production deployment for the merge commit completed successfully.

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

The final Edge suite covers:

1. two distinct authenticated LAN POS clients sharing one ordered stream and deterministic versions;
2. restart durability;
3. same-event idempotency and changed-content conflict;
4. explicit rejection of money/compliance operations;
5. LAN nonce replay rejection;
6. cloud reconnect stable-ID replay exactly once logically;
7. rejection of invalid event IDs before unsyncable work can be committed;
8. automatic `/api/v1` normalization when `EDGE_CLOUD_URL` is configured as an API origin;
9. permanent cloud validation rejection quarantine without poisoning later ordered events;
10. invalid LAN signatures cannot consume/store a nonce before signature verification.

API tests additionally cover transaction-serialized one-time provisioning and expired nonce-receipt cleanup.

## Review hardening

Before merge, five actionable automated review findings were fixed and all review threads were resolved:

- missing global API prefix in cloud requests;
- permanent 4xx queue poisoning;
- unbounded cloud-auth nonce receipt growth;
- non-atomic one-time provisioning;
- LAN nonce persistence before signature verification.

## Final verification record

- PR: #23 `Chunk 10 — GoSpots Edge Hub`.
- Exact PR head: `282a32cabb925f7877b2ede04734e7ed4d697556`.
- Exact-head GitHub Actions: CI #265 — success.
- Merge commit: `dba833a830495b42fe0043eab3d60bc9d6d9352d`.
- Post-merge `main` GitHub Actions: CI #266 — success.
- Vercel production deployment: success.
- Cloud DB migration: none required; migration dry-run and Prisma validation remained green.

The engineering gate in `chunk-10-acceptance.md` is fully satisfied. The deliberate safety boundary remains: terminal payment, refund, settlement, cash, fiscal and KSeF mutations are not executed through Chunk 10 Edge replay.
