# Phase 1 v2 — Platform Kernel Acceptance Record

Source: `GoSpots_Master_Product_and_Engineering_Execution_Plan_v2.md`, Phase 1 — Platform Kernel: Tenancy, Auth, Permissions and Integrity.

Status: `SOFTWARE_DONE / BLOCKED_EXTERNAL`.

Software acceptance evidence:

- Phase PR: `#41`, merged with expected head `1d68e0c23009d1df90ae7337965c2d2962778ab6`;
- merged code revision: `7fcc453755e954e2b68227c342a557cdea885d84`;
- exact-head PR CI: run `31777894821` (#501), all six jobs passed;
- post-merge main CI: run `31778559570` (#502), all six jobs passed;
- standalone product boundary and Edge production-validation workflows passed on both the PR head and merged main revision;
- Vercel production deployment `dpl_8vuQZ5YTHbBhFtXqH4NX4e6WYNE2` is `READY`, targets the merged revision and owns the production aliases;
- production homepage and login routes return HTTP 200;
- production `/api/v1/live` and `/api/v1/ready` return HTTP 200 through the canonical proxy, with `database: up`;
- Vercel reported no runtime-error clusters after deployment.

External/admin evidence still required before `ACCEPTED`:

1. In the Render dashboard for `gospots-api`, verify the active deployment revision is `7fcc453755e954e2b68227c342a557cdea885d84` and its build log shows `prisma migrate deploy` completed with `20260814090000_phase1_platform_kernel_v2` applied. The execution browser reached the Render sign-in page and had no authenticated session.
2. With an authorized production owner account, smoke the affected Settings, Staff and Audit screens: load settings including `version` and `businessDayStartMinutes`, save once, confirm a stale save returns `VERSION_CONFLICT`, verify specialized role selection, and confirm audit delete is unavailable/rejected. No production account credentials were available to this execution.

These are deployment/provider-access and production-account evidence gates. No executable repository or application work remains open.

## Requirement reconciliation

| Requirement | Classification | Repository evidence |
| --- | --- | --- |
| Secure login/logout/recovery | EXISTING_AND_VERIFIED | Argon2 password handling, cookie/CSRF policy, owner and staff recovery, family logout. |
| Refresh rotation, revocation and session/device list | EXISTING_AND_VERIFIED | `AuthSession`, refresh-family reuse detection, idle/absolute expiry, `/auth/sessions` and settings UI. |
| Auth rate limit and lock/backoff | EXISTING_AND_VERIFIED | route-specific throttles plus failed-login lock policy. |
| Privileged MFA | EXISTING_AND_VERIFIED | owner TOTP/recovery and elevated staff MFA support; system administrators use the same owner-capable TOTP identity surface. |
| Tenant/organization/venue boundary | EXISTING_AND_VERIFIED | `Shop` is the venue transaction boundary; organization access is explicit and cannot bind a non-granted Shop; RLS/tenant and organization negative tests remain canonical. |
| Minimum roles and granular permissions | EXISTING_NEEDS_CHANGE → IMPLEMENTED | organization owner and venue owner mappings retained; Supervisor, Cashier, Server, Kitchen, Inventory and Viewer added; machine-readable role templates and all required permission families added. Legacy `STAFF` remains as the custom-role compatibility path. |
| Separate high-risk permissions | EXISTING_NEEDS_CHANGE → IMPLEMENTED | price override, discount, comp, void-after-send, refund, cash paid-out, reopen, day reopen, inventory correction, membership balance correction and fiscal retry/override are distinct catalog entries. |
| Server-authoritative capabilities | EXISTING_AND_VERIFIED | `FeatureFlagGuard` delegates to `CapabilityService`; entitlement, account state, feature flag and provider/device readiness are composed without an OWNER bypass. |
| Canonical money | EXISTING_NEEDS_CHANGE → IMPLEMENTED | Prisma Decimal + ISO currency retained; subtraction, percentage, tax, discount, equal allocation, weighted split, deterministic residual allocation and formatting added. |
| Shared idempotency | EXISTING_NEEDS_CHANGE → IMPLEMENTED | existing durable receipt mechanism retained; correlation ID added; request hash/replay/changed-payload/concurrent claim behavior retained. |
| Optimistic concurrency | EXISTING_AND_VERIFIED | shared version utility and aggregate version fields for dangerous stale writes retained. |
| Durable audit context | EXISTING_NEEDS_CHANGE → IMPLEMENTED | correlation, source device, reason and before/after state are first-class fields; API and database now reject destructive audit deletion. |
| Versioned transactional domain events | EXISTING_NEEDS_CHANGE → IMPLEMENTED | v1 contract retained; correlation, retry schedule, replay and per-consumer durable completion receipts added; unknown versions remain dead-lettered. |
| Time, timezone and business day | PARTIALLY_IMPLEMENTED → IMPLEMENTED | IANA venue timezone/DST helpers retained; configurable business-day rollover and DST-safe half-open report boundaries added. |
| Error taxonomy | EXISTING_NEEDS_CHANGE → IMPLEMENTED | required tenant, feature, busy/conflict, payment unknown, fiscal and offline-action codes added without removing compatibility codes. |

## Database delta

Migration: `20260814090000_phase1_platform_kernel_v2`

- expands `ShopRole` without rewriting historical rows;
- adds `Shop.businessDayStartMinutes` with a database range check;
- binds `IdempotencyReceipt` to its owning Shop and adds correlation context;
- adds outbox correlation/retry scheduling and same-Shop consumer receipts;
- adds first-class audit context columns;
- installs a database trigger preventing audit deletion.

`prisma/phase1-kernel-assert.ts` is the clean/upgrade database contract assertion and runs in both migration CI jobs.

## Test evidence

- API unit/property tests, including 500 generated allocation/split conservation cases;
- auth, permission, tenant, idempotency, event and business-day/DST tests;
- clean PostgreSQL 17 migration plus Phase 1 schema assertion;
- representative historical-data upgrade plus preservation and Phase 1 assertions;
- web checks/typecheck/build and permanent browser E2E smoke;
- Edge test/build regression;
- exact-head CI for the Phase 1 PR and post-merge `main` — complete;
- Vercel production revision, public health and runtime-log checks — complete;
- Render API revision/migration-log match and authenticated settings/staff/audit smoke — external/admin pending as recorded above.

## Gate P1

No later phase may add a parallel money helper, idempotency store, audit mechanism, capability shortcut, event version convention or client-trusted tenant shortcut. The canonical modules are listed in `docs/program/MASTER_EXECUTION_STATUS.md`.
