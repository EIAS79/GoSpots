# Phase 1 — Repository Safety and Permanent Browser E2E

Status: implementation PR in progress

## Scope

This record implements Phase 1 of `GoSpots_Program_Completion_Integrity_and_Improvement_Plan.md`:

- permanent Playwright browser E2E harness;
- isolated PostgreSQL 17 E2E database and deterministic owner/staff/venue fixtures;
- Gaming, Restaurant, Mixed and Offline Lite smoke paths;
- stale-version, payment-ambiguity, cash-shift and organization-isolation regressions;
- fake provider payment connector available only when explicitly enabled outside production;
- trace/video/screenshot diagnostics on browser failures;
- representative historical-data migration-upgrade CI;
- high-risk CODEOWNERS map.

## Browser scenarios

| ID | Automated proof |
|---|---|
| E2E-01 | Gaming cashier: operational resource start/pause/resume/move/finish, attached play + drink sources, immutable settlement, split cash/card tender, close, simulated fiscalization. |
| E2E-02 | Restaurant: variant/modifier order, KDS route and state progression, checkout source, split tender, close. |
| E2E-03 | Mixed: play + food + booking source in one GuestCheck, split tender conservation and close. |
| E2E-04 | Offline Lite: cached floor, WAN cut, local start, safe local order, offline refresh, local finish, reconnect, exactly-one replay. |
| E2E-05 | Two-browser stale version rejection with `VERSION_CONFLICT` and no silent overwrite. |
| E2E-06 | Fake provider `UNKNOWN` outcome, idempotent replay, changed-request conflict and reconcile of the same provider payment to `CAPTURED`. |
| E2E-07 | Cash shift: float, cash sale, pay-in, pay-out, cash refund, blind count, deliberate variance approval and close. |
| E2E-08 | Organization explicit access cannot bind or operate a non-granted Shop in the same Organization. |

The browser job also runs `prisma/e2e-assert.ts` against the isolated database so canonical persisted money/ledger/cash/offline outcomes are checked after UI/API journeys complete.

## Migration-upgrade gate

`API migration upgrade (representative prior data)` builds the schema only through `20260809044000_organization_trial_policy`, loads representative historical Shop/Membership/Menu/Resource/Reservation/Transaction rows, restores the current migration chain, migrates forward and then runs `prisma/upgrade-assert.ts`.

The assertion verifies:

- historical Shop, tenant and resource relationships survive;
- historical `12.34 PLN` money is preserved exactly;
- representative rows are not orphaned;
- required current-domain tables exist after the upgrade;
- the full migration chain reports no pending migrations and the Prisma schema validates.

## CI checks intended to be required on `main`

Use these exact GitHub check names in the `main` branch ruleset after this PR lands:

1. `API changed-lint · test · build`
2. `API migrate dry-run (ephemeral Postgres 17)`
3. `API migration upgrade (representative prior data)`
4. `Web checks · offline tests · typecheck · build`
5. `Edge Hub test · build`
6. `Browser E2E smoke`

Repository ruleset requirements:

- require pull request before merge;
- require the checks above;
- require branch to be up to date where practical;
- require conversation resolution;
- block force pushes;
- block branch deletion;
- require CODEOWNER review for protected/high-risk paths if the repository plan supports it.

## Repository-admin gate

The GitHub connector used for this implementation does not have repository-administration access to branch protection/rulesets (GitHub returns `403 Resource not accessible by integration` for the protection endpoint). Therefore code can define and prove the checks, but the repository-level ruleset must be applied by a GitHub repository administrator. Do not mark the Phase 1 `main protected` checkbox complete until the ruleset is visible in GitHub settings.

## Safety

- E2E reset refuses to run unless `GOSPOTS_E2E_DB=true` and the database host/name is E2E-safe.
- E2E browser CI has no production dependency.
- The fake payment connector cannot register when `NODE_ENV=production`.
- Simulated fiscalization already rejects production execution.
- Browser failure diagnostics are retained as CI artifacts for 14 days.
