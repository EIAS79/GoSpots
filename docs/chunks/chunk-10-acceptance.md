# Chunk 10 — Acceptance Gate

Source gate: GoSpots Programming Execution Plan, Chunk 10.

## Gate

- [x] Two LAN clients use one ordered local event stream and deterministic aggregate versions.
- [x] Edge restart retains committed events and aggregate state in SQLite.
- [x] Cloud reconnect replays a committed event once logically using the same stable operation ID.
- [x] Duplicate/retried Edge events are idempotent; changed-content reuse is rejected.
- [x] Money/compliance operations are not supported by the Edge replay surface, preventing duplicate payment/fiscal execution in Chunk 10.
- [x] LAN mutations require authenticated HMAC requests with timestamp and one-time nonce.
- [x] Edge-to-cloud requests use a registered Ed25519 device identity with nonce replay protection.
- [x] Shop-bound one-time provisioning token is hashed at rest and audited.
- [x] Existing Device registry is updated by Edge heartbeat and remains the device-health surface.
- [x] CI contains a dedicated Node 24 Edge Hub test/build job.
- [ ] Exact PR head GitHub Actions CI green.
- [ ] Post-merge `main` GitHub Actions CI green.

## Safety boundary

Chunk 10 supports only `CHECK_CREATE` and `CHECK_UPDATE`, matching the safe Offline Lite replay subset. Terminal payment, refund, settlement, cash, fiscal and KSeF actions remain outside local Edge execution until a provider/compliance-specific offline path is designed and verified.
