# Production status (operator summary)

**As of:** 2026-08-14

## Current production state

- Render service: `GoSpots` (`srv-d87i0m67r5hc73fl1fpg`), active and live.
- Render deployment: `dep-d9vec65bedkc7383540g`, live.
- Vercel production deployment: `dpl_4MkF8PvS6fDnHC4mHEub51zFnB7w`, `READY`.
- Deployed main: `08558f1db815a781b7deda9c92d07e4650b6975f`.
- Neon production branch: `br-lucky-wave-aln8lhk8`.
- API `/live` and `/ready`: HTTP 200 through Render and `www.gospots.eu`; database reports `up`.
- Latest migration: `20260814150000_phase2_venue_setup_v2`, applied without rollback at `2026-08-14T09:57:49.786Z`.
- Immediate Vercel runtime-error query after Gate P2: no error clusters.
- Render startup review: build successful, migration command completed, Nest application started, service live.

## Verified platform-kernel smoke

- pre-session login without CSRF rejected;
- authenticated login, venue binding and `/auth/me` passed;
- settings read/save passed and stale save returned `VERSION_CONFLICT`;
- immutable audit read/delete contract passed;
- specialized KITCHEN role and canonical permission template passed;
- production constraints are validated, all 2,281 Reservation rows were preserved, and invalid-version/orphan counts are zero.

## Verified Phase 2 venue smoke

- fresh venue `p2-acceptance-1786701742662-debea4` was created through authenticated production APIs without database edits;
- profile settings saved with optimistic version 2, `Europe/Warsaw` timezone and 04:00 business-day rollover;
- the mixed-activity template created 3 categories, 3 zones, 6 stable-code resources and 3 active rate plans;
- same-key template replay returned the original result without duplicate resources or rates;
- one resource session started and finished with a canonical immutable rate snapshot;
- server onboarding readiness returned all 12 steps and `operational=true`;
- all Phase 2 database checks/indexes are present, and cross-tenant-link plus invalid-invariant counts are zero;
- the mandatory currency preview/confirmation guard rejected an unsafe direct currency change with the expected HTTP 400;
- Render recorded no unexpected error after the successful drill; Vercel recorded no runtime-error cluster.

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
- [x] **Owner / Phase 2** — register, create venue, settings, template, floor/resources/rates, session start/finish and readiness
- [ ] **Owner / later phases** — staff lifecycle, reservations, orders and settlement production drills
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
