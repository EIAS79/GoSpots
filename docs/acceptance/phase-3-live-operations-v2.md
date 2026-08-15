# Phase 3 v2 — Live Operations Acceptance Record

Source: `GoSpots_Master_Product_and_Engineering_Execution_Plan_v2.md`, Phase 3 — Live Operations: Sessions, Timers, Moves, Waitlist and Floor Control.

Status: `IMPLEMENTED_PENDING_CI_AND_PRODUCTION_ACCEPTANCE`.

This record intentionally does not claim Phase 3 accepted until exact-head CI, merge, production deployment, migration verification and Gate P3 production smoke are complete.

## Requirement matrix

| Requirement | Implementation evidence | Acceptance evidence |
| --- | --- | --- |
| Canonical session lifecycle | `LiveOperationsService` owns ACTIVE/PAUSED → FINISHED semantic ENDED and audited CANCELLED; settlement remains downstream | Focused tests + production drill pending |
| Exclusive live occupancy | advisory resource lock plus tenant/resource active-session conflict; Phase 3 DB assertion detects duplicates | CI + concurrent production drill pending |
| Server-authoritative timers | API floor `generatedAt`, server timestamps and `projectSessionTiming`; UI only projects from server snapshot | timer/overnight tests pending CI |
| Start capture | rate snapshot, operator, participants, customer, membership, reservation, package snapshot and notes | API/UI smoke pending |
| Configurable pause | venue policy snapshots STOP/CONTINUE charging, manager-only and max-pause policy; pause reason is required and timing segments persist | unit/API smoke pending |
| Resource move | session identity/resource-link history preserved; occupied/maintenance/reservation guards; manager reservation override; KEEP_SESSION_RATE or REPRICE_TARGET with immutable rate segments | move/reprice drill pending |
| Fixed-time control | scheduled end, warning thresholds, optional auto-extension projection, manual extension and explicit fixed-duration overage pricing | focused tests + UI drill pending |
| Groups/participants | existing SessionGroup plus participant count and per-person rate support retained | grouped-session smoke pending |
| Waitlist | canonical `ReservationWaitlistEntry` plus `OperationsWaitlistExtension`; create/notify/seat/skip/cancel/expire and optimistic seat claim | conflict test + production drill pending |
| Maintenance/downtime | maintenance reason, expected return, notes, session-start guard and state history | migration/API smoke pending |
| Live floor card | resource state, timer, usage amount, reservation, customer/member, orders/check context, alerts and quick actions | web CI/browser smoke pending |
| Shift handover | active/paused sessions, open checks, pending orders, upcoming reservations, unresolved payments, devices, cash and fiscal issues | API/UI smoke pending |
| Offline classification | existing Offline Lite keeps cached floor and queueable session start/end/simple orders; Phase 3 high-conflict commands remain online-only | web CI/reconnect smoke pending |
| Migration safety | additive/backfilled migration, pause-reason backfill, immutable historical rate-segment backfill and Phase 3 integrity assertion | clean + representative upgrade CI pending |
| Legacy Edge validation | old mislabeled Phase 3 Edge workflow preserved as `edge-validation.yml`; Phase 3 workflow now validates current master-plan live operations | CI pending |

## Mandatory test mapping

- concurrent start: existing `OperationsService` advisory lock/occupancy test path plus production concurrency drill;
- timer accuracy: `live-operations.service.spec.ts` authoritative timing cases;
- pause segments: STOP/CONTINUE projections and manager-only service test; API smoke completes evidence;
- resource move: service guards and immutable `OperationsSessionRateSegment`; production move/reprice drill;
- rate boundary crossing: explicit fixed-duration overage test;
- overnight session: six-hour/overnight projection test;
- refresh/reconnect: existing `operations-offline-client` cache/reconnect behavior plus web checks;
- stale version conflict: existing `operations.service.spec.ts` optimistic concurrency plus waitlist stale claim test;
- waitlist seat conflict: optimistic extension version and `SEATING` claim test;
- maintenance guard: existing operations service disabled/maintenance start guards plus production smoke.

## Gate P3

Gate P3 requires a billiard/gaming venue to run a simulated several-hour busy floor without timing ambiguity, duplicate occupancy or manual calculation.

Repository evidence includes a deterministic six-hour busy-floor simulation test. Final acceptance additionally requires an authenticated production drill covering concurrent start rejection, pause/resume, move, fixed-time extension/overage, waitlist seat conflict, maintenance guard and handover projection on the deployed merged revision.

## Evidence to fill after exact-head acceptance

- implementation PR: pending;
- exact PR head: pending;
- required CI workflow run IDs/conclusions: pending;
- merge revision: pending;
- post-merge main CI: pending;
- production API deployment: pending;
- production web deployment: pending;
- Neon migration `20260815103000_phase3_live_operations_v2`: pending;
- `/api/v1/live` and `/api/v1/ready`: pending;
- Gate P3 production drill: pending;
- immediate runtime-error review: pending.
