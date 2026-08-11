# Chunk 15 — Workforce

Status: COMPLETE_ON_UNMERGED_REVIEW_BRANCH

## Delivered
- Planned domain: JobRole, EmployeeRate, ScheduleEntry, TimePunch, BreakRecord and TimeAdjustment.
- Existing Membership remains employee identity/RBAC.
- Staff My Shift supports Clock In, Break, Break End and Clock Out; manager UI provides scheduling, records and adjustment approval.
- Wage rates are effective-dated and non-overlapping; introducing a later rate closes only the prior effective range and never edits its historical wage amount. Every punch snapshots rate ID, minor-unit amount and currency.
- Raw punch timestamps are never rewritten by correction; approved TimeAdjustment rows project effective time and preserve raw history.
- Advisory locking prevents concurrent double clock-in; approval checks effective intervals for overlap.
- Manager adjustment/request decisions and clock/break events are audited.
- Scheduled-vs-worked reporting is available to managers without exposing wage/cost fields.
- Labor cost/time-record wage fields and revenue-per-labor-hour analytics are owner-only; revenue uses the existing ledger-aware `computeRevenueSince` finance helper.

## Gate 15
- [x] no overlapping punches.
- [x] manager adjustment audited.
- [x] labor cost permissions.
- [x] scheduled/worked reports.
- [x] revenue per labor hour uses reliable finance metrics.

This PR is intentionally unmerged. Exact-head CI must remain green before merge is ever requested.
