# Chunk 11 — Operations Workspace + Resource Engine 2.0

Status: COMPLETE_ON_UNMERGED_REVIEW_BRANCH

## Scope delivered
- Unified Operations route with Floor, Visits, Reservations, Orders and Activity tabs.
- Live resource cards expose active time, accrued snapshot-priced amount, next reservation, maintenance and attached check.
- State-machine commands: start, pause/reason, resume, move, finish and attach GuestCheck.
- Session groups, grouped-session UI and resource-link history support multi-resource workflows without historical repricing.
- Section availability is visible directly on the Floor.
- Rate snapshots capture hourly/overtime, rounding, minimum, cap and membership hook at session start; moves retain the snapshot and pauses remove paused time.
- Maintenance/state events are auditable; PostgreSQL advisory locks protect concurrent starts/moves.
- Existing generic Resource types keep billiards and bowling on the same code path.

## Gate 11
- [x] gaming worker can run shift mostly from Operations.
- [x] move/pause preserves billing.
- [x] resource state matches reservation/session.
- [x] multi-venue navigation adapts through `[venuePath]`.
- [x] common operation is one primary card action; grouped start is selectable from the same Floor.

This PR is intentionally unmerged. Exact-head CI must remain green before merge is ever requested.
