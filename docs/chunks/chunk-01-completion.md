# Chunk 01 — Cross-Cutting Engineering Foundation

## Status

**DONE — repository acceptance gate complete on PR #36.**

## Delivered foundation

### Money

GoSpots keeps authoritative venue money in exact server-side representations rather than JS floating-point calculations. Shared money utilities provide explicit currency, Decimal/minor-unit conversions and rounding behavior. Existing GuestCheck/Checkout code consumes server-authoritative values.

### Idempotency

The repository reuses the durable `IdempotencyReceipt` rather than introducing a competing record type. The contract is:

```text
(shopId, scope/operation, key) + requestHash
```

- same key + same request → completed response replay;
- same key + different request → `IDEMPOTENCY_CONFLICT`;
- PENDING/COMPLETED state is durable;
- concurrent claims are serialized by database behavior/transaction handling.

The pattern is used by settlement/payment/refund/offline boundaries and is covered by replay/conflict tests.

### Correlation IDs

`x-correlation-id` is validated/generated globally and reused as the compatibility request ID for structured request logging. PR #36 exposes/allows `x-correlation-id` through CORS, so browser/operator clients can supply and read it. `x-request-id` remains supported for compatibility.

### Domain events

`DomainEventOutbox` is the durable application outbox convention. The publisher requires a Prisma transaction client so aggregate mutation and event creation can share one transaction. Events use lower-case dot-separated names such as `payment.captured`.

### Optimistic concurrency

Shared expected-version helpers return stable `VERSION_CONFLICT` semantics. High-contention aggregates such as GuestCheck/settlement/operations use explicit versions where applicable.

### Error taxonomy

The cross-cutting domain error vocabulary includes:

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

Frontend/API error envelopes preserve stable operator-readable categories instead of leaking raw provider failures.

### Feature flags

`FeatureFlagService.isFeatureEnabled(shopId, feature)` is the per-Shop rollout boundary. Explicit database overrides are authoritative; non-default production features do not silently become enabled because of an environment variable. Development can opt into named flags.

### Audit context

The shared audit context covers actor, Shop, optional device, correlation, action, target, before/after, reason and approval data while preserving the existing `AuditLog` domain.

## Database

The original Chunk 01 migration added the Shop feature-flag and domain-event-outbox persistence additively and under the repository's tenant/RLS policy. The durable idempotency table was reused rather than duplicated.

PR #36 adds no destructive Chunk 01 migration. The complete migration chain is revalidated on PostgreSQL 17 in CI.

## Acceptance Gate 01

- [x] Shared utilities are adopted by existing production domains.
- [x] Shared money convention exists and is exercised by current financial domains.
- [x] Durable idempotency supports same-request replay and changed-request conflict.
- [x] Correlation ID is generated/reused in logs and is CORS-visible.
- [x] Stable error taxonomy exists.
- [x] Optimistic version convention exists and is used by high-contention aggregates.
- [x] Durable transactional domain-event outbox exists.
- [x] Per-Shop feature flag service exists with tenant isolation.
- [x] Shared audit context exists.
- [x] API spec linting uses `tsconfig.spec.json` correctly.
- [x] No behavior regression in blocking tests/builds.
- [x] Final PR #36 exact-head blocking CI is green before ready-for-review transition.

## Compatibility / rollback

The foundation remains additive. Existing `x-request-id`, legacy callers and existing idempotency storage remain compatible. Rollback is code/feature rollback while additive database objects remain in place until a later deliberate contract phase.
