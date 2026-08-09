# GoSpots Current Architecture Baseline

**Chunk:** 00 — Repository Safety, Baseline and Regression Harness  
**Captured:** 2026-08-09  
**Baseline branch:** `main`  
**Baseline commit:** `fe8082c0b5c3c4f45b5a3cd71e0eacb94511d9ff`  
**Purpose:** Record the system that future chunks must preserve while new checkout, settlement, payment, fiscal and offline domains are introduced.

> This document describes the code and infrastructure as found. It is not a target architecture document.

## 1. Repository and runtime

GoSpots is a pnpm monorepo.

```text
GoSpots/
├── apps/
│   ├── api/   NestJS + Prisma API
│   └── web/   Next.js application
├── docs/
├── scripts/
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

Repository-level assumptions currently encoded in `package.json`:

- pnpm 10.12.1;
- Node.js 24.x;
- root `build` builds API and web sequentially;
- root `lint` lints API and web sequentially;
- Chunk 00 adds root `test` as the API Jest suite because the web package does not currently define a test runner.

## 2. API composition

`apps/api/src/app.module.ts` is the composition root. The currently registered domain/infrastructure modules are:

- Prisma;
- Mail;
- Media;
- Audit;
- Shop;
- Onboarding;
- Public;
- Guest;
- Auth;
- Staff;
- Dashboard;
- Menu;
- Resources;
- Reservations;
- Finance;
- Billing;
- Notifications;
- Hours;
- Gallery;
- Notes;
- GDPR;
- GuestCheck;
- StaffApprovals;
- Health;
- Metrics.

This list is the baseline ownership map. New Chunk 01+ modules should not duplicate responsibilities already owned here without an explicit migration plan.

## 3. Cross-cutting request security and tenancy

The API currently installs global guards/interceptors rather than relying only on controller-local checks.

### Global guards

In order of registration:

1. `CaptchaAwareThrottlerGuard`
2. `CsrfGuard`
3. `JwtAuthGuard`
4. `RolesGuard`
5. `TrialAccessGuard`

### Global interceptors

1. `RequestLoggingInterceptor`
2. `VenueContextInterceptor`
3. `TenantRlsInterceptor`

Implications for future work:

- authentication and authorization are already cross-cutting concerns;
- tenant/venue context is already propagated centrally;
- new checkout/payment endpoints must still perform domain-specific shop ownership checks and must not assume an ID is safe merely because the request passed global auth;
- future correlation-ID work belongs in this cross-cutting layer rather than being implemented separately in every module.

## 4. Web route structure

The Next.js App Router currently separates major surfaces through route groups and public routes.

Top-level route groups/areas include:

```text
apps/web/src/app/
├── (auth)/
├── (system-admin)/
├── (tenant)/
├── api/
├── for-venues/
├── venue/
├── venues/
├── privacy/
├── terms/
├── layout.tsx
├── page.tsx
├── robots.ts
└── sitemap.ts
```

The `(tenant)` route group is the operator/venue application boundary. Public discovery remains outside that group. Future operator features should preserve that separation instead of building parallel tenant shells.

## 5. Current financial/visit model

### GuestCheck

`GuestCheck` is already the visit/tab container. It is not yet the final settlement/payment aggregate planned by later chunks.

Current behavior to preserve:

- a check can be opened from operational source context;
- source-derived GuestCheck items are guarded against duplicate insertion;
- manual charges are represented as decimal money values;
- open-state validation prevents invalid edits/settlement;
- settlement currently calculates the check total, writes ledger behavior, changes the check state, and updates source payment behavior.

### Current money path

The API already has shared money helpers and GuestCheck running-total logic.

Important current behavior:

- commercial Prisma amounts use decimal database fields;
- API wire money is serialized as fixed-scale decimal strings;
- the GuestCheck running total deliberately avoids double counting linked play sessions whose amount is billed through a reservation;
- canceled orders/play sessions are excluded from the running total;
- `ShopOrder.reservationFee` is treated as already embedded in the order total.

The existing money helper still contains number-based calculation helpers in places. That is baseline technical debt for Chunk 01; Chunk 00 does not rewrite it.

### Existing idempotency/reliability primitives

The Prisma schema already contains reliability concepts including `BillingOperation` and `IdempotencyReceipt`, with shop-scoped uniqueness. Chunk 01 must inspect and consolidate these before adding any generic idempotency framework. Do not create a second competing idempotency system by default.

## 6. Operational source domains

The present billing/visit graph spans several existing domains.

### Reservations

Reservations carry their own booking/resource/pricing/payment-related state and can participate in GuestCheck totals.

### Play sessions

Play sessions carry timing/resource/billing fields and may be linked to reservations. A linked play session is excluded from GuestCheck running total when the reservation is the billing source, preventing duplicate revenue.

### Shop orders

Shop orders carry order totals and payment/status information and can attach to a GuestCheck. Canceled orders do not contribute to the current running total.

### GuestCheck

GuestCheck aggregates the visit operationally, but source domains still own significant billing/payment state. Chunk 02 is therefore an additive settlement migration, not a destructive replacement of these fields.

## 7. Finance and ledger boundary

Current finance behavior predates the planned settlement/payment domains. The existing GuestCheck settlement path writes financial/ledger behavior while source modules still retain payment-related fields.

Rules for future chunks:

- the current finance report is a regression target;
- no new settlement/payment implementation may create duplicate revenue alongside legacy source/ledger writes;
- any read-path switch must be staged and reconciled against current finance output;
- existing historical financial data must remain readable after new models are added.

## 8. Authorization and entitlements

The repository already has:

- JWT authentication;
- global role authorization;
- relational RBAC/permission structures in Prisma;
- trial/subscription access enforcement in the request pipeline;
- staff approval concepts for privileged staff actions.

Later feature-flag work must integrate with this system rather than scatter tier/add-on conditions through UI components.

## 9. Test and lint baseline

The API already had a Jest suite before Chunk 00, but the root package had no aggregate `test` command and GitHub Actions did not execute the Jest suite.

The first Chunk 00 CI execution discovered eight pre-existing Jest suites plus the new GuestCheck regression suite. At that point:

- 8 suites passed;
- 1 existing billing-catalog suite failed because its EUR FX-call expectation no longer matched the current service behavior;
- the new GuestCheck mixed-total regression suite passed;
- 37 individual tests passed and 1 existing test failed.

Chunk 00 fixes the stale billing-catalog expectation to match the current intentional EUR short-circuit and adds the root `pnpm test` command.

### Lint debt

A full API ESLint diagnostic on the captured baseline exposed approximately 800 pre-existing errors, dominated by formatting plus a smaller set of type-aware lint findings. Fixing hundreds of unrelated files inside Chunk 00 would violate the chunk isolation rule and make the safety PR unsafe to review.

Therefore Chunk 00 adopts a ratchet:

- changed API TypeScript files are lint-gated in CI;
- existing full-repository lint debt remains documented rather than hidden;
- spec files are connected to the existing `tsconfig.spec.json` so changed tests can be type-aware linted;
- a dedicated cleanup effort can reduce the inherited debt without mixing that rewrite into settlement/payment architecture.

The existing root `pnpm lint` command remains available as the full diagnostic and is expected to expose inherited debt until that cleanup is completed.

## 10. CI baseline

`.github/workflows/ci.yml` uses GitHub Actions and an ephemeral PostgreSQL service for migration validation.

The migration job performs:

1. dependency install;
2. Prisma generate;
3. `prisma migrate deploy` against an empty ephemeral database;
4. `prisma migrate status`;
5. `prisma validate`.

Before Chunk 00, CI ran API lint/build and web typecheck but did not execute Jest tests or the web production build.

Chunk 00 changes CI to:

- lint changed API TypeScript as a no-new-debt ratchet;
- run the API Jest suite;
- build the API;
- run the migration dry-run on PostgreSQL 17 to match production Neon;
- typecheck and production-build the web app;
- provide a non-routable CI proxy target required by production `next.config.ts` validation.

## 11. Neon production baseline

Connected Neon project discovered during Chunk 00:

- project: `Gospots`;
- project ID: `mute-butterfly-69488238`;
- PostgreSQL: 17;
- primary/default branch: `production`;
- production branch ID: `br-lucky-wave-aln8lhk8`;
- region: AWS `eu-central-1`;
- Vercel-created preview database branches exist for feature/preview work.

Read-only inspection of `production._prisma_migrations` showed the latest applied migration at capture time as:

```text
20260809044000_organization_trial_policy
```

with no rollback marker on the inspected recent migrations.

### Important safety finding

The Neon `production` branch was reported as **not protected** at capture time. Therefore our process must not depend on branch protection to prevent accidental production DDL. The migration policy in this chunk requires preview/branch validation, SQL review and an explicit production application step.

No production database writes were made while capturing this baseline.

## 12. Vercel / deployment observations

Neon contains multiple branches whose creation source is `vercel`, confirming a Vercel preview-database workflow is active.

The repository CI validates code and migrations independently of Vercel preview deployment.

No Render-specific manifest was found by repository code search during this baseline capture. Therefore API hosting details must not be inferred from source files that do not exist; runtime/provider configuration should be treated as external deployment configuration until verified through its provider surface.

## 13. Migration inventory

Production migration history currently includes, among recent entries:

```text
20260809044000_organization_trial_policy
20260803180000_dual_provider_billing
20260726020000_auth_session_remember_idle
20260726010000_staff_action_request
20260721120000_seating_source_dining_table_group
20260721110000_guest_check
20260721100000_ledger_entry
20260721090000_drop_membership_permissions_subscription_addons_csv
```

The coexistence of GuestCheck, ledger, auth/session and billing migrations is why future financial changes must use additive migrations and explicit reconciliation rather than a schema rewrite.

## 14. Baseline invariants future chunks must preserve

1. `main` remains deployable.
2. Tenant/shop isolation must hold for every new model and endpoint.
3. Existing owner/staff authentication remains functional.
4. Public venue list/detail remains functional.
5. Resource, reservation, play-session and order workflows remain functional.
6. GuestCheck running totals do not double count linked reservation/play charges.
7. Finance/ledger output does not gain duplicate revenue.
8. Subscription/trial/RBAC enforcement remains intact.
9. Historical Prisma data remains readable.
10. New financial architecture ships additively behind controlled rollout rather than by deleting legacy paths first.

## 15. Known baseline gaps to carry forward

These are documented, not silently fixed in Chunk 00:

- automated test coverage is still thin relative to the product surface;
- no web test runner is currently configured;
- full API lint has substantial inherited debt, while CI now prevents new debt in changed API TypeScript;
- current money utilities contain some number-based calculation helpers that need a stronger canonical convention in Chunk 01;
- existing idempotency primitives must be consolidated before adding a new generic mechanism;
- production Neon branch protection is not enabled;
- API hosting/provider configuration is not fully represented in the repository.

The purpose of recording these gaps is to stop later chunks from mistaking them for newly introduced regressions.
