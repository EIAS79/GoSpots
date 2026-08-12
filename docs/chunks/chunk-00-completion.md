# Chunk 00 — Repository Safety, Baseline and Regression Harness

## Status

**VERIFYING on PR #36.** Mark **DONE** only when the final PR head has all blocking CI jobs green.

## Plan deliverables

The execution-plan deliverables are present:

- `docs/engineering/current-architecture.md` — repository/runtime/tenant/financial/deployment baseline;
- `docs/testing/smoke-checklist.md` — critical owner/staff/public/resource/reservation/session/order/check/finance/audit/entitlement smoke flows;
- `docs/engineering/migration-policy.md` — expand → compatibility/dual-write → backfill → verify → switch-read → contract;
- root non-destructive `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm verify`, `pnpm verify:strict` commands.

## Completion hardening in PR #36

Chunk 00 is brought forward to the repository's current production architecture instead of relying on its original 2026-08-09 CI assumptions:

- migration CI now runs PostgreSQL **17**, matching the production Neon major version rather than PostgreSQL 16;
- every migration gate runs `prisma generate`, empty-DB `migrate deploy`, `migrate status`, and `prisma validate`;
- changed production API TypeScript receives a blocking semantic lint ratchet;
- repository-wide inherited lint/format debt remains visible as a non-destructive advisory report rather than being hidden by auto-fix;
- API Jest and Nest production build remain blocking;
- web checkout tests, Offline Lite tests, TypeScript check and production build remain blocking;
- web builds use the inert CI-only `https://ci-api.invalid` proxy target rather than contacting the live API;
- Edge Hub test/build remains blocking;
- web i18n contract debt is reported in CI without converting existing unrelated translation debt into a Chunk 00 rewrite.

## Database / migration safety

This completion PR introduces no destructive database migration. The migration policy explicitly requires:

1. tenant/index/unique review;
2. production SQL review;
3. additive/expand-first deployment;
4. restartable/idempotent backfill where required;
5. financial reconciliation before read switches;
6. forward-fix/feature rollback before destructive database rollback;
7. production restore/snapshot planning for high-risk migrations.

## Acceptance Gate 00

- [x] Current architecture baseline exists.
- [x] Critical-flow smoke checklist exists.
- [x] Migration policy exists.
- [x] Root lint/test/build commands exist and are non-destructive.
- [x] Production database major-version handling is reflected by PostgreSQL 17 CI.
- [x] API tests/build are blocking.
- [x] Web tests/typecheck/build are blocking.
- [x] Edge tests/build are blocking.
- [x] Empty-database migration validation is blocking.
- [ ] **Final PR #36 exact-head CI green.**

The final unchecked item must be updated with the exact final SHA/run after the last code or documentation change. Do not call Chunk 00 DONE on an earlier green SHA.

## Rollback / forward-fix

These CI/documentation changes do not alter production business data. If the lint ratchet itself causes an infrastructure regression, adjust the gate in a dedicated forward-fix; do not weaken API tests, builds, or migration validation to obtain a green run.
