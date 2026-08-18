# GoSpots Phase 12 — Offline-First, Edge Hub and Hardware Continuity

## Source

GoSpots Master Product & Engineering Execution Plan v2 — Phase 12.

## Scope boundary

Phase 12 certifies a bounded set of venue-local workflows. It does **not** make every GoSpots API call offline-capable, it does not make a card payment final without provider semantics, and it does not treat KSeF/fiscal outage modes as generic network retry.

Cloud GoSpots remains canonical after synchronization. The Edge Hub is the venue-continuity authority only for operations listed here as Edge-certified.

## Offline capability matrix

| Operation | Policy | Phase 12 behavior |
| --- | --- | --- |
| View last-known floor | `ALLOW_LAST_KNOWN` | Edge cache exposes resources, active sessions and selected open checks. |
| Start session | `EDGE_CERTIFIED` | Durable command + local exclusive-resource guard + cloud idempotent replay. |
| Pause session | `EDGE_CERTIFIED` | Versioned local projection + canonical cloud OperationsService replay. |
| Resume session | `EDGE_CERTIFIED` | Versioned local projection + canonical cloud OperationsService replay. |
| End session | `EDGE_CERTIFIED` | Versioned local projection + canonical existing OfflineSync replay. |
| Add/create order | `EDGE_CERTIFIED` | Durable local order command; cloud reprices from authoritative catalog on replay. |
| Create/update check | `EDGE_CERTIFIED` | Existing canonical OfflineSync handler and conflict rules. |
| Cash payment | `EDGE_CERTIFIED_FINANCIAL` | Durable local cash fact; canonical CheckoutPaymentService/CashService replay; interrupted-ack recovery; never auto-merge. |
| Card payment | `PROVIDER_SPECIFIC` | Not generally certified by this phase. Provider risk/forwarding rules remain authoritative. |
| Refund | `ONLINE_ONLY` | No silent local refund. |
| Stored value | `ONLINE_ONLY` | No local monetary balance mutation. |
| Cash close | `ONLINE_ONLY` | Final drawer authority cannot silently merge. |
| Fiscal issuance | `ONLINE_ONLY` | Separate compliance/provider workflow. |
| Rate/price change | `ONLINE_ONLY` | Configuration authority remains cloud. |
| Permission change | `ONLINE_ONLY` | Security authority remains cloud. |
| Stock receipt | `ONLINE_ONLY` | Not Phase 12-certified. |
| KSeF submission | `COMPLIANCE_DEFERRED` | Compliance-specific mode, not generic Edge retry. |
| Public reservation | `CLOUD_DEPENDENT` | Public capacity remains cloud-authoritative. |
| Ticket scan | `CACHE_RULE_DEPENDENT` | Existing ticket/access offline policy continues to govern credential cache/replay. |

Unknown operation types default to online-only.

## Local Edge subset

The Phase 12 snapshot/cache is venue-scoped and intentionally narrow:

- venue identity, currency, timezone and business-day boundary;
- registered active device identities/health projection;
- resource configuration/state;
- active operations sessions;
- active rate plans needed for operator context;
- menu/catalog identifiers, prices and scanner keys;
- selected open GuestChecks;
- active KDS tickets/lines;
- durable local commands/outbox;
- local cash facts pending cloud reconciliation;
- event/local sequence and sync status;
- conflicts/dead letters;
- staged physical print outcomes awaiting cloud acknowledgement;
- scanner events, customer-display state and cash-drawer audit events.

The Edge database is not a full copy of PostgreSQL.

## Local command contract

Every new Phase 12 command persists:

- `operationId` — UUID and stable logical mutation identity;
- `deviceId` — authenticated LAN client;
- `venueId` — must match the registered Edge Hub venue;
- `localSequence` — monotonically assigned per source device;
- `idempotencyKey` — defaults to operation ID and is unique per venue;
- `operationType`;
- aggregate type/ID and optional expected version;
- canonical SHA-256 payload hash;
- occurrence timestamp;
- correlation ID;
- payload;
- sync state, attempt count, error and replay result.

SQLite uniqueness backs up application idempotency. Same operation/same payload replays the durable local result. Reusing an operation ID or idempotency identity with different content is rejected.

## Cloud sync contract

The Edge Hub uses its signed Ed25519 cloud identity to:

1. push legacy/certified local work;
2. push Phase 12 command envelopes;
3. receive acknowledgement/result;
4. retry transient failures;
5. quarantine permanent 4xx/domain conflicts;
6. retain dead-letter/operator-resolution evidence;
7. pull a fresh venue-scoped cloud snapshot;
8. replace last-known projections with canonical synchronized state.

Tenant identity is derived from the registered Edge device on the API. A client-provided venue ID is only consistency metadata and is rejected if it disagrees.

## Conflict policy

### Automatic

- identical operation replay;
- already-acknowledged event/result.

### Operator resolution

- two devices independently claim the same resource;
- stale aggregate/version after another device changed it;
- reservation collision;
- future inventory collisions once explicitly certified.

### Never auto-merge

- cash/card payment;
- refund;
- stored value;
- cash close;
- fiscal issuance.

A financial conflict is classified `FINANCIAL_MANUAL_REVIEW`; the resolution API refuses `AUTO_MERGE`.

## Cash continuity and financial authority

Offline cash uses a local immutable pending fact in minor units. Cloud replay does not create a parallel payment implementation: it invokes the existing canonical `CheckoutPaymentService`, which in turn uses the canonical cash-session/CashMovement, PaymentAllocation, settlement-state, event-outbox and audit paths.

Replay safety includes a crash gap: if the cloud payment committed but the Edge acknowledgement/receipt update was interrupted, the server finds the successful cash `Payment` by the stable offline correlation ID and reconstructs the canonical result instead of taking the payment twice.

## Printing continuity

The cloud `PrintJob` remains the source transaction/job authority. Before physical output, Edge stages the claimed job into local SQLite. After successful physical output, Edge durably records `PRINTED_PENDING_ACK` **before** reporting success to cloud.

If Edge or WAN fails between physical print and cloud acknowledgement, the restarted Edge process sends only the pending acknowledgement; it does not execute the physical printer again. Failed physical outcomes are similarly retained as `FAILED_PENDING_ACK` until cloud receives the failure.

## Hardware-local surfaces

- **Scanner:** normalized barcode/QR/access/product/credential events; product lookup can use cached catalog identifiers.
- **Customer display:** durable local display-state projection for LAN consumers.
- **Cash drawer:** only `CASH_SALE`, `PAID_IN`, `PAID_OUT`, `MANAGER_OPEN`, or `TEST`; financial triggers require a source transaction and manager opens require actor + reason.
- **KDS:** active prep-ticket projection is included in cloud snapshot and retained locally for venue-LAN display continuity.
- **Printer:** restart-safe staged execution/acknowledgement described above.

## Automated outage proof

`apps/edge/test/phase12-full-outage-drill.test.js` executes the software drill:

```text
cloud snapshot
→ WAN conceptually unavailable / Edge local writes continue
→ start session on POS A
→ competing POS B resource claim rejected
→ add order
→ record cash locally once
→ close/reopen the same SQLite database (Edge restart/power-loss boundary)
→ retry identical cash operation
→ prove one local cash fact only
→ acknowledge all commands as cloud-synchronized
→ pull reconciled cloud projection
→ prove queue empty and cash pending count zero
```

The test also proves a rejected local financial command rolls back atomically without leaving a partial cash fact or queued command.

Existing Edge suites continue to cover signed LAN authentication, nonce replay, time skew, cloud outage/recovery, durable events, duplicate replay, backup/restore and packaged rollback.

## Database and migration impact

Phase 12 adds **no PostgreSQL schema migration**. It reuses the existing canonical cloud models (`Device`, `IdempotencyReceipt`, operations sessions, GuestCheck/Settlement/Payment/CashMovement, KDS, hardware PrintJob) and extends Edge SQLite with additive `CREATE TABLE IF NOT EXISTS` local tables.

Therefore the repository's normal clean-database and representative-upgrade PostgreSQL migration gates remain required as regression proof; there is no new destructive/cloud migration to deploy for Phase 12.

## Physical hardware certification matrix

Physical evidence is separate from software simulation. Each marketed model must record manufacturer/model, connection, driver/SDK version, supported OS/device, GoSpots adapter version, online test, restart, disconnect/reconnect, duplicate/retry behavior, UI error evidence, Edge relay where applicable, and evidence date.

| Hardware family | Software path | Physical Phase 12 evidence |
| --- | --- | --- |
| Receipt printer | PrintJob + Edge staged print/ack | `BLOCKED_EXTERNAL` until representative model test is recorded. |
| Kitchen/bar printer | PrintJob routing + Edge | `BLOCKED_EXTERNAL` until representative model test is recorded. |
| Barcode/QR scanner | Edge scanner event + catalog/access lookup | `BLOCKED_EXTERNAL` until representative device test is recorded. |
| Customer display | Edge local display state | `BLOCKED_EXTERNAL` until representative display test is recorded. |
| Cash drawer | Authorized Edge trigger/audit | `BLOCKED_EXTERNAL` until representative drawer test is recorded. |
| KDS touchscreen | Edge KDS projection | `BLOCKED_EXTERNAL` until representative screen/LAN drill is recorded. |
| Payment reader | Provider-specific payment path | `BLOCKED_EXTERNAL` until supported reader/provider test is recorded. |
| Edge host | SQLite durability, signed LAN/cloud identity | CI/software restart is proven; physical power/LAN host drill remains `BLOCKED_EXTERNAL`. |
| Access scanner (if marketed) | Existing ticket/access offline cache/replay | `BLOCKED_EXTERNAL` until representative device test is recorded. |

## Rollback / support rules

- Edge local schema additions are additive; rollback to the previous Edge build leaves unknown SQLite tables intact.
- Never delete or manually edit unresolved financial commands to make a queue look clean.
- A `FINANCIAL_MANUAL_REVIEW` conflict must be reconciled against cloud Payment/Settlement/CashMovement evidence before operator resolution.
- A `PRINTED_PENDING_ACK` job must be acknowledged, not printed again.
- If snapshot tenant identity differs from the registered venue, stop synchronization and treat it as an integrity incident.

## Phase 12 acceptance state

Software acceptance requires exact-head repository CI, dedicated hard-outage validation, full regression, merge, main verification and production runtime verification. Physical certification remains an external gate until actual supported hardware is connected and evidence is recorded.
