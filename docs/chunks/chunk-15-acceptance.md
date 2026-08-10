# Chunk 15 — Workforce

Status: IMPLEMENTED_ON_FEATURE_BRANCH

## Delivered
- Exact planned domain: JobRole, EmployeeRate, ScheduleEntry, TimePunch, BreakRecord and TimeAdjustment.
- Existing Membership remains employee identity/RBAC; labor records are shop-scoped and keep scalar membership IDs for stable historical attribution.
- Staff My Shift supports Clock In, unpaid/paid Break, Break End and Clock Out.
- Manager scheduling, time records and approval/rejection workflow.
- Employee wage rates are effective-dated, non-overlapping and append-only: there is no rate-edit endpoint. Every TimePunch snapshots rate ID, minor-unit hourly amount and currency.
- Raw punch timestamps are never rewritten by corrections. Approved TimeAdjustment rows provide an auditable effective projection.
- Advisory transaction lock prevents concurrent double clock-in; adjustment approval checks effective intervals to prevent overlap.
- Scheduled-vs-worked report includes per-employee/totals and snapshotted labor cost.
- Labor analytics requires both `staff.read` and `transaction.read` and uses the existing ledger-aware `computeRevenueSince` finance helper for revenue-per-labor-hour.

## Gate 15
- [x] No overlapping punches: open-punch lock plus effective-interval validation on manager adjustment approval.
- [x] Manager adjustment audited.
- [x] Labor cost permissions: requires staff + financial read capability; ordinary staff-read-only UI hides costs.
- [x] Scheduled/worked reports.
- [x] Revenue per labor hour uses the existing reliable, ledger-aware finance metric.

Full branch CI is required before final completion sign-off.
