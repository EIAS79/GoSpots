# Chunk 00 Completion Report

**Chunk:** 00 — Repository Safety, Baseline and Regression Harness  
**Status:** DONE  
**Date:** 2026-08-09  
**Baseline main SHA:** `fe8082c0b5c3c4f45b5a3cd71e0eacb94511d9ff`  
**Branch:** `feat/gospots-00-foundation`  
**PR:** #9 — `Chunk 00: establish repository safety baseline`

## 1. Objective

Establish a trustworthy regression and migration baseline before any Chunk 01 cross-cutting foundation or Chunk 02 settlement work changes the money architecture.

No checkout, settlement, payment, fiscal or offline production domain was introduced in this chunk.

## 2. Delivered

### Architecture baseline

Created:

```text
docs/engineering/current-architecture.md
```

Captured:

- monorepo/runtime structure;
- NestJS module composition;
- global auth/RBAC/trial/tenant interceptors and guards;
- Next.js tenant/public route boundaries;
- current GuestCheck/reservation/play-session/order financial relationships;
- existing money/idempotency primitives;
- finance/ledger boundary;
- test/lint baseline;
- CI baseline;
- Neon production branch/migration state;
- invariants future chunks must preserve.

### Critical-flow smoke harness

Created:

```text
docs/testing/smoke-checklist.md
```

Covers:

- owner/staff login;
- tenant isolation;
- public venue list/detail;
- resource CRUD;
- reservations;
- play sessions;
- shop orders;
- GuestCheck/current settlement;
- finance reconciliation;
- audit;
- reviews/chat where enabled;
- entitlements/trial behavior;
- operational health.

### Migration policy

Created:

```text
docs/engineering/migration-policy.md
```

Standard migration sequence:

```text
expand → dual-write → backfill → verify → switch-read → contract
```

The policy includes production SQL review, index/tenant review, preview-branch validation, recovery/forward-fix strategy and extra controls for money-domain migrations.

### Root regression command

Added root:

```bash
pnpm test
```

which aggregates the current API Jest suite.

### GuestCheck regression test

Added:

```text
apps/api/src/common/guest-check-total.util.spec.ts
```

It freezes the current mixed-check anti-double-count behavior, including reservation-linked play sessions and canceled-order exclusion.

### Existing stale test repaired

Updated the existing billing catalog EUR test to match current intentional behavior: EUR billing short-circuits EUR→EUR FX lookup rather than calling the rates provider unnecessarily.

### ESLint test-project repair

Changed Jest spec linting to use the existing `tsconfig.spec.json`, because production `tsconfig.json` intentionally excludes `*.spec.ts`.

### CI hardened

GitHub Actions now verifies:

- changed API TypeScript lint ratchet;
- API Jest tests;
- API production build;
- Prisma migration deploy/status/validate;
- PostgreSQL 17 migration dry-run, matching Neon production major version;
- web typecheck;
- web production build.

The web build receives a non-routable CI-only `API_PROXY_TARGET` because production `next.config.ts` correctly requires an absolute proxy target when `/api/v1` is relative.

## 3. Important baseline findings

### Existing API lint debt

A full diagnostic exposed roughly 800 inherited lint findings, mostly formatting plus a smaller number of type-aware findings.

Chunk 00 deliberately did **not** rewrite hundreds of unrelated backend files. Instead CI now ratchets changed API TypeScript so new work cannot add lint debt. Full-repository lint debt remains documented for separate cleanup.

### Neon production

Read-only inspection confirmed:

```text
Project: Gospots
Project ID: mute-butterfly-69488238
PostgreSQL: 17
Primary branch: production
Branch ID: br-lucky-wave-aln8lhk8
Latest inspected migration: 20260809044000_organization_trial_policy
```

The production branch was reported as not protected. Migration process controls must therefore not rely on branch protection alone.

No production database write or schema change was made during Chunk 00.

### Existing cross-cutting primitives

The schema/code already contains billing/idempotency and RBAC foundations. Chunk 01 must inspect and consolidate these rather than blindly introducing duplicate abstractions.

## 4. Verification evidence

Final GitHub Actions run:

```text
Run: #82
Run ID: 31333042891
Head SHA before this report: ca329b7783c9c66f485c0ceb23d496ca45e44810
Conclusion: SUCCESS
```

Results:

```text
Changed API TypeScript lint: PASS
API tests:                    PASS — 38/38
API build:                    PASS
PostgreSQL 17 migrate deploy: PASS
Prisma migrate status:        PASS
Prisma validate:              PASS
Web typecheck:                PASS
Web production build:         PASS
```

## 5. Acceptance Gate 00

- [x] Existing API builds.
- [x] Existing web builds.
- [x] Existing tests pass.
- [x] Critical-flow smoke checklist written.
- [x] Migration policy written.
- [x] Current production schema handling understood and documented.

**Gate 00: PASS.**

## 6. Scope safety

Chunk 00 made no Prisma schema change and no production data mutation.

It did not start:

- Checkout V2;
- settlement domain;
- payment domain;
- fiscalization;
- offline architecture;
- Chunk 01 feature/idempotency/event changes.

## 7. What Chunk 01 may now assume

Chunk 01 may assume:

1. API/web production builds are exercised in CI.
2. the API Jest suite is executed in CI.
3. changed API TypeScript is lint-ratcheted.
4. Prisma migration history can deploy cleanly against PostgreSQL 17 in CI.
5. current GuestCheck mixed-total behavior has an executable regression test.
6. production migration policy is documented.
7. the current architecture and inherited technical debt are recorded rather than confused with new regressions.

Chunk 01 must still begin with fresh inspection of the latest `main`/branch state and must not duplicate existing `BillingOperation`, `IdempotencyReceipt`, RBAC or audit mechanisms without an explicit consolidation decision.
