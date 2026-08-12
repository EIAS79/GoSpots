# Chunk 01 — Cross-Cutting Engineering Foundation

## Status

**VERIFYING on PR #36.** Repository implementation is complete; mark **DONE** only when the final PR head passes all blocking CI gates.

## Delivered foundation

### Money

GoSpots keeps authoritative venue money in exact server-side representations rather than JS floating-point calculations. The shared money utilities provide explicit currency, Decimal/minor-unit conversions and rounding behavior. Existing GuestCheck/Checkout code consumes server-authoritative values.

### Idempotency

The repository reuses the existing durable `IdempotencyReceipt` instead of introducing a competing record type. The contract is:

```text
(shopId, scope/operation, key) + requestHash
```

- same key + same request → completed response replay;
- same key + different request → `IDEMPOTENCY_CONFLICT`;
- PENDING/COMPLETED state is durable;
- concurrent claims are serialized by database behavior/transaction handling.

This pattern is used by settlement/payment/refund/offline boundaries and is tested for replay/conflict semantics.

### Correlation IDs

`x-correlation-id` is validated/generated globally and reused as the compatibility request ID for structured request logging. PR #36 also exposes/allows `x-correlation-id` through CORS, so browser/operator clients can supply and read it instead of losing it at the web/API boundary. `x-request-id` remains supported for compatibility.

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

Frontend/API error envelopes preserve a stable operator-readable category instead of leaking raw provider failures.

### Feature flags

`FeatureFlagService.isFeatureEnabled(shopId, feature)` is the per-Shop rollout boundary. Explicit database overrides are authoritative; non-default production features do not silently become enabled because of an environment variable. Development can opt into named flags.

### Audit context

The shared audit context covers actor, Shop, optional device, correlation, action, target, before/after, reason and approval data while preserving the existing `AuditLog` domain.

## Database

The original Chunk 01 migration added the Shop feature-flag and domain-event-outbox persistence additively and under the repository's tenant/RLS policy. The durable idempotency table was reused rather than duplicated.

PR #36 adds no destructive Chunk 01 migration. The current migration chain is revalidated on PostgreSQL 17 in CI.

## Acceptance Gate 01

- [x] Shared money convention exists and is exercised by current financial domains.
- [x] Durable idempotency supports same-request replay and changed-request conflict.
- [x] Correlation ID is generated/reused in logs and is now CORS-visible.
- [x] Stable error taxonomy exists.
- [x] Optimistic version convention exists and is used by high-contention aggregates.
- [x] Durable transactional domain-event outbox exists.
- [x] Per-Shop feature flag service exists with tenant isolation.
- [x] Shared audit context exists.
- [x] API spec linting again uses `tsconfig.spec.json` rather than failing project discovery.
- [ ] **Final PR #36 exact-head CI green.**

The final unchecked item must be filled with the final SHA/run only after the last code/document change.

## Compatibility / rollback

The foundation remains additive. Existing `x-request-id`, legacy callers and existing idempotency storage remain compatible. Rollback is code/feature rollback while additive database objects remain in place until a later deliberate contract phase.
