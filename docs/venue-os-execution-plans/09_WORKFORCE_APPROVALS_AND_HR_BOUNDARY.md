# 09 — Workforce, Shift Operations, High-Risk Approvals, Timekeeping and Payroll Boundary

**Classification:** P10 `COVERED_VERIFY_DEPTH`; salary/payroll/statutory HR is `DELIBERATELY_EXCLUDED` from initial release | **Priority:** P0 for permissions and cashier attribution; P1 for scheduling, P3 for full payroll.

## Existing contract

The master already defines staff profile, clock-in/out, scheduling, approval workflows, PIN operator switch, performance and suspicious-action signals. Some historical Phase 10 acceptance notes are stale or contradictory; re-certify source before assuming incomplete code. Full payroll and advanced HR were explicitly excluded from initial commercial release in section 27.

## Workforce safety model

`Employee/StaffProfile`, shop membership/role, credentials, operational shift, device/operator switch, assigned cash drawer, signed approval decision, time punch, schedule, incident and performance facts must be scoped by venue. Never allow a manager approval merely by frontend hidden button; back-end authorization recomputes supervisor's permission at the time of action. Emergency role elevation is short-lived, justified and separately audited.

## Tasks

1. Role/perms: enumerate owner, branch manager, floor attendant, cashier, kitchen, stock receiver, accountant read-only, support staff, service technician, event attendant. Build a complete ability matrix for start timer, apply discount, manual/card exception, split/merge check, open till, refund, override VAT, edit invoice, stock correction, voucher issuance, export all customer data, reset MFA, configure webhook, provision hardware and view cross-site reporting.
2. PIN/quick-switch hardening: short idle re-auth, device binding, rate limit and PIN lockout, protect audit actor across handover, avoid 'shared PIN' and retain owner override attribution. Offline credentials must be time-limited and encrypted, and device loss revokes them when connected.
3. Timekeeping: local shift start/end, unpaid break, late/early, split shift, overnight DST, sick/holiday absence entry if needed, correction with reason+approval. Exports label **operational timesheet**, not legally certified payroll record without required local employment data and review.
4. Scheduling: availability, qualified role coverage, conflicts and minimum staffing rules, roster publish and change acknowledgement, manager notifications, capacity planning; use schedule as support, not legal compliance attestation.
5. Fraud controls: dual control for manual card attestation, void of prepared food, refund over threshold, price override, negative-stock change, large safe drop and data export. Alert with reasons and immutable `ApprovalAudit` including requesting actor, approver, object version and expiry.
6. Tips and gratuities: capture and allocate accurately, distinguish tip from service charge, customer VAT treatment where applicable, owner-approved payout policies, shift/day reporting; tax/employment classification reviewed in Poland. Tip pooling is a **proposed** separate workstream, not proven absent code.
7. Offboarding: revoke live sessions, tokens, device keys, shared access and email invites, recover till/device assignments, preserve legally retained timesheets and financial audit attribution.
8. HR boundary: if offering payroll, treat as separate Plan 14 with employment contracts, rates, PIT/ZUS, leave, sensitive personal-data controls and qualified compliance maintenance; no 'calculate salary' button marketed as statutory payroll without this.

## Acceptance tests

- Cashier self-approves high-risk refund by swapping browser identity: denied; delegated supervisor signature logged.
- Stale PIN/session for terminated staff cannot collect new card/cash or export customer records.
- Two staff users share tablet; every action is attributed to actual currently authenticated actor, not device owner.
- Worker shift spans Polish DST and 04:00 business boundary; duration and wage export correctly separated.
- Manager overrides break time; original punch remains in immutable history.
- Support engineer with no merchant authorization cannot impersonate or change financial state.
- Tip/payments total reconciles per day without inventing whether amounts were paid via employer payroll.

## Gate

`role-permission-capability-matrix.md` complete, API-level denial tests, audit trace, physical staff-shift pilot and password/PIN/offboarding drill. Payroll is a conscious **DEFERRED** commercial scope with accountant-grade exports until Plan 14 launched.
