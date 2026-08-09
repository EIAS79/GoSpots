# Chunk 01 Completion — Cross-Cutting Engineering Foundation

## Status

**PASS — implementation and blocking CI gate completed.**

- Branch: `agent/gospots-00-repository-baseline`
- Draft PR: #10
- Main branch: **not merged / untouched**
- Implementation verification run: GitHub Actions CI #92 (`31336182967`)
- Verification commit: `0a23ced57675d304b3e8c4e89ee0d9246614b3cb`

## Scope delivered

### Money conventions

- Kept existing `Decimal(19,4)` venue-money storage and existing SaaS minor-unit billing fields.
- Added canonical Prisma Decimal + explicit ISO currency helpers.
- Added exact Decimal sum/multiplication/rounding utilities.
- Retained legacy number-returning helpers for backward compatibility and marked them as non-authoritative.
- Adopted exact Decimal summation in the existing GuestCheck running-total calculation without changing its 4-decimal API wire format.

### Idempotency

- Reused the existing durable `IdempotencyReceipt` mechanism rather than creating a duplicate table.
- Existing key scope remains `(shopId, scope, key)` with request hashing, stored response replay, TTL and concurrent-claim handling.
- Added tests for same-key/same-request replay, same-key/different-request rejection and cross-Shop isolation.

### Correlation IDs

- Added `x-correlation-id` support with validation and safe generation.
- Preserved `x-request-id` as a compatibility alias.
- Added a global interceptor before request logging so both headers and the existing structured `requestId` log field carry the same correlation value.

### Domain-event outbox

- Added `DomainEventOutbox` as an expand-only Shop-scoped model.
- Added forced tenant RLS using the repository's existing `app_tenant_rls_ok(shopId)` policy function.
- Added a transactional outbox service that requires a caller-supplied Prisma `TransactionClient`, preventing accidental event insertion outside the aggregate transaction.
- Added canonical lower-case dot-separated event-name validation.

### Optimistic concurrency

- Kept the existing `BillingSubscription.version` convention.
- Added a shared expected-version assertion helper with stable `VERSION_CONFLICT` error details for future high-contention aggregates.

### Error taxonomy

Added the Chunk 01 cross-cutting error codes additively without removing existing public codes:

- `VALIDATION_ERROR`
- `PERMISSION_DENIED`
- `STATE_CONFLICT`
- `VERSION_CONFLICT`
- `IDEMPOTENCY_CONFLICT`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_STATUS_UNKNOWN`
- `PAYMENT_DECLINED`
- `COMPLIANCE_REQUIRED`
- `OFFLINE_UNSUPPORTED`
- `RESOURCE_CONFLICT`

### Feature flags

- Added `ShopFeatureFlag` with unique `(shopId, feature)` storage and forced tenant RLS.
- Added central `FeatureFlagService.isFeatureEnabled(shopId, feature)`.
- Database overrides are authoritative.
- Missing production flags default to disabled.
- Non-production environments may explicitly opt into named development flags through `FEATURE_FLAGS_DEV_ENABLED`.
- Feature flags remain independent from subscription entitlement checks.

### Audit context

- Added a typed audit-context helper covering actor, Shop, optional device, correlation ID, action, target, before/after, reason and approval context.
- Existing `AuditLog` storage was not replaced or destructively changed.

## Database delta

Migration: `20260809223000_chunk01_foundation`

New tables only:

1. `ShopFeatureFlag`
2. `DomainEventOutbox`

The migration is expand-only. It does not rename/drop existing columns, recalculate finance values, alter existing money columns, or replace `IdempotencyReceipt` / `MailOutbox`.

## Automated verification

GitHub Actions CI #92 passed all blocking jobs on the implementation commit:

- API lint advisory step: completed
- API Jest tests: **PASS**
- API production build: **PASS**
- Web TypeScript check: **PASS**
- Web production build: **PASS**
- Prisma generate: **PASS**
- Fresh PostgreSQL `prisma migrate deploy`: **PASS**
- `prisma migrate status`: **PASS**
- `prisma validate`: **PASS**

Chunk 00's documented pre-existing strict-lint debt remains advisory and was not mass-reformatted into this money-sensitive change set.

## Chunk 01 acceptance gate

- [x] Shared utilities adopted by safe existing code paths.
- [x] Exact money rounding/summation tests added.
- [x] Idempotency replay and payload-conflict behavior tested.
- [x] Shop-scoped idempotency isolation tested.
- [x] Version-conflict behavior tested.
- [x] Correlation IDs propagate into existing structured request logging via the compatibility request-ID field.
- [x] Per-Shop feature flag isolation tested.
- [x] Durable transaction outbox pattern validated.
- [x] Migration deploy/status/schema validation passed on disposable PostgreSQL.
- [x] Existing API and web builds remain green.
- [x] No merge to `main`.

## Rollback / compatibility notes

- Application rollback is safe because the new database objects are additive and unused by legacy flows unless explicitly called.
- Feature flags default off in production when no Shop override exists.
- Existing GuestCheck output shape and serialized money precision remain unchanged.
- Existing `x-request-id` clients remain compatible.
- New tables should be retained during an application rollback until the combined 00–03 rollout decision, consistent with the repository's expand-first migration policy.

## Next dependency

Chunk 02 may consume these foundations for versioned GuestCheck mutations, idempotent settlement operations, Shop-specific rollout and transactional domain events. No Chunk 02 implementation is included in this completion record.
