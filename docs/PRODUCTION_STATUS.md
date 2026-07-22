# Production status (operator summary)

**As of:** 2026-07-22

## Live blocker — API suspended

Probe of `https://gospots-api.onrender.com` returns **503** with header:

```text
x-render-routing: suspend-by-user
```

The Render web service was **suspended by the account owner**. Until it is resumed, `/live`, `/ready`, login, book, and Vercel `/api/v1` proxy all fail.

### Resume (operator — required)

1. Open [dashboard.render.com](https://dashboard.render.com) → service **`gospots-api`**
2. Click **Resume** / **Unsuspend**
3. Wait for deploy healthy (free tier cold start can take ~1 min)
4. Confirm:
   - `GET https://gospots-api.onrender.com/api/v1/live` → **200**
   - `GET https://gospots-api.onrender.com/api/v1/ready` → **200**, `database: up`
5. Confirm Vercel `API_PROXY_TARGET=https://gospots-api.onrender.com` (no trailing slash), then retest `https://www.gospots.eu/api/v1/ready`

## Where we are

- **Neon migrate:** applied (through `20260721120000_*`)
- **Host env:** set on Render + Vercel (CORS / cookies / CSRF / JWT / Lemon / Resend)
- **Custom domains:** `www.gospots.eu` / `www.gospots.pl` on Vercel
- **render.yaml:** `CSRF_PROTECTION=true`, cookies Secure/lax, `healthCheckPath: /api/v1/ready`

## Flags (keep off until smoke)

| Flag | Prod default |
|------|--------------|
| `TENANT_RLS` | off / unset |
| `LEDGER_DUAL_WRITE` | off |
| `LEDGER_READS` | off |
| `LEGACY_UPLOADS_STATIC` | true |
| `IDEMPOTENCY_REQUIRE_MONEY_KEYS` | true in prod example |
| `CAPTCHA_PROVIDER` | off |

## Manual smoke checklist

Run **after** API resume:

- [ ] **Health** — `/api/v1/live` OK; `/api/v1/ready` → `database: up` (Render + via `www.gospots.eu`)
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
