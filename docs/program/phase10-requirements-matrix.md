# Phase 10 requirements matrix

| Source requirement | Canonical implementation target | Evidence gate |
| --- | --- | --- |
| Staff display name / employee number / job role | `StaffEmploymentProfile` over Membership + JobRole | API + PostgreSQL pilot |
| Permission role / active state | Existing `Membership.role` + `Membership.isActive` | branch-access + inactive-operator tests |
| Hourly cost | Existing effective-dated `EmployeeRate` | profile projection + migration preservation |
| Assigned branches | Existing per-Shop Memberships; owner view bounded to current Organization | branch access test |
| Optional manager relationship | `StaffEmploymentProfile.managerMembershipId`, same-shop validation | API/pilot |
| PIN / badge switch | Argon2 PIN hash, SHA-256 badge hash, DB lockout, hashed short-lived session | wrong PIN + lockout tests |
| High-risk identity clarity | PIN-switched operator cannot act high-risk under another JWT identity | E2E/API test |
| Schedule / time clock / breaks | Existing workforce rows | regression + browser |
| Enforce schedule / lateness / break compliance / overtime | `WorkforcePolicy` + server preflight + metrics | rule + PostgreSQL tests |
| Shift swap | `ShiftSwapRequest` + overlap-safe schedule reassignment | pilot |
| Configurable approvals | `StaffApprovalPolicy` + global mutation interceptor | approval-required/denial tests |
| Single-use elevated approval | atomic `APPROVED -> IN_USE -> CONSUMED` | concurrency test |
| Owner notification controls | `StaffNotificationRule` + existing NotificationsService | suspicious-action notification test |
| Staff attribution | immutable `StaffActionEvidence`, operator token aware | staff attribution test |
| Who approved what | evidence references approval + approver membership | feed/pilot |
| Performance metrics | evidence + time/schedule facts | API/browser |
| Tenant isolation | shop-scoped service checks + forced RLS policies | cross-tenant pilot |
| Migration safety | expand-only migration + staff/profile/workforce backfill preservation | clean + representative upgrade CI |
| Production | guarded merge + exact-SHA deployment/runtime verification | final acceptance |
