# GoSpots current architecture

**Updated:** 2026-08-12  
**Repository:** `EIAS79/GoSpots`  
**Purpose:** Chunk 00 safety baseline for the architecture that exists now, after Chunks 01–27 and Checkout V3 work.

## 1. Runtime and repository

GoSpots remains a pnpm monorepo on Node 24:

- `apps/api` — NestJS 11 API;
- `apps/web` — Next.js 16 tenant/public web application;
- `apps/edge` — Node 24 local Edge Hub using SQLite for durable LAN state;
- `apps/api/prisma` — Prisma 6 multi-file PostgreSQL schema + committed migrations;
- `.github/workflows/ci.yml` — API/web/Edge/migration regression gate;
- `render.yaml` — API deployment definition;
- Vercel — web deployment;
- Neon PostgreSQL — production database.

`pnpm-lock.yaml` is the dependency source of truth. Production/application migrations use committed Prisma migrations and `prisma migrate deploy`, never `db push` or `migrate reset`.

## 2. Tenant and identity boundary

`Shop` remains the operational tenant boundary. Global `User` identity is joined to Shops through membership/RBAC. Global authentication, permission, trial/subscription, venue-context and tenant/RLS infrastructure remain authoritative.

Rules for every domain:

1. never trust a payload `shopId` as authorization;
2. query/mutate through the authenticated Shop context;
3. new direct tenant tables must follow the repository RLS convention where applicable;
4. organization-wide reads require explicit organization membership/access validation and must not leave tenant-RLS bypass enabled afterward.

## 3. Cross-cutting foundation

Shared infrastructure now includes:

- exact money/currency utilities;
- durable `IdempotencyReceipt` with request hashes;
- global correlation/request IDs;
- stable API domain error taxonomy;
- optimistic-version helpers;
- durable `DomainEventOutbox` convention;
- per-Shop feature flags;
- typed audit context;
- structured request logging;
- optional redacted Sentry telemetry.

The invariant is same idempotency key + same request = replay, while the same key + different request = conflict.

## 4. Financial bounded contexts

Two money systems remain intentionally separate:

1. GoSpots SaaS subscription billing for charging venues for GoSpots;
2. venue guest checkout/payment/fiscal flows for charging a venue's guests.

They must not share payment authority merely because both represent money.

### Visit / checkout spine

`GuestCheck` remains the visit/open-tab container. The canonical checkout path is:

```text
GuestCheck
  → CheckSettlement
  → immutable ChargeSnapshot
  → Payment / PaymentAllocation
  → Refund / RefundAllocation
  → ledger / cash / fiscal consequences
```

Checkout V3 preserves server-authoritative totals and payment-safe state transitions. Legacy billed/payment fields on older source models remain compatibility data until a deliberate later contract migration; new work must not create a second financial truth.

## 5. Cash, devices, payment terminal and compliance

The repository contains:

- cash drawers/sessions/movements/counts/variance approval;
- tenant-scoped device and payment-terminal registry;
- provider-neutral payment connector boundary;
- durable payment operations with explicit `UNKNOWN` reconciliation state;
- Stripe Terminal connector, webhook handling, terminal mapping, refund/cancel/status reconciliation;
- Poland compliance domain, tax categories and immutable fiscal documents;
- fiscal connector boundary;
- KSeF 2.x connector, encrypted credentials, submission/status/reference/UPO handling and duplicate/UNKNOWN safeguards.

Provider and regulatory adapters remain behind rollout/configuration gates. Repository engineering completion does not fabricate external provider credentials, certified-device evidence or legal/accounting approval.

## 6. Offline architecture

Two distinct layers exist.

### Offline Lite

Single-browser transient WAN resilience:

- service-worker shell/static cache, never API-cache authority;
- IndexedDB private cache + mutation outbox;
- cached checks, floor/resources and menu/catalog;
- local elapsed timers;
- stable device/operation/entity IDs, payload hash, occurrence time and expected versions;
- replay-safe GuestCheck create/update;
- replay-safe simple order addition with authoritative server pricing on reconnect;
- replay-safe gaming session start/end with resource/version conflict checks;
- explicit online-only payment/fiscal/refund/reconciliation boundary.

### Edge Hub

Multi-device/LAN authority is separate in `apps/edge`: durable local event log, signed device identity, authenticated LAN protocol, reconnect replay and hardware/printing integration. Browser Offline Lite is not promoted into a multi-device payment/fiscal authority.

## 7. Operations / hospitality / growth

Current major domains also include:

- Operations Workspace / Resource Engine 2.0;
- ordering variants/modifiers/server pricing;
- KDS/prep routing;
- inventory/recipes/purchasing/COGS;
- workforce scheduling/time/labor;
- Reservations 2.0, deposits, waitlist and capacity engine;
- promotions/packages/tips;
- CRM/membership/loyalty/stored value;
- events/parties execution;
- Analytics 2.0 using Ledger/provider/COGS/labor/tip/pricing evidence;
- organization/multi-location;
- integration jobs/webhooks/API credentials and fail-closed GoPOS boundary;
- printers/customer displays/barcodes;
- ticketing/RFID;
- reliability diagnostics;
- automation execution/dead-letter infrastructure;
- evidence-backed AI insights.

## 8. Deployment and readiness

API production is deployed separately from the web. `/api/v1/live` is liveness; `/api/v1/ready` is the database/config readiness boundary. The web proxies `/api/v1` to the configured API origin. Edge is a venue-local process and is not a replacement for cloud deployment.

High-risk rollout uses per-Shop feature flags and pilot Shops before broader activation.

## 9. CI and migration baseline

Chunk 00's current blocking regression path is:

- frozen pnpm install;
- changed production API semantic lint ratchet;
- API Jest;
- API production build;
- PostgreSQL 17 empty-database migration deploy/status/Prisma validate;
- web checkout tests;
- web Offline Lite tests;
- web TypeScript check;
- web production build against an inert CI proxy target;
- Edge tests/build.

Repository-wide inherited lint/format debt remains visible as a non-destructive advisory report; it is not silently auto-fixed during validation.

Migration policy is `expand → compatibility/dual-write when needed → backfill → verify → switch-read → observe → contract`. High-risk money changes require reconciliation and a restore/forward-fix plan before destructive contraction.

## 10. Critical invariants

1. `Shop` remains tenant authority.
2. Guest checkout and SaaS billing remain separate bounded contexts.
3. `GuestCheck` remains the visit spine; settlement/payment are explicit domains.
4. Authoritative money is server-side and exact.
5. Financial history is append-only/immutable where defined; corrections are new records.
6. External timeouts are not silently treated as failures when provider state may be unknown.
7. Idempotency changed-payload reuse is a conflict.
8. Offline replay cannot silently overwrite a newer cloud aggregate.
9. Terminal/fiscal/KSeF actions are not claimed offline unless an explicit provider/compliance mode proves them safe.
10. New migrations are expand-first and `main` must remain deployable.
11. Feature flags are per-Shop rollout controls, not UI-only hiding.
12. Exact-head CI, not an earlier green commit, is the repository acceptance evidence.

## 11. Known external acceptance boundaries

Repository CI cannot manufacture:

- a live Stripe Terminal account/reader sandbox transaction;
- certified fiscal hardware/provider behavior;
- KSeF TEST/DEMO credentials in an operator-owned environment;
- Polish legal/accounting sign-off;
- licensed GoPOS production API access;
- certification of every physical printer/scanner/display device.

These are explicit release/pilot evidence, not reasons to weaken or falsify repository gates.
