# GoSpots Edge Hub — Operations Guide

## Purpose

GoSpots Edge Hub is the local LAN sequencing authority used when a venue loses WAN connectivity. Chunk 10 deliberately keeps payment-terminal and fiscal execution online-only; Edge coordinates the offline-safe operational subset introduced in Chunk 09 and replays the same stable operation IDs to the cloud after reconnection.

## Runtime

- Node.js 24
- built-in `node:sqlite` durable database
- HTTP + Server-Sent Events on the venue LAN
- Ed25519 identity for Edge-to-cloud authentication
- HMAC-SHA256 authentication for POS-to-Edge LAN requests
- AES-256-GCM encryption for local client secrets and the Edge private key

The default listener is `0.0.0.0:8787` and the default database is `data/edge.db`.

## Required production settings

- `EDGE_CLOUD_URL` — GoSpots API origin, for example the production API URL.
- `EDGE_DB_PATH` — durable local path on the Edge host.
- `EDGE_KEY_PATH` — durable path for the local master-key file, or provide `EDGE_MASTER_KEY` from the OS secret store.
- `EDGE_PAIR_TOKEN` — optional installer-controlled LAN pairing token. If omitted, a high-entropy token is generated at startup and printed once to the local service console.
- `EDGE_SYNC_INTERVAL_MS` — optional cloud sync interval, default 5000 ms.

Do not copy the Edge database or master key to another venue. They are shop/device identity material.

## Cloud provisioning

1. In GoSpots, create a Device of type `EDGE_HUB` for the venue.
2. Enable the `edge_hub` feature for the pilot shop.
3. Call `POST /edge-hub/devices/:deviceId/provision` as an owner or user with `shop.manage`.
4. The API returns a one-time provisioning token valid for 15 minutes. Only the SHA-256 hash is persisted.
5. On the Edge host, register with `POST /v1/cloud/register` or provide `EDGE_PROVISIONING_TOKEN` for first startup.
6. Edge generates an Ed25519 key pair. The private key remains encrypted on the Edge host; the public key is registered in the existing Device metadata.
7. Subsequent cloud heartbeat and replay requests are signed and use nonce replay protection.

Rotate provisioning by issuing a new one-time token. A successful re-registration replaces the registered public key for that Device and is audited.

## LAN client pairing

`POST /v1/devices/register` accepts the local pairing token and returns a `clientId` plus a 32-byte shared secret once. Store that secret in the POS device's protected local storage.

Every authenticated LAN request sends:

- `x-edge-client-id`
- `x-edge-timestamp`
- `x-edge-nonce`
- `x-edge-signature`

The signature is HMAC-SHA256 over:

```text
METHOD\nPATH_WITH_QUERY\nTIMESTAMP\nNONCE\nSHA256(CANONICAL_JSON_BODY)
```

Nonces are single-use and timestamps outside the five-minute window are rejected.

## Local API

Public:

- `GET /health`
- `GET /v1/version`
- `POST /v1/devices/register` (requires pairing token)

Authenticated LAN:

- `POST /v1/events`
- `GET /v1/events?after=<sequence>`
- `GET /v1/stream?after=<sequence>` — SSE live event stream
- `GET /v1/status`
- `GET /v1/diagnostics`
- `POST /v1/cloud/register`
- `POST /v1/cloud/sync`

## Sequencing and durability

`POST /v1/events` commits under a SQLite `BEGIN IMMEDIATE` transaction. The aggregate version update and event append succeed or fail together. Events have a monotonically increasing local sequence and a globally stable UUID `eventId`. Non-UUID event IDs are rejected locally so an event cannot be committed in a form the cloud replay DTO would reject later.

Supported Chunk 10 operations are intentionally limited to:

- `CHECK_CREATE`
- `CHECK_UPDATE`

Only the Offline Lite safe GuestCheck fields are accepted. Payment, refund, settlement, cash, fiscal and KSeF mutations are rejected locally. This is a safety boundary, not a missing fallback.

## Cloud replay

Pending Edge events are replayed sequentially to `POST /edge-hub/cloud/replay` using the same event UUID as `operationId`. The cloud namespaces the LAN device identity under the registered Edge Device and passes the operation through the existing Offline Sync idempotency receipt and optimistic-version logic.

Behavior:

- 2xx: mark local event `SYNCED`.
- 409: mark local event `CONFLICT` for operator resolution; do not loop indefinitely.
- network error / 5xx: retain `PENDING` and retry later with the same operation ID.

This means an ambiguous reconnect can retry without logically applying the same mutation twice.

## Restart recovery

SQLite is opened in WAL mode with `synchronous=FULL`. After process or machine restart, committed local events and aggregate versions remain. Cloud sync resumes from events still marked `PENDING`.

For production deployment, configure the operating system service manager to restart Edge automatically:

- Windows: Windows Service wrapper / service manager approved by deployment engineering.
- Linux: systemd unit.

Do not implement application-level self-replacement until signed release/update distribution is available. Chunk 10 defines the version/status hooks and leaves binary auto-update as a controlled deployment concern rather than an unsafe unsigned updater.

## Diagnostics

`GET /v1/status` reports the concise health surface:

- Edge version
- cloud registration state
- registered Device ID
- Shop ID
- pending event count
- latest local sequence

`GET /v1/diagnostics` adds operational counts for total/pending/synced/conflicted events and paired/active LAN clients. It does not expose stored secrets or the Edge private key.

The cloud Device registry receives heartbeat updates through `lastSeenAt`, so the existing Devices screen remains the owner-facing health surface.
