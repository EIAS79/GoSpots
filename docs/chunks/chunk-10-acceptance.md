# Chunk 10 — Acceptance Gate

Source gate: GoSpots Programming Execution Plan, Chunk 10.

**Status:** DONE — engineering acceptance gate passed, merged, and post-merge verified.

## Gate

- [x] Two distinct authenticated LAN clients use one ordered local event stream and deterministic aggregate versions.
- [x] Edge restart retains committed events and aggregate state in SQLite.
- [x] Cloud reconnect replays a committed event once logically using the same stable operation ID.
- [x] Duplicate/retried Edge events are idempotent; changed-content reuse is rejected.
- [x] Money/compliance operations are not supported by the Edge replay surface, preventing duplicate payment/fiscal execution in Chunk 10.
- [x] LAN mutations require authenticated HMAC requests with timestamp and one-time nonce.
- [x] Edge-to-cloud requests use a registered Ed25519 device identity with nonce replay protection.
- [x] Shop-bound one-time provisioning token is hashed at rest and audited.
- [x] Existing Device registry is updated by Edge heartbeat and remains the device-health surface.
- [x] Authenticated status/diagnostics expose operational health without exposing secrets.
- [x] Event IDs are validated before local commit so cloud replay cannot fail solely on identifier format.
- [x] CI contains a dedicated Node 24 Edge Hub test/build job.
- [x] Exact PR head GitHub Actions CI green — PR #23 head `282a32cabb925f7877b2ede04734e7ed4d697556`, CI #265.
- [x] Post-merge `main` GitHub Actions CI green — merge commit `dba833a830495b42fe0043eab3d60bc9d6d9352d`, CI #266.

## Review hardening completed before merge

All five automated review findings were fixed and their threads resolved before PR #23 merged:

1. cloud API origin normalization includes the global `/api/v1` prefix;
2. permanent 400/422 replay rejections are quarantined instead of blocking the ordered queue forever;
3. expired cloud-auth nonce receipts are purged to avoid unbounded growth;
4. one-time Edge provisioning is serialized transactionally so concurrent reuse cannot replace identity twice;
5. LAN HMAC is verified before a nonce is persisted.

## Deployment evidence

- Vercel production deployment for merge commit `dba833a830495b42fe0043eab3d60bc9d6d9352d` completed successfully.
- No cloud database migration was required for Chunk 10; the migration dry-run and Prisma validation passed in CI.

## Safety boundary

Chunk 10 supports only `CHECK_CREATE` and `CHECK_UPDATE`, matching the safe Offline Lite replay subset. Terminal payment, refund, settlement, cash, fiscal and KSeF actions remain outside local Edge execution until a provider/compliance-specific offline path is designed and verified.
