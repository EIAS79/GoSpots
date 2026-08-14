# Phase 1 v2 — Platform Kernel Acceptance Record

Source: `GoSpots_Master_Product_and_Engineering_Execution_Plan_v2.md`, Phase 1 — Platform Kernel: Tenancy, Auth, Permissions and Integrity.

Status: `ACCEPTED`.

Software acceptance evidence:

- Phase implementation PR: `#41`, merged with expected head `1d68e0c23009d1df90ae7337965c2d2962778ab6`;
- Phase acceptance-hardening PR: `#43`, merged with expected head `db48b011060d63c02d2b8ca713acfb516306ec43`;
- final merged code revision: `33246c762543712e420def14a583ce9b80403571`;
- exact-head PR CI: run `31777894821` (#501), all six jobs passed;
- post-merge main CI: run `31778559570` (#502), all six jobs passed;
- acceptance-hardening exact-head CI: run `31783431973` (#507), all six jobs passed;
- final post-merge main CI: run `31783705960` (#508), all six jobs passed;
- standalone product boundary run `31783705778` (#18) and production-validation run `31783705788` (#29) passed on final main;
- Vercel production deployment `dpl_2vBFuVFbxpPpVDbJcTeHuZ2KTzBi` is `READY`, targets the final merged revision and owns the production aliases;
- production homepage and login routes return HTTP 200;
- production `/api/v1/live` and `/api/v1/ready` return HTTP 200 through the canonical proxy, with `database: up`;
- Vercel reported no runtime-error clusters after deployment;
- Render deployment `dep-d9vd103bc2fs73catemg` checked out final main, built successfully, ran `prisma migrate deploy`, started the Nest application and became live;
- Neon production migration `20260814130000_phase1_kernel_acceptance_hardening` finished at `2026-08-14T08:25:39.419239Z` without rollback;
- production retained all 2,281 Reservation rows, with zero invalid version rows and zero orphan idempotency receipts;
- authenticated production smoke passed CSRF bootstrap/login, venue binding, auth/me, settings load/save, stale-write conflict, immutable audit and specialized-role workflows.

## Production acceptance details

- pre-session `POST /auth/login` without a bootstrap CSRF token: HTTP 403;
- CSRF bootstrap and authenticated login: HTTP 200, correct venue bound;
- `/auth/me` and `/shop/settings`: HTTP 200;
- settings save at expected version 1: HTTP 200 and version advanced to 2;
- repeated stale save at expected version 1: HTTP 409, `VERSION_CONFLICT`;
- audit list: HTTP 200 and `canDelete: false`;
- audit deletion probe: HTTP 405, immutable-evidence contract preserved;
- specialized KITCHEN membership creation/list path: HTTP 201/200; canonical permissions were `venue.read`, `order.read`, `order.write`;
- acceptance membership was deactivated after verification and retained as audit evidence.

Phase 1 has no payment-provider, fiscal, legal or physical-hardware acceptance gate. No executable or external Phase 1 requirement remains open.

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
| Optimistic concurrency | EXISTING_NEEDS_CHANGE → IMPLEMENTED | shared version utility retained; Reservation, Stocktake and RFID credential versions added; settings, Reservation, OperationsSession, AutomationRule and RFID rebind writes now enforce tenant-scoped compare-and-swap. |
| Durable audit context | EXISTING_NEEDS_CHANGE → IMPLEMENTED | correlation, source device, reason and before/after state are first-class fields; API and database now reject destructive audit deletion. |
| Versioned transactional domain events | EXISTING_NEEDS_CHANGE → IMPLEMENTED | v1 contract retained; correlation, retry schedule, replay and per-consumer durable completion receipts added; unknown versions remain dead-lettered. |
| Time, timezone and business day | PARTIALLY_IMPLEMENTED → IMPLEMENTED | IANA venue timezone/DST helpers retained; configurable business-day rollover and DST-safe half-open report boundaries added. |
| Error taxonomy | EXISTING_NEEDS_CHANGE → IMPLEMENTED | required tenant, feature, busy/conflict, payment unknown, fiscal and offline-action codes added without removing compatibility codes. |

## Database delta

Migrations:

- `20260814090000_phase1_platform_kernel_v2`
- `20260814130000_phase1_kernel_acceptance_hardening`

- expands `ShopRole` without rewriting historical rows;
- adds `Shop.businessDayStartMinutes` with a database range check;
- binds `IdempotencyReceipt` to its owning Shop and adds correlation context;
- adds outbox correlation/retry scheduling and same-Shop consumer receipts;
- adds first-class audit context columns;
- installs a database trigger preventing audit deletion.

The acceptance-hardening migration:

- adds non-null version 1 columns for Reservation, Stocktake and RFID credentials;
- adds and validates positive-version constraints for dangerous stale-write aggregates;
- validates the existing IdempotencyReceipt → Shop foreign key after confirming zero production orphans.

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
- Render revision/startup and Neon production migration/data assertions — passed;
- authenticated settings/staff/audit/CSRF smoke — passed;
- Vercel/Render runtime review found no unexpected immediate production errors.

## Gate P1

No later phase may add a parallel money helper, idempotency store, audit mechanism, capability shortcut, event version convention or client-trusted tenant shortcut. The canonical modules are listed in `docs/program/MASTER_EXECUTION_STATUS.md`.

Gate P1: `PASS`. Phase 1 is `ACCEPTED` on final main `33246c762543712e420def14a583ce9b80403571`.
