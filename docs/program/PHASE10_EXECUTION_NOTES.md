# Phase 10 execution notes

Phase 10 extends, rather than replaces, the existing GoSpots workforce architecture.

Canonical-source decisions:

- `Membership` remains authentication, permission-role, active/inactive and shop/branch access truth.
- Cross-branch assignment is projected from a user's existing memberships, bounded to the current organization for owners.
- `EmployeeRate` remains effective-dated hourly-cost truth; Phase 10 does not add a second wage field.
- Existing `ScheduleEntry`, `TimePunch`, `BreakRecord` and `TimeAdjustment` remain time/labor history.
- Existing commercial/payment/inventory/cash modules remain their domain truth; Phase 10 records attribution/approval evidence around successful mutations.
- Existing notification infrastructure delivers owner alerts; Phase 10 only adds configurable staff-action rules and dedupe semantics.
- High-risk action approval is single-use (`APPROVED -> IN_USE -> CONSUMED`) to prevent retry/concurrency duplication.
- PIN/badge credentials are hashes only. Operator tokens are random, short-lived and persisted only by SHA-256 hash.
- A PIN-switched operator cannot perform a high-risk action while authenticated as another employee.

The final acceptance source is `docs/acceptance/phase10-workforce-accountability.md`.
