# GoSpots Offline and Edge Strategy

## 1. Objective

GoSpots must evolve toward venue continuity during internet failure without pretending that every cloud or provider operation is safe offline.

Offline capability is certified **operation by operation**. A cached UI or queued request does not by itself make a workflow offline-safe.

## 2. Maturity levels

### Level A — Offline-aware cloud application

- cached application shell / last-known operational state where appropriate;
- explicit cloud connectivity state;
- read-only fallback for selected data;
- safe local queue only for operations already designed for deterministic replay.

### Level B — Offline Lite

- selected venue workflows are explicitly certified offline;
- durable local command identity;
- deterministic replay/idempotency;
- user-visible sync state;
- defined conflict behavior;
- no duplicate financial mutation.

### Level C — Edge-authoritative continuity

- GoSpots Edge Hub holds the minimum venue-local operational subset;
- POS/KDS/hardware devices continue over local network for certified workflows;
- local commands/events use stable device identity and ordering;
- cloud reconciliation resumes after connectivity returns;
- divergence is surfaced rather than silently hidden.

## 3. Current repository baseline

The repository already contains Offline Lite, offline-sync, Edge Hub, device/hardware and outage/replay foundations plus browser/Edge tests. These are reusable foundations; they do not mean every Phase 0–17 operation is already Edge-certified.

The current rule is therefore:

> Existing offline code is preserved, but each later phase must explicitly state the offline policy for every affected high-value mutation.

## 4. Operation classification

Every affected workflow must use one of these policies:

- `ONLINE_ONLY` — no local write; explain why connectivity is required.
- `OFFLINE_READ_ONLY` — last-known state can be viewed but not authoritatively mutated.
- `OFFLINE_QUEUEABLE` — local command may queue for cloud authority; user sees pending state.
- `EDGE_CERTIFIED` — Edge/local authority is explicitly designed and tested for the operation.
- `PROVIDER_DEPENDENT` — offline behavior depends on a payment/device/provider capability and risk policy.
- `COMPLIANCE_SPECIFIC` — legal offline mode has its own rules, deadlines and evidence (for example fiscal/KSeF procedures).

## 5. Local command envelope

A replayable mutation must carry enough durable identity to prevent ambiguity:

- operation ID;
- source device ID;
- venue/shop ID;
- local sequence when ordering matters;
- idempotency key;
- canonical request/payload hash;
- aggregate ID and expected version where relevant;
- occurrence/request timestamp;
- correlation ID;
- payload and operation type.

One device restart must not create a new logical operation for the same queued action.

## 6. Conflict classes

### Deterministic replay / automatic resolution

- identical idempotent command already processed;
- duplicate acknowledgement;
- duplicate event/webhook with matching payload.

### Controlled merge only where the domain defines it

- independent low-risk notes/metadata;
- additive informational fields with a documented merge rule.

### Operator resolution

- two devices independently start the same exclusive resource;
- stale check mutation after another device materially changed the check;
- reservation collision;
- stocktake boundary conflicting with stale local adjustment.

### Never silently merge

- payment;
- refund;
- stored-value load/spend;
- cash close/count authority;
- invoice/fiscal issuance;
- KSeF legal submission state.

## 7. Financial safety offline

A locally recorded cash payment or other financial fact is permitted only after that operation receives explicit certification with:

- local durable persistence;
- immutable operation identity;
- local transaction/sequence guarantees;
- replay idempotency;
- reconciliation against cloud financial authority;
- UI that distinguishes pending sync from cloud-confirmed state.

Card payment offline behavior is provider-specific. An offline-capable terminal does not justify declaring the payment final before the provider's required forwarding/reconciliation semantics complete.

## 8. Edge data minimization

Edge stores only the operational subset needed for certified venue continuity, for example:

- venue/device identity;
- resource configuration/current state needed locally;
- active sessions;
- relevant rate/catalog snapshots;
- selected open checks/orders;
- production/KDS work where certified;
- durable local commands/outbox;
- sync cursors/sequences/conflict metadata.

It must not become an unmanaged copy of the whole cloud database.

## 9. Connectivity UX

Cashiers/operators must be able to distinguish:

- online;
- cloud unavailable;
- Edge/local available;
- operation queued;
- synchronized;
- conflict requiring action;
- provider result unknown.

A UI must never display an uncertain payment as successful merely because the request left the browser.

## 10. Certification drill

For a workflow to be called Edge/offline certified, test at minimum:

```text
normal operation
→ disable WAN while local network remains
→ perform the certified operations
→ restart a venue device/Edge process where relevant
→ continue safely
→ restore WAN
→ replay/synchronize
→ reconcile canonical state
→ prove zero duplicate money and no lost committed operation
```

Physical hardware/provider proof remains separate when the marketed workflow depends on real devices.
