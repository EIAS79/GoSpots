# Production status (operator summary)

**As of:** 2026-07-22. One-page snapshot for whoever is watching this ship — full detail stays in `docs/audit/`.

## Where we are

- **Bible: 35/35 DONE.** No more feature waves — see [`docs/audit/BIBLE_PROGRESS.md`](./audit/BIBLE_PROGRESS.md) / [`BIBLE_STATUS.md`](./audit/BIBLE_STATUS.md) for the per-item matrix.
- **Neon migrate: applied.** All 18 pending migration folders (through `20260721120000_seating_source_dining_table_group`) landed via `prisma migrate deploy` — never `reset`. Verify anytime with `pnpm --filter @gospots/api run verify:migrations`.
- **Host env: set.** Render (API) + Vercel (web) environment variables configured per `apps/api/.env.production.example`, including `CORS_ORIGINS`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `CSRF_PROTECTION`, JWT/Lemon/Resend secrets.
- **Custom domains: live.** `www.gospots.eu` and `www.gospots.pl` bound on Vercel for the web app. Confirm both are present in the API's `CORS_ORIGINS` allowlist and that Vercel's API proxy target points at the production Render URL.
- **render.yaml:** hardened for prod — `CSRF_PROTECTION=true`, prefers `CORS_ORIGINS` (`sync: false`, no real values in yaml), `COOKIE_SECURE=true` / `COOKIE_SAME_SITE=lax`, `MAIL_FROM_NAME=Locora`, `healthCheckPath: /api/v1/ready`. No secrets committed — all real values are `sync: false` (set in the Render dashboard) or `generateValue: true`.

## Residual phases (intentionally not started)

These are accepted post-ship residuals — **do not start** them as part of this polish pass:

| Bible # | Residual | Status |
|---|---|---|
| #10 | GuestCheck Phase 3 (single-settle) | Phase 0–2 shipped; settle later |
| #11 | Deeper service splits (finance/auth/reservations, Phases 2–9) | Phase 0–1 extract shipped; monoliths remain |
| #14 | Resource/dining UI cutover + DROP legacy columns (Phases 3–4) | Dual-write shipped and on by default |
| #6 | Ledger reads / backfill (Phase 3–5), `LEDGER_READS` | Dual-write on disk, flag default off |

Other deferred items (staff MFA/WebAuthn, Redis multi-instance SSE, OTel, signed media URLs, marketplace live cohort) are scale/product work for later — see [`WHAT_TO_DO_NOW.md`](./audit/WHAT_TO_DO_NOW.md) §3.

## Manual smoke checklist (run after any redeploy)

From [`docs/audit/DEPLOY_CHECKLIST.md`](./audit/DEPLOY_CHECKLIST.md) §3 / [`WHAT_TO_DO_NOW.md`](./audit/WHAT_TO_DO_NOW.md) §2:

- [ ] **Health** — `GET /api/v1/live` OK; `GET /api/v1/ready` → `database: up`
- [ ] **CORS** — credentialed call from `www.gospots.eu`/`.pl` allowed; foreign origin not reflected
- [ ] **Login + CSRF** — cookie session + `X-CSRF-Token` mutation succeeds; slug-only dashboard URL (no `slug--key` in address bar)
- [ ] **Book** — public booking succeeds; same slot does not double-book
- [ ] **Guest link** — hash status URL works; legacy plaintext dual-read still OK
- [ ] **Stock + sale** — menu SALE and stock stay consistent
- [ ] **Webhook** — duplicate Lemon delivery no-ops

After guest-token smoke passes: optional `pnpm run clear:guest-plaintext` (dry-run, then `--apply`).

## Known limitations (accepted, not blockers)

- **Tenant RLS** — migration + `SET LOCAL` plumbing shipped; `TENANT_RLS` flag defaults **off**. Flip after a migrate soak period.
- **Ledger dual-write** — `LedgerEntry` shipped; `LEDGER_DUAL_WRITE` flag defaults **off**. Analytics stay on interim channel-sum until enabled + Phase 4 reads land.
- **Guest token dual-read** — new tokens are hash+expiry; legacy plaintext links still resolve until a later cutover clears/drops the plaintext column.
- **Media is opaque, not signed** — `GET /media/:id` is world-readable if the id leaks; no signed URLs yet (accepted for v1).
- **Neon PITR confirmed, restore drill still open** — 6-hour history retention confirmed; a live restore drill has not been run yet (see `docs/operations/DISASTER_RECOVERY.md`).
- **Mail outbox retries unproven in prod** — durable table + minute processor shipped; confirm actual retry behavior after a real failure.

## Cleanup candidates (do not delete yet — for later pass)

These `docs/audit/*.md` files are early-phase (2026-07-20) planning/snapshot docs whose content has been superseded by `BIBLE_STATUS.md` / `BIBLE_FINISHED.md` / `BIBLE_PROGRESS.md` / this file. Safe to archive or delete in a dedicated cleanup pass — **not removed here**:

- `docs/audit/GO_SPOTS_DEEP_AUDIT.md` — initial Phase 1 read-only audit, fully superseded by shipped bible items
- `docs/audit/GO_SPOTS_FIX_PLAN.md` — Phase 1 planning-only fix order, superseded by completed lanes
- `docs/audit/GO_SPOTS_MONEY_DECISION.md` — money-type decision doc; decision already implemented (#1 DONE)
- `docs/audit/GO_SPOTS_MIGRATION_PLAN.md` — early migration plan; superseded by actual migrations + `MIGRATION_PREFLIGHT.md`
- `docs/audit/GO_SPOTS_EXCLUSION_CONSTRAINT.md` — superseded, #4 DONE, content duplicated in bible docs
- `docs/audit/GO_SPOTS_TEST_MATRIX.md` — stale Phase 1 test-suite snapshot
- `docs/audit/FOUR_DAY_SHIP_PLAN.md` — superseded now that all bible items are DONE and migrate/env are applied
- `docs/audit/OVERNIGHT_STATUS.md` — stale point-in-time snapshot, superseded by `BIBLE_PROGRESS.md` / this file
- `docs/audit/REMAINING_P0_FRIDAY.md` — superseded now that migrate + host env are done (residual is smoke only)

Keep for now: `BIBLE_STATUS.md`, `BIBLE_FINISHED.md`, `BIBLE_PROGRESS.md`, `AGENT_COORDINATION.md`, `DEPLOY_CHECKLIST.md`, `MIGRATION_PREFLIGHT*.md`, `WHAT_TO_DO_NOW.md`, `QUALITY_BAR.md`, `GO_SPOTS_IMPLEMENTATION_REPORT.md`, and the per-feature `GO_SPOTS_*.md` design docs still carrying open residual phases.

## Related

- [`docs/audit/WHAT_TO_DO_NOW.md`](./audit/WHAT_TO_DO_NOW.md) — operator next steps
- [`docs/audit/DEPLOY_CHECKLIST.md`](./audit/DEPLOY_CHECKLIST.md) — full deploy + smoke detail
- [`docs/operations/DISASTER_RECOVERY.md`](./operations/DISASTER_RECOVERY.md) — PITR / restore drill
- [`docs/audit/BIBLE_PROGRESS.md`](./audit/BIBLE_PROGRESS.md) — 40-point bible index
