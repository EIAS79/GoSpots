# Phase 2 venue rollout and rollback

## Pre-deploy

1. Verify exact-head CI: Prisma validate/generate, clean migration, representative historical upgrade, Phase 2 assertions, API unit/security tests, web build/tests, Edge build/tests and browser E2E.
2. Confirm the production database has no cross-tenant resource/category/zone link and no duplicate proposed venue-local resource code.
3. Confirm both API and web deployments reference the same merged main revision.

## Migration

`20260814150000_phase2_venue_setup_v2` is expand-first. It adds nullable profile/catalog fields, defaulted state/version/rate/device/session fields, backfills deterministic resource codes and legacy rate snapshots, then validates checks and same-shop rate-target foreign keys. Historical display names and financial records are not rewritten.

The deployment runs `prisma migrate deploy` before the new API serves Phase 2 contracts. A failed validation stops deployment; do not mark the migration applied manually.

## Smoke and Gate P2

Check API health and web runtime, then create a fresh venue through the public registration/API workflow. Configure profile, use a venue template, start and finish one test session, and read `/shop/onboarding/readiness`. Require 12 steps, nonzero zone/resource/rate/test counts and `operational=true`. Inspect API/web error logs after the drill.

## Rollback

Application rollback is safe while the expand-only columns remain. Redeploy the prior API/web revision; do not drop columns or enum values during an incident. Resource-code and snapshot backfills are compatible with the prior application. Investigate and forward-fix schema defects on a Neon branch before production. Contract/drop cleanup, if ever approved, belongs to a later explicit migration after all readers have moved.
