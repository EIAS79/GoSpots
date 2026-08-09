# GoSpots current architecture baseline

**Baseline date:** 2026-08-09  
**Baseline commit:** `fe8082c0b5c3c4f45b5a3cd71e0eacb94511d9ff`  
**Repository:** `EIAS79/GoSpots`

This file is the Chunk 00 safety baseline. It describes the system that exists before the settlement/checkout architecture is expanded. Future chunks should update this document only when the architecture intentionally changes.

## 1. Repository and runtime

GoSpots is a pnpm monorepo using pnpm `10.12.1` and Node `24.x`.

- `apps/api` — NestJS 11 API
- `apps/web` — Next.js 16 tenant/public web application
- `apps/api/prisma/schema.prisma` — PostgreSQL/Prisma 6 data model
- `apps/api/prisma/migrations` — forward database migrations
- `.github/workflows/ci.yml` — repository CI
- `render.yaml` — API production deployment definition
- Vercel — web production deployment, documented separately in the repository
- Neon PostgreSQL — production database target

`pnpm-lock.yaml` is the canonical workspace lockfile. A legacy/root `package-lock.json` is also present and must not become the dependency source of truth for workspace installs. CI and Render both install with `pnpm --frozen-lockfile`.

## 2. API composition

`AppModule` composes the main business modules, including:

- auth
- staff
- dashboard
- menu
- resources
- reservations
- finance
- billing
- audit
- public/guest
- shop/onboarding
- notifications
- hours/gallery/media/notes
- GDPR
- guest-check
- staff approvals
- health/metrics

The application already has global request/security infrastructure. Do not duplicate it in future chunks without a concrete gap.

Global guards/interceptors include:

- throttling
- CSRF protection
- JWT authentication
- role authorization
- trial/subscription access
- request logging
- venue context resolution
- tenant RLS context

Sentry is installed as the global exception filter.

## 3. Multi-tenancy and RBAC

`Shop` is the operational tenant boundary. Shop-scoped domain records carry `shopId` and relations back to `Shop`.

Identity is global (`User`) and venue access is mediated through membership/RBAC. The API applies global JWT and role guards, then request/tenant context interceptors. Any new financial or operational model must remain shop-scoped unless the model is intentionally platform-global.

Future services must not rely on a client-supplied `shopId` without validating it against the authenticated venue context.

## 4. Existing subscription and entitlement architecture

There are two related billing concerns that must remain distinct:

1. **GoSpots SaaS subscription billing** — provider-neutral billing models/services for charging venues for GoSpots.
2. **Venue guest checkout/payment** — future settlement/payment architecture for a venue charging its own guests.

The repository already contains provider-neutral SaaS billing concepts including billing accounts, subscriptions, payments, operations, webhook processing, provider registry/adapters, reconciliation, and state-machine tests. Stripe is the explicit production default in `render.yaml`; Mollie is present but disabled by default.

Do not reuse SaaS billing payment records as guest checkout payments merely because both represent money. They are separate bounded contexts.

Existing subscription data includes venue pack/add-on/seat concepts and a trial-access guard. Chunk 01 feature flags should integrate cleanly with this entitlement layer rather than scatter new conditional logic through controllers/UI.

## 5. Current visit and commerce model

### GuestCheck

`GuestCheck` is the current open-tab / visit container.

Current states:

- `OPEN`
- `SETTLED`
- `VOID`

It can contain:

- `ShopOrder[]`
- `PlaySession[]`
- `Reservation[]`
- `LedgerEntry[]`

It already stores guest metadata, party size, label/note, currency, payment method, opened/settled/void timestamps and creator metadata.

The current model is a container, not yet the future immutable settlement domain. Chunk 02 must preserve that distinction.

### Reservation

Reservations are shop-scoped and can be attached to a resource and optionally a GuestCheck. The current model includes timing, guest information, status, billed amount/time, discount/base amount/payment method and currency stamps.

### PlaySession

Play sessions represent walk-in or reservation-linked timed activity. They contain resource, timing/duration, amount, currency, discount/payment method, lifecycle status and optional GuestCheck linkage.

### ShopOrder

Shop orders are staff-managed tickets with order status, payment method, total, guest count, reservation fee, currency and optional GuestCheck linkage. Order lines snapshot name, quantity and unit price.

### Transaction / Ledger

The system also has transaction and ledger concepts used by current finance reporting. Later settlement/payment work must reconcile with those existing finance paths rather than create duplicate revenue. Until Chunk 02 explicitly changes finance reads, existing finance behavior remains authoritative.

## 6. GuestCheck service boundary

The API has a dedicated `modules/guest-check` module with controller, service and DTOs. This is the current ownership boundary for GuestCheck behavior.

Chunk 02 may add a separate `checkout`/settlement domain, but should not collapse settlement logic into generic finance code or provider-specific code.

## 7. Finance baseline

The finance module currently owns reporting and play-billing behavior. The most recent baseline commit fixes play-billing tab classification/count consistency. That code is therefore regression-sensitive.

When checkout/settlement is introduced:

- finance reports must stay unchanged with `checkout_v2` disabled;
- new settlement records must not double-post revenue;
- historical reservations/sessions/orders must remain readable;
- money calculations must remain server-authoritative.

## 8. Database and migration baseline

Prisma targets PostgreSQL. Production deployment runs `prisma migrate deploy` before API startup.

CI already provisions an ephemeral PostgreSQL 16 service and executes:

1. Prisma generate
2. `prisma migrate deploy`
3. `prisma migrate status`
4. `prisma validate`

This is the minimum migration regression path. Money-domain changes require the stricter process in `docs/engineering/migration-policy.md`.

A tracked `apps/api/prisma/dev.db` exists even though the active datasource is PostgreSQL. Treat it as legacy/local data; it is not evidence that production uses SQLite.

## 9. Production deployment

### API / Render

Render installs pnpm `10.12.1`, installs the frozen workspace, generates Prisma client, builds the Nest API, verifies `apps/api/dist/main.js`, then runs `prisma migrate deploy` immediately before starting the API.

Health check: `/api/v1/ready`.

Important production environment domains include database, JWT/auth, web origins/CSRF, Resend mail and SaaS billing provider credentials.

### Web / Vercel

The Next.js application is deployed separately on Vercel. Root `build:vercel` delegates to the web build.

## 10. Test/build baseline

Chunk 00 standardizes these root commands:

```bash
pnpm lint
pnpm test
pnpm build
pnpm verify
```

`pnpm verify` is the local aggregate gate: lint → API tests → API build → web build.

The API has Jest tests, including billing state-machine/catalog/webhook coverage. The web currently has typecheck/lint/build tooling but no established unit-test runner, so root `test` intentionally runs the API suite only. A future web test framework should be added deliberately, not faked with a no-op command.

## 11. Critical invariants for Chunk 01+

1. `Shop` remains the tenant boundary.
2. Existing JWT/RBAC/trial/tenant guards remain authoritative.
3. Guest checkout is not SaaS subscription billing.
4. `GuestCheck` remains a visit container unless an explicit migration changes that contract.
5. Existing finance behavior must remain unchanged with new feature flags disabled.
6. No authoritative money calculations move into client-only code.
7. New migrations are expand-first and production-forward-safe.
8. CI must stay green before a dependent chunk starts.

## 12. Known baseline risks / debt

- Root had no aggregate `test` command before Chunk 00.
- API `lint` previously used `--fix`, so a validation command could mutate source; Chunk 00 splits validation from `lint:fix`.
- CI previously typechecked the web but did not build it, and did not run the API Jest suite.
- Both pnpm and npm lockfiles exist at repository root; pnpm remains canonical.
- The schema contains mature SaaS payment abstractions that could be confused with the future guest payment domain. Preserve the bounded-context separation.

These are baseline observations, not permission for unrelated cleanup in later chunks.
