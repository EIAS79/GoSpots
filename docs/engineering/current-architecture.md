# GoSpots current architecture

**Updated:** 2026-08-14  
**Repository:** `EIAS79/GoSpots`  
**Purpose:** Current engineering baseline used by the Master Product & Engineering Execution Plan v2.

The canonical product/domain contracts are now:

- `docs/product/PRODUCT_CONTRACT.md`;
- `docs/architecture/DOMAIN_TRUTH.md`;
- `docs/architecture/FINANCIAL_AUTHORITY.md`;
- `docs/architecture/OFFLINE_STRATEGY.md`;
- `docs/architecture/INTEGRATION_POLICY.md`.

## 1. Runtime and repository

GoSpots is a pnpm monorepo on Node 24:

- `apps/api` — NestJS 11 API;
- `apps/web` — Next.js 16 tenant/public web application;
- `apps/edge` — Node 24 local Edge Hub using SQLite for durable LAN state;
- `apps/api/prisma` — Prisma 6 multi-file PostgreSQL schema + committed migrations;
- `.github/workflows/ci.yml` — API/web/Edge/migration/browser regression gate;
- `render.yaml` — API deployment definition;
- Vercel — web deployment;
- Neon PostgreSQL — production database.

`pnpm-lock.yaml` is the dependency source of truth. Production/application migrations use committed Prisma migrations and `prisma migrate deploy`, never `db push` or `migrate reset`.

## 2. Tenant and identity boundary

`Shop` remains the current operational tenant/venue boundary. Global `User` identity is joined to Shops through membership/RBAC. Organization provides verified multi-location grouping without weakening Shop isolation.

Rules for every domain:

1. never trust a payload `shopId` as authorization;
2. query/mutate through authenticated tenant context;
3. direct tenant tables follow repository RLS/same-tenant integrity conventions where applicable;
4. organization-wide reads require explicit organization membership/access validation and must restore tenant-RLS context after bounded bypass use.

## 3. Cross-cutting foundation

Shared infrastructure includes:

- exact money/currency utilities;
- durable `IdempotencyReceipt` with request hashes;
- global correlation/request IDs;
- stable API domain error taxonomy;
- optimistic-version helpers;
- durable versioned `DomainEventOutbox` convention;
- per-Shop feature/capability enforcement;
- typed audit context;
- structured request logging;
- optional redacted Sentry telemetry.

The invariant is same idempotency key + same request = replay, while the same key + different request = conflict.

## 4. Financial bounded contexts

Two money systems are intentionally separate:

1. GoSpots SaaS subscription billing for charging venues for GoSpots;
2. venue guest checkout/payment/fiscal flows for charging a venue's guests.

They do not share payment authority merely because both represent money.

### Visit / checkout spine

`GuestCheck` is the visit/open-tab commercial container. The canonical checkout path is:

```text
GuestCheck
  → CheckSettlement
  → immutable ChargeSnapshot
  → Payment / PaymentAllocation
  → Refund / RefundAllocation
  → Ledger / cash / fiscal consequences
```

Legacy billed/payment fields on older source models remain compatibility data until a deliberate contract migration. New work must not create a second financial truth.

## 5. Cash, devices, payment terminal and compliance

The repository contains:

- cash drawers/sessions/movements/counts/variance approval;
- tenant-scoped device and payment-terminal registry;
- provider-neutral payment connector boundary;
- durable payment operations with explicit `UNKNOWN` reconciliation state;
- Stripe Terminal adapter/webhook/mapping/reconciliation foundations;
- Poland compliance domain, tax categories and immutable fiscal documents;
- fiscal connector boundary;
- KSeF 2.x connector, encrypted credentials, submission/status/reference/UPO handling and duplicate/UNKNOWN safeguards.

Provider and regulatory adapters remain behind rollout/configuration gates. Repository engineering completion does not fabricate provider credentials, certified-device evidence or legal/accounting approval.

## 6. Offline architecture

Two distinct layers exist.

### Offline Lite

Single-browser transient WAN resilience currently includes:

- service-worker shell/static cache, never API-cache authority;
- IndexedDB private cache + mutation outbox;
- cached checks, floor/resources and menu/catalog;
- local elapsed timers;
- stable device/operation/entity IDs, payload hash, occurrence time and expected versions;
- replay-safe selected GuestCheck/order/session mutations;
- explicit online-only boundaries for non-certified payment/fiscal/refund/reconciliation operations.

### Edge Hub

Multi-device/LAN continuity is separate in `apps/edge`: durable local event log, signed device identity, authenticated LAN protocol, reconnect replay and hardware/printing integration. Browser Offline Lite is not promoted into a multi-device payment/fiscal authority.

The current foundations do not imply that every operation is already Edge-certified; later v2 phases certify workflows individually.

## 7. Operations / hospitality / growth

Current major domains include:

- Operations Workspace / Resource Engine 2.0;
- ordering variants/modifiers/server pricing;
- KDS/prep routing;
- inventory/recipes/purchasing/COGS;
- workforce scheduling/time/labor;
- reservations, deposits, waitlist and capacity engine;
- promotions/packages/tips;
- CRM/membership/loyalty/stored value foundations;
- events/parties execution;
- analytics using ledger/provider/COGS/labor/tip/pricing evidence;
- organization/multi-location;
- provider-neutral integration jobs/webhooks/API credentials;
- printers/customer displays/barcodes;
- ticketing/RFID/access foundations;
- reliability diagnostics;
- automation execution/dead-letter infrastructure;
- evidence-backed AI insights.

## 8. Integration boundary

The generic integration framework is optional. Core GoSpots venue workflows do not require another POS system. A future provider adapter must preserve GoSpots source-of-truth ownership, tenant isolation, idempotency, failure/reconciliation semantics and offline boundaries.

## 9. Deployment and readiness

API production is deployed separately from the web. `/api/v1/live` is liveness; `/api/v1/ready` is the database/config readiness boundary. The web proxies `/api/v1` to the configured API origin. Edge is a venue-local process and is not a replacement for cloud deployment.

High-risk rollout uses per-Shop feature flags/capabilities and pilot Shops before broader activation.

## 10. CI and migration baseline

The current blocking CI path includes:

- frozen pnpm install;
- changed production API semantic lint ratchet;
- API Jest and production build;
- PostgreSQL 17 empty-database migration deploy/status/Prisma validate;
- representative historical migration upgrade assertions;
- web checkout tests;
- web Offline Lite tests;
- web TypeScript check and production build;
- Edge tests/build;
- browser E2E with persisted-state assertions.

Phase 0 additionally enforces a tracked-file standalone-product boundary check.

Repository-wide inherited lint/format debt remains visible as an advisory report; it is not silently auto-fixed during validation.

Migration policy is `expand → compatibility/dual-write when needed → backfill → verify → switch-read → observe → contract`. High-risk money changes require reconciliation and a restore/forward-fix plan before destructive contraction.

## 11. Critical invariants

1. `Shop` / `shopId` remains current tenant authority.
2. Guest checkout and SaaS billing remain separate bounded contexts.
3. `GuestCheck` remains the commercial spine; settlement/payment are explicit domains.
4. Authoritative money is server-side and exact.
5. Financial history is append-only/immutable where defined; corrections are new facts.
6. External timeouts are not silently treated as failures when provider state may be unknown.
7. Idempotency changed-payload reuse is a conflict.
8. Offline replay cannot silently overwrite a newer cloud aggregate.
9. Terminal/fiscal/KSeF actions are not claimed offline unless an explicit provider/compliance mode proves them safe.
10. New migrations are expand-first and `main` must remain deployable.
11. Feature/capability checks are server-authoritative, not UI-only hiding.
12. Exact-head CI, not an earlier green commit, is repository acceptance evidence.
13. Generic integrations remain optional and cannot become an external POS dependency.

## 12. Known external acceptance boundaries

Repository CI cannot manufacture:

- a real supported payment-reader transaction;
- certified fiscal hardware/provider behavior;
- KSeF TEST/DEMO credentials in an operator-owned environment;
- Polish legal/accounting sign-off;
- certification of every physical printer/scanner/display/cash-drawer device;
- a real venue pilot.

These are explicit later-phase release/pilot evidence, not reasons to weaken or falsify software gates.
