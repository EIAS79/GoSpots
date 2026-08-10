# Chunk 11 — Operations Workspace + Resource Engine 2.0

Status: IMPLEMENTED_ON_FEATURE_BRANCH

## Scope delivered

- Unified Operations route with Floor, Visits, Reservations, Orders and Activity tabs.
- Live resource cards expose active time context, accrued snapshot-priced amount, next reservation, maintenance and attached check.
- State-machine commands: start, pause (with reason), resume, move, finish, attach guest check.
- Session groups and resource-link history support multi-resource/group workflows without mutating historical billing.
- Rate plan snapshot captures hourly/overtime rates, rounding, minimum, cap and membership hook at session start.
- Resource moves retain the original rate snapshot; pause intervals are excluded from billed time.
- Maintenance periods and state events make resource state auditable.
- PostgreSQL advisory transaction locks prevent concurrent starts/moves onto the same resource.
- The engine uses existing generic Resource types, so billiards and bowling lanes follow the same code path.

## Gate 11

- [x] Gaming worker can run the core shift lifecycle mostly from Operations.
- [x] Move/pause preserves billing via immutable session rate snapshots and pause accounting.
- [x] Resource state is projected from maintenance, active session and reservation state.
- [x] Multi-venue navigation adapts through the existing `[venuePath]` tenant route/context.
- [x] Start/pause/resume/finish are one primary action from a resource card; move is one action to an available resource.

## Validation

`operations.service.spec.ts` covers pause exclusion, rate rounding/minimum/cap and overtime snapshot math. Full branch CI is required before final completion sign-off.

## Non-goals preserved

No inventory recipes, loyalty or events are implemented in this chunk. Edge remains prohibited from local money/compliance mutations; Resource Engine events are cloud-authoritative until a later explicit Edge command extension is reviewed.
