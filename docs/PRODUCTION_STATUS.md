# Production status (operator summary)

**As of:** 2026-08-14

## Current production state

- Render service: `GoSpots` (`srv-d87i0m67r5hc73fl1fpg`), active and live.
- Render deployment: `dep-d9vd103bc2fs73catemg`.
- Vercel production deployment: `dpl_2vBFuVFbxpPpVDbJcTeHuZ2KTzBi`, `READY`.
- Deployed main: `33246c762543712e420def14a583ce9b80403571`.
- Neon production branch: `br-lucky-wave-aln8lhk8`.
- API `/live` and `/ready`: HTTP 200 through Render and `www.gospots.eu`; database reports `up`.
- Latest migration: `20260814130000_phase1_kernel_acceptance_hardening`, applied without rollback.
- Immediate Vercel runtime-error query: no error clusters.
- Render startup review: build successful, migration command completed, Nest application started, service live.

## Verified platform-kernel smoke

- pre-session login without CSRF rejected;
- authenticated login, venue binding and `/auth/me` passed;
- settings read/save passed and stale save returned `VERSION_CONFLICT`;
- immutable audit read/delete contract passed;
- specialized KITCHEN role and canonical permission template passed;
- production constraints are validated, all 2,281 Reservation rows were preserved, and invalid-version/orphan counts are zero.

## Flags (keep off until smoke)

| Flag | Prod default |
|------|--------------|
| `TENANT_RLS` | off / unset |
| `LEDGER_DUAL_WRITE` | off |
| `LEDGER_READS` | off |
| `LEGACY_UPLOADS_STATIC` | true |
| `IDEMPOTENCY_REQUIRE_MONEY_KEYS` | true in prod example |
| `CAPTCHA_PROVIDER` | off |

## Ongoing smoke checklist

Run after future production deployments:

- [x] **Health** — `/api/v1/live` OK; `/api/v1/ready` → `database: up` (Render + via `www.gospots.eu`)
- [ ] **Owner** — login, create venue, dashboard, staff, resources/types, reservations, menu, orders, settings
- [ ] **Guest** — `/venues`, `/venue/[slug]`, book + status link, menu/order
- [ ] **CORS / CSRF** — credentialed session from `https://www.gospots.eu`

## Docs map

| Doc | Role |
|-----|------|
| [`START-HERE.md`](./START-HERE.md) | Quick host / env map |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Host setup |
| [`DATABASE.md`](./DATABASE.md) | Schema / migrations |
| [`operations/DISASTER_RECOVERY.md`](./operations/DISASTER_RECOVERY.md) | DR / PITR |
| [`privacy/DATA_MAP.md`](./privacy/DATA_MAP.md) | Personal data map |
| [`privacy/RETENTION_POLICY.md`](./privacy/RETENTION_POLICY.md) | Retention |
