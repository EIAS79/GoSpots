# GoSpots Phase 10 — Workforce Accountability Acceptance

## Status

`IN_PROGRESS`

Phase 10 is being executed against the GoSpots Master Product & Engineering Execution Plan v2. This record must not be promoted to `ACCEPTED` until exact-head CI, guarded merge, production deployment and runtime verification are complete.

## Gate P10

> Owner can tell who did what, who approved what and which actions are suspicious.

## Scope under execution

- staff employment profiles over canonical Membership identity;
- assigned-branch projection from existing shop/organization memberships;
- effective-dated EmployeeRate as hourly-cost truth;
- PIN/badge quick operator switch with hashing, lockout and short-lived attribution sessions;
- full-auth/elevated approval boundary for high-risk actions;
- weekly scheduling policy, time-clock enforcement, lateness, break compliance, overtime visibility and shift swaps;
- owner-configurable approval policies;
- single-use approval lifecycle and denial evidence;
- owner-configurable suspicious-action notifications with dedupe windows;
- immutable staff action evidence;
- operational staff performance/exception metrics, explicitly not payroll;
- permanent Phase 10 unit, PostgreSQL, migration and browser acceptance coverage.

Phase 11 is not part of this change.

## Acceptance checklist

- [ ] staff profile/role/hourly cost/active state/branch access verified
- [ ] wrong PIN verified
- [ ] PIN lockout/rate-limit verified
- [ ] approval-required flow verified
- [ ] approval denial verified
- [ ] single-use approval concurrency verified
- [ ] manual time edit verified
- [ ] suspicious-action notification verified
- [ ] staff attribution verified
- [ ] branch isolation/access verified
- [ ] scheduling/lateness/break/overtime behavior verified
- [ ] shift swap verified
- [ ] clean migration proof
- [ ] representative upgrade proof
- [ ] API build/tests green
- [ ] web typecheck/build green
- [ ] browser E2E green
- [ ] exact final Phase 10 head green across required CI
- [ ] guarded PR merge
- [ ] resulting main verified
- [ ] exact merged revision deployed to production
- [ ] production runtime and critical Phase 10 routes verified
