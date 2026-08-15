# Phase 3 v2 — Live Operations Acceptance Record

Source: `GoSpots_Master_Product_and_Engineering_Execution_Plan_v2.md`, Phase 3 — Live Operations: Sessions, Timers, Moves, Waitlist and Floor Control.

Status: `IMPLEMENTED_PENDING_FINAL_CI_AND_PRODUCTION_ACCEPTANCE`.

This record intentionally does not claim Phase 3 accepted until exact-head CI, merge, production deployment, migration verification and Gate P3 production smoke are complete.

## Requirement matrix

| Requirement | Implementation evidence | Acceptance evidence |
| --- | --- | --- |
| Canonical session lifecycle | `LiveOperationsService` owns ACTIVE/PAUSED → FINISHED semantic ENDED and audited CANCELLED; settlement remains downstream | Focused tests passed; production drill pending |
| Exclusive live occupancy | advisory resource lock plus tenant/resource active-session conflict; Phase 3 DB assertion detects duplicates | Dedicated Phase 3 gate passed; production concurrency drill pending |
| Server-authoritative timers | API floor `generatedAt`, server timestamps and `projectSessionTiming`; UI only projects from server snapshot | timer/overnight tests passed |
| Start capture | rate snapshot, operator, participants, customer, membership, reservation, package snapshot and notes | API/UI production smoke pending |
| Configurable pause | venue policy snapshots STOP/CONTINUE charging, manager-only and optional/clearable max-pause policy; pause reason is required and timing segments persist | focused tests passed; production API smoke pending |
| Resource move | session identity/resource-link history preserved; occupied/maintenance/reservation guards; manager reservation override; KEEP_SESSION_RATE or REPRICE_TARGET with immutable rate segments | migration/history assertions passed; production move/reprice drill pending |
| Fixed-time control | scheduled end, warning thresholds, optional auto-extension projection, manual extension and explicit fixed-duration overage pricing; projected automatic extensions are persisted and audited when a session ends | focused pricing/timer tests passed; production UI drill pending |
| Groups/participants | existing SessionGroup plus participant count and per-person rate support retained | grouped-session smoke pending |
| Waitlist | canonical `ReservationWaitlistEntry` plus `OperationsWaitlistExtension`; canonical `ResourceType` validation; create/notify/seat/skip/cancel/expire and optimistic seat claim | stale-seat test passed; production drill pending |
| Maintenance/downtime | maintenance reason, expected return, notes, session-start guard and state history | clean migration passed; production API smoke pending |
| Live floor card | resource state, timer, usage amount, reservation, customer/member, live GuestCheck operational amount derived from its still-open canonical VenueOrders, open-order amount/count, alerts and quick actions; existing Visits view preserved | final exact-head web CI pending |
| Shift handover | active/paused sessions, open checks, pending orders, upcoming reservations, unresolved payments, devices, cash and fiscal issues | production API/UI smoke pending |
| Offline classification | existing Offline Lite keeps cached floor and queueable session start/end/simple orders; Phase 3 high-conflict commands remain online-only | final exact-head web/offline CI pending |
| Migration safety | additive/backfilled migration, pause-reason backfill, immutable historical rate-segment backfill and Phase 3 integrity assertion | clean migration, representative upgrade and Phase 3 integrity assertions passed |
| Legacy Edge validation | old mislabeled Phase 3 Edge workflow preserved as `edge-validation.yml`; Phase 3 workflow now validates current master-plan live operations | final exact-head Edge CI pending |

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

Repository evidence includes a deterministic six-hour busy-floor simulation test. Dedicated Phase 3 workflow run `31879715527` passed clean migration, schema/integrity assertions, 29 focused operations tests and the production API build on repaired head `f1ee324c840532470ef85b5a7db381f5044a01a9` before final completeness hardening. A later frozen-head run `31879991672` again passed migration, assertions and all 29 focused tests but correctly rejected an invalid assumption that `GuestCheck` itself stores `amountDue`; that compiler failure was fixed by deriving the live check amount from its canonical still-open `VenueOrder` children while leaving final discount/tender amount due to settlement. Final acceptance requires the new exact-head CI and an authenticated production drill covering concurrent start rejection, pause/resume, move, fixed-time extension/overage, waitlist seat conflict, maintenance guard and handover projection on the deployed merged revision.

## Final source-to-code audit

Before freezing the merge head, the implementation audit corrected every identified Phase 3 completeness/regression gap:

- the pre-existing Operations `Visits` view is preserved;
- waitlist resource-type input uses canonical `ResourceType` values instead of arbitrary strings;
- resource cards expose a live GuestCheck operational amount from canonical open VenueOrders, without inventing a second settlement truth;
- automatic fixed-time extensions remain server-projected during the live session and their resulting extension history is persisted/audited when the session ends;
- the optional maximum-pause policy can be set and explicitly cleared again;
- temporary patch workflows used to work around the connector-only development environment are removed from the branch.

## Evidence to fill after exact-head acceptance

- implementation PR: #47;
- final exact PR head: pending;
- required final exact-head CI workflow run IDs/conclusions: pending;
- merge revision: pending;
- post-merge main CI: pending;
- production API deployment: pending;
- production web deployment: pending;
- Neon migration `20260815103000_phase3_live_operations_v2`: pending;
- `/api/v1/live` and `/api/v1/ready`: pending;
- Gate P3 production drill: pending;
- immediate runtime-error review: pending.
