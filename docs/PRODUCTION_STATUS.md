# Production status (operator summary)

**As of:** 2026-07-22 (month-end credit pause — [`audit/MONTH_END_HANDOFF.md`](./audit/MONTH_END_HANDOFF.md)).

## Live blocker — API suspended

Probe of `https://gospots-api.onrender.com` returns **503** with header:

```text
x-render-routing: suspend-by-user
```

The Render web service was **suspended by the account owner** (not a cold start, not a Nest boot crash). Until it is resumed, `/live`, `/ready`, login, book, and Vercel `/api/v1` proxy all fail.

### Resume (operator — required)

1. Open [dashboard.render.com](https://dashboard.render.com) → service **`gospots-api`**
2. Click **Resume** / **Unsuspend** (wording varies)
3. Wait for deploy healthy (free tier cold start can take ~1 min)
4. Confirm:
   - `GET https://gospots-api.onrender.com/api/v1/live` → **200**
   - `GET https://gospots-api.onrender.com/api/v1/ready` → **200**, `database: up`
5. Confirm Vercel `API_PROXY_TARGET=https://gospots-api.onrender.com` (no trailing slash), then retest `https://www.gospots.eu/api/v1/ready`

After resume, complete the smoke checklist below.

## §37 acceptance gates (honest)

| Gate | State |
|------|-------|
| Agent board | **DONE** — no in-progress lanes |
| Code + §14 split | **DONE** (ship bar) |
| Neon migrate | **DONE** (18 folders applied) |
| Host env + domains | **DONE** |
| Safety flags | **OFF** (`TENANT_RLS`, `LEDGER_DUAL_WRITE`, `LEDGER_READS`) |
| Render API | **SUSPENDED** — blocks smoke |
| Manual smoke | **BLOCKED** |
| Flag soak | **NOT STARTED** (after smoke) |

**Not fully DONE** until: **Resume Render → smoke pass → RLS/ledger soaks**. Detail: [`ORIGINAL_AUDIT_BIBLE.md`](./audit/ORIGINAL_AUDIT_BIBLE.md) §37.

## Where we are

- **Bible:** remade against original §§1–40 — [`docs/audit/ORIGINAL_AUDIT_BIBLE.md`](./audit/ORIGINAL_AUDIT_BIBLE.md). **Not fully complete** vs full prompt; legacy 1–35 ship bars are strong.
- **Neon migrate: applied** (18 folders through `20260721120000_*`). Verify: `pnpm --filter @gospots/api run verify:migrations`
- **Host env: set** on Render + Vercel (CORS / cookies / CSRF / JWT / Lemon / Resend)
- **Custom domains:** `www.gospots.eu` / `www.gospots.pl` on Vercel (apex → www 308)
- **render.yaml:** `CSRF_PROTECTION=true`, `CORS_ORIGINS` sync:false, cookies Secure/lax, `MAIL_FROM_NAME=Locora`, `healthCheckPath: /api/v1/ready`

## Flags (keep until soak)

| Flag | Prod default | When to flip |
|------|--------------|--------------|
| `TENANT_RLS` | off / unset | After migrate + smoke — Gates 0–4 [`GO_SPOTS_RLS.md`](./audit/GO_SPOTS_RLS.md) |
| `LEDGER_DUAL_WRITE` | off | After ledger migrate + soak — [`GO_SPOTS_LEDGER.md`](./audit/GO_SPOTS_LEDGER.md) Gates 0–3 |
| `LEDGER_READS` | off | After dual-write soak + `backfill:ledger --apply` — Gate 6 |
| `LEGACY_UPLOADS_STATIC` | true | Only when `inventory:legacy-uploads` = 0 |
| `IDEMPOTENCY_REQUIRE_MONEY_KEYS` | true in prod example | Keep if clients send keys |
| `CAPTCHA_PROVIDER` | off | When site+secret keys set |

## Residual phases (not ship blockers)

| Bible # | Residual |
|---------|----------|
| #10 | GuestCheck Phase 3a settle-gate **shipped** (`POST /guest-checks/:id/settle` OPEN→SETTLED once children closed; no second ledger/revenue post); Phase 3b Option B/C settle-as-revenue-root still residual |
| #11 | Service split **shipped** (§14 ship bar): finance all domain services + thin `FinanceService` facade; auth session/refresh/logout/password/venue/MFA extracted; reservations public/schedule/staff + facade shell. **By design:** login/register/activate/me on `AuthService`; reminders cron may remain outside facade |
| #14 | Resource/dining UI cutover + DROP |
| #3 | Tenant RLS Phase 1–2 **shipped** (28 Tier A FORCE + `SET LOCAL` plumbing; **`TENANT_RLS` default off**); operator Gates 0–4 [`GO_SPOTS_RLS.md`](./audit/GO_SPOTS_RLS.md) |
| #6 | Ledger Phase 1–4 **shipped** (dual-write + `backfill:ledger` CLI + `LEDGER_READS` analytics read, default off); Phase 5 freeze + operator Gates 0–7 [`GO_SPOTS_LEDGER.md`](./audit/GO_SPOTS_LEDGER.md) |
| — | Staff MFA/WebAuthn, Redis SSE, OTel, signed media, marketplace live cohort |

## Manual smoke checklist

Run **after** API resume:

- [ ] **Health** — `/api/v1/live` OK; `/api/v1/ready` → `database: up` (direct Render + via `www.gospots.eu/api/v1/ready`)
- [ ] **CORS** — credentialed call from `https://www.gospots.eu` allowed
- [ ] **Login + CSRF** — cookie session + `X-CSRF-Token`; slug-only dashboard URL
- [ ] **Book** — public book; same slot does not double-book
- [ ] **Guest link** — hash status URL works
- [ ] **Stock + sale** — menu SALE and stock consistent
- [ ] **Webhook** — duplicate Lemon delivery no-ops

Optional after guest smoke: `pnpm run clear:guest-plaintext` (dry-run, then `--apply`).

## Known limitations

- Tenant RLS / ledger dual-write default **off**
- Guest token dual-read plaintext window
- Media opaque `GET /media/:id` (not signed)
- Neon PITR **6 hours** (Free); restore drill not yet run
- Mail outbox retries unproven in prod
- Campus DNS suffix (`.sggw.pl`) can break cert checks without VPN — public DNS is fine

## Docs map (post-cleanup)

| Keep | Role |
|------|------|
| This file | Operator single page |
| [`WHAT_TO_DO_NOW.md`](./audit/WHAT_TO_DO_NOW.md) | Ordered operator steps |
| [`DEPLOY_CHECKLIST.md`](./audit/DEPLOY_CHECKLIST.md) | Deploy + smoke detail |
| [`BIBLE_STATUS.md`](./audit/BIBLE_STATUS.md) | Per-item matrix |
| [`BIBLE_FINISHED.md`](./audit/BIBLE_FINISHED.md) | Finished log |
| [`AGENT_COORDINATION.md`](./audit/AGENT_COORDINATION.md) | Lane locks |
| [`GO_SPOTS_RLS.md`](./audit/GO_SPOTS_RLS.md) | §6 tenant RLS operator soak Gates 0–4 |
| [`GO_SPOTS_LEDGER.md`](./audit/GO_SPOTS_LEDGER.md) | §5 ledger operator soak Gates 0–7 |
| [`DISASTER_RECOVERY.md`](./operations/DISASTER_RECOVERY.md) | DR / PITR |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Host setup |

Obsolete Phase-1 audit snapshots (`GO_SPOTS_DEEP_AUDIT`, `FIX_PLAN`, `FOUR_DAY_SHIP_PLAN`, `OVERNIGHT_STATUS`, `REMAINING_P0_FRIDAY`, etc.) were **removed** in the prod-ready cleanup pass; use this file + bible status instead.
