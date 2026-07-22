# Friday deploy checklist

**Submit target:** product that won't lose money, double-book, or leak guest links.

**Rule:** `prisma migrate deploy` only — **never reset** the database.

---

## Pre-deploy

- [ ] API typecheck + `nest build` pass locally
- [x] Web `next build` passes locally (exit 0; Node 20 wanted — Node 26 engine warning non-blocking)
- [ ] All **18** migration folders exist on disk (no orphan stubs)
- [ ] Migration pre-flight reviewed ([`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md))
- [ ] Production env vars set (see `apps/api/.env.production.example`)

### Required API env (recent waves)

Copy from `apps/api/.env.production.example`. Wave-specific keys:

| Variable | Required | Notes |
|----------|----------|-------|
| `CORS_ORIGINS` | prod | Comma-separated HTTPS origins (Vercel + custom domain). Merged with `CORS_ORIGIN` / `WEB_ORIGIN` / `WEB_APP_URL`. No localhost; empty = CORS denied |
| `COOKIE_SECURE` | prod | `true` (also auto-on when `NODE_ENV=production` if unset; local HTTP stays off) |
| `COOKIE_SAME_SITE` | prod | `lax` with Vercel `/api/v1` proxy; `none` only for cross-origin API (forces Secure; CSRF required) |
| `CSRF_PROTECTION` | prod | Default on (`true`); set `false` only as emergency kill-switch |

**Cookie flag matrix (set in `auth.controller` / `cookie-options.util`):**

| Cookie | httpOnly | Secure (prod) | SameSite (default) | Path |
|--------|----------|---------------|--------------------|------|
| `access_token` | yes | yes | `lax` | `/` |
| `refresh_token` | yes | yes | `lax` | `/api/v1/auth` |
| `csrf_token` | **no** (JS double-submit) | yes | `lax` | `/` |

**SameSite=None tradeoff:** required only when the browser calls the API cross-site (no Vercel rewrite). Browsers force `Secure`; cookies ride on cross-site requests, so `CSRF_PROTECTION=true` is load-bearing. Prefer proxy + `lax`.
| `LEMON_SQUEEZY_API_KEY` | billing | Checkout + portal |
| `LEMON_SQUEEZY_STORE_ID` | billing | Store ID |
| `LEMON_SQUEEZY_VARIANT_ID` | billing | Subscription variant |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | **prod boot** | Required when `NODE_ENV=production` — API refuses to start if unset. Webhook HMAC; unsigned deliveries never accepted (503 if misconfigured). URL `POST /api/v1/billing/webhooks/lemon-squeezy` |
| `JWT_ACCESS_SECRET` | **prod boot** | Required at boot with `DATABASE_URL` + webhook secret |
| `DATABASE_URL` | **prod boot** | Required at boot |

**Optional (defaults safe):** `THROTTLE_TTL_MS`, `THROTTLE_GLOBAL_LIMIT`, `AUTH_THROTTLE_*`, `PUBLIC_THROTTLE_*` — see `.env.example`. Never set `THROTTLE_DISABLED=true` in production.

**No env keys:** health probes (`/api/v1/live`, `/api/v1/ready`, `/api/v1/health` alias).

**Security headers (helmet, no env):** API applies Helmet in `main.ts` with CSP disabled (JSON/API + uploads, not an HTML shell — CSP belongs on the Next.js app), `Cross-Origin-Resource-Policy: cross-origin` so dashboard/media embeds work, and HSTS only when `NODE_ENV=production`. Smoke after deploy: response includes `X-Content-Type-Options: nosniff` and CORP; login/CSRF cookies and credentialed CORS must still succeed (helmet does not change cookie flags or CORS).

### CI (GitHub Actions — `.github/workflows/ci.yml`)

On push to `main`/`master` and on every PR, CI runs two jobs (fail-fast on error; no eslint `--fix`):

| Job | Commands |
|-----|----------|
| **API** | `pnpm install --frozen-lockfile` → `prisma generate` → eslint (no `--fix`) → `nest`/`pnpm run build` → Jest unit tests |
| **Web** | `pnpm install --frozen-lockfile` → `pnpm run typecheck` (`tsc --noEmit`) |

**Not in CI (yet):**

- **`next build`** — keep running locally / on the host before deploy (env + compile time). Web CI is TypeScript-only to stay reliable and within job time.
- **Web eslint** — not gated yet; the web tree currently fails `pnpm --filter @gospots/web run lint` with a large backlog. Re-enable as a CI step (no `--fix`) once that baseline is green.

---

## 1. Migrations (confirmed order)

**Pre-flight:** [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) — pass/warn per migration (schema match, expand safety, no unsafe DROP). Review before Neon apply.

Run **once** against production:

```bash
pnpm --filter @gospots/api migrate:deploy
```

Prisma applies migrations in timestamp order. Confirmed sequence:

| # | Migration folder | Purpose |
|---|------------------|---------|
| 1 | `20260720210000_billing_webhook_events` | Lemon webhook idempotency receipt table |
| 2 | `20260720220000_shop_timezone` | Shop `timezone` column (IANA, default UTC) |
| 3 | `20260720230000_money_decimal_core` | Float → `DECIMAL(19,4)` on money columns |
| 4 | `20260720240000_membership_permissions_subscription_addons` | Relational permissions + subscription add-ons |
| 5 | `20260720250000_guest_token_hash_expiry` | Guest token hash + expiry + backfill |
| 6 | `20260720260000_auth_session_family` | AuthSession `familyId` + unique `refreshTokenHash` (reuse → family revoke) |
| 7 | `20260721010000_idempotency_receipts` | Client `IdempotencyReceipt` table (finance hot-write keys) |
| 8 | `20260721020000_mail_outbox` | Durable `MailOutbox` table (email retry worker) |
| 9 | `20260721030000_dashboard_key_hash` | `Shop.dashboardKeyHash` + backfill |
| 10 | `20260721040000_currency_stamp_monetary_rows` | Per-row currency stamps on money tables |
| 11 | `20260721050000_tenant_rls_core` | Tier A RLS ENABLE+FORCE + policies |
| 12 | `20260721060000_reservation_resource_exclusion` | GiST EXCLUDE on active reservations (**after** overlaps = 0) |
| 13 | `20260721070000_gdpr_consent_dsar` | Consent / DSAR tables |
| 14 | `20260721080000_user_mfa_totp` | Owner TOTP MFA + recovery codes |
| 15 | `20260721090000_drop_membership_permissions_subscription_addons_csv` | DROP CSV `permissions` / `addOns` (**after** app cutover) |
| 16 | `20260721100000_ledger_entry` | `LedgerEntry` table (+ RLS policy) |
| 17 | `20260721110000_guest_check` | `GuestCheck` ops container + child FKs (#10) |
| 18 | `20260721120000_seating_source_dining_table_group` | `SeatingTableGroup.sourceDiningTableGroupId` (#14) |

**Do not** run `prisma migrate reset`, `db push`, or manual SQL out of band unless explicitly recovering from a failed deploy with a written rollback plan.

---

## 2. Build & deploy apps

After migrations succeed:

```bash
pnpm --filter @gospots/api run build
pnpm --filter @gospots/web run build
```

Deploy API and web artifacts per your hosting flow (Vercel / container / etc.).

**Node (Render + Vercel):** use **24.x** (root `engines.node` is `24.x`; Vercel deprecates 20.x after 2026-10-01).

**Render / host:** set the API health-check path to **GET `/api/v1/ready`** (DB probe). Do not use `/live` or `/health` alone — they skip the database.

---

## 3. Smoke tests (production or staging mirror)

Run manually after deploy. Check off each path.

| # | Area | Steps | Pass |
|---|------|-------|------|
| 0 | **Health probes** | `GET /api/v1/live` → 200 `status: ok`; `GET /api/v1/ready` → 200 with `database: up` (host healthCheckPath: `/api/v1/health` or `/api/v1/live`) | [ ] |
| 1 | **Login + CSRF** | See detailed steps below | [ ] |
| 1b | **CORS** | From the web origin only: credentialed `GET /api/v1/auth/csrf` succeeds (`Access-Control-Allow-Origin` echoes that origin, not `*`). From a foreign origin (or curl with a fake `Origin`), no ACAO reflection / no credentials CORS | [ ] |
| 2 | **Book** | Create a guest booking on a resource; confirm confirmation / no double-book for same slot | [ ] |
| 3 | **Guest status link** | Open booking status URL from email or API response; page loads; new hash tokens work; legacy plaintext links still resolve (dual-read window) | [ ] |
| 4 | **Stock + sale** | Record a menu sale that decrements stock; confirm stock and SALE row stay consistent (no orphan SALE) | [ ] |
| 5 | **Duplicate webhook no-op** | Replay the same Lemon webhook payload (or trigger duplicate delivery); subscription/state must not double-apply | [ ] |

### Post-verify window — clear leftover guest plaintext (bible #17)

After guest-token hash migration is applied and smoke #3 passes (hash links work; dual-read still OK), operators may clear **leftover plaintext** on rows that already have `guestTokenHash`. Safe by design: never touches plaintext-only rows; no column DROP.

```bash
# From apps/api — dry-run by default (count only)
pnpm run clear:guest-plaintext -- --dry-run

# Apply only after dry-run looks right (nulls guestToken where hash exists)
pnpm run clear:guest-plaintext -- --apply
```

Do **not** drop the `guestToken` column until a later cutover (counts = 0 leftover with hash + verification window closed).

### Login + CSRF (detail)

Prereq: web uses same-origin `/api/v1` proxy (`NEXT_PUBLIC_API_BASE_URL=/api/v1` + `API_PROXY_TARGET`); API has `COOKIE_SAME_SITE=lax`, `COOKIE_SECURE=true`, `CSRF_PROTECTION=true`.

1. Open DevTools → Application → Cookies (site origin). Clear `access_token`, `refresh_token`, `csrf_token` if present.
2. Soft-reload `/login`. Confirm a `GET /api/v1/auth/csrf` runs and `csrf_token` cookie appears (not HttpOnly).
3. Sign in (owner or staff). Confirm `Set-Cookie` for `access_token` + `refresh_token` + rotated `csrf_token`.
4. Land on `/dashboard/{slug}/…` (slug only in the address bar — no `slug--key`).
5. In Application → Session Storage, confirm `Locora.venuePath` holds secret `slug--key` (used as `x-venue-path`).
6. Mutating check: save shop settings or rename a resource — Network must send `x-csrf-token` matching the cookie; response **not** `403 CSRF token missing or invalid`.
7. Hard-refresh the dashboard — session survives; one more mutation still succeeds (refresh path uses CSRF).
8. Sign out — cookies cleared; `/dashboard` redirects to login.

**Fail signals:** `403` with CSRF message on login/refresh/mutation; dashboard stuck loading after login; URL still showing `slug--key` after gate; API calls missing `x-venue-path` while on a venue page.

---

## 4. Known limitations (document for submit)

These are **accepted** for Friday — not deploy blockers:

- **Ledger dual-write (#6 DONE Phase 1–2)** — `LedgerEntry` + migrate `20260721100000_*` on disk; `LEDGER_DUAL_WRITE` default off. Analytics still interim channel-sum. **OPERATOR:** Neon migrate; soak then enable dual-write. Phase 4 reads / backfill residual.
- **Owner 2FA shipped (code)** — TOTP enroll/login challenge + recovery codes ([`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md)); **OPERATOR** must Neon-deploy `20260721080000_user_mfa_totp`. Staff MFA / WebAuthn deferred.
- **Guest plaintext dual-read** — legacy plaintext tokens still resolve; new issues are hash + expiry only. After smoke #3, use `pnpm run clear:guest-plaintext` (dry-run then `--apply`) to wipe leftover plaintext where hash exists — see post-verify tool under smoke #3.
- **CSV permissions cutover (#13 DONE)** — rows SoT; DROP migration `20260721090000_*` on disk. **OPERATOR:** Neon deploy after app that never SELECTs `Membership.permissions` / `Subscription.addOns`. `pendingAddOns` stays CSV.
- **Exclusion DDL on disk** — app booking locks in place; Neon-apply `20260721060000_*` only after `pnpm detect:reservation-overlaps` = 0.
- **Staff double-enter (order + quick)** — same menu sale can still be recorded on both `ShopOrder` and quick `SALE`; no auto-dedupe.
- **Media GET public by design** — `GET /media/:id` stays world-readable if the opaque id leaks (no signed URLs).
- **Money API = rounded JS numbers** — DB is `Decimal(19,4)`; payloads use `serializeMoney` (IEEE float ops UI, not a cash ledger); string wire design only.
- **Neon migrate pending** — **18** pending migrations (`20260720210000_*` … `20260721120000_seating_source_dining_table_group`, including GuestCheck + seating source FK) not applied until Friday operator `migrate deploy` (never reset).
- **GuestCheck (#10 DONE Phase 0–2)** — migration `20260721110000_*` on disk; Phase 3 settle residual. **OPERATOR:** include in same Neon deploy pass.
- **Resource/dining merge (#14 DONE Phase 0–2)** — migration `20260721120000_*` on disk; Phases 3–4 residual. **OPERATOR:** include in same Neon deploy pass.
- **GDPR (#25 DONE)** — owner export + erase-guest(+email) + erase-account; consent records + public checkboxes; guest DSAR + owner inbox; retention cron (`GDPR_RETENTION_CRON`). Money amounts retained by design. **OPERATOR:** Neon migrate `20260721070000_*`; Lemon/Resend processor purge.
- **Mail outbox unproven in prod** — durable table + minute processor shipped; confirm retries after deploy.
- **Neon PITR live fill-in residual** — bible **#24 DONE** (runbook); fill TBD + restore drill in [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) from Neon console.

---

## 5. Env vars (API) — confirm on host

From `apps/api/.env.production.example` (in addition to JWT / DB / Lemon / Resend):

| Key | Prod expectation |
|-----|------------------|
| `CORS_ORIGINS` | `https://your-production-web-host` (comma-separate previews); set before first smoke |
| `CSRF_PROTECTION` | `true` |
| `THROTTLE_DISABLED` | unset or `false` (**never** `true` in prod) |
| `THROTTLE_TTL_MS` | `60000` |
| `THROTTLE_GLOBAL_LIMIT` | `100` |
| `AUTH_THROTTLE_STRICT_LIMIT` | `5` (register / forgot-password) |
| `AUTH_THROTTLE_LOGIN_LIMIT` | `10` (login / reset / activate / link-venues) |
| `AUTH_THROTTLE_REFRESH_LIMIT` | `30` |
| `AUTH_THROTTLE_CSRF_LIMIT` | `60` (`GET /auth/csrf`) |
| `PUBLIC_THROTTLE_BOOKING_LIMIT` | `5` (dining + gaming reservation create) |
| `PUBLIC_THROTTLE_EVENT_LIMIT` | `5` (event-request create) |
| `PUBLIC_THROTTLE_CONTACT_LIMIT` | `5` |
| `PUBLIC_THROTTLE_REVIEW_LIMIT` | `5` |
| `PUBLIC_THROTTLE_CHAT_OPEN_LIMIT` | `5` (guest chat open) |
| `SENTRY_DSN` | optional — unset = no Sentry; see [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) |
| `MFA_TOTP_ENCRYPTION_KEY` | preferred for owner TOTP secret encryption (64 hex / any string → SHA-256); falls back to `JWT_ACCESS_SECRET` if unset |

Local smoke may set `THROTTLE_DISABLED=true` or raise the `AUTH_THROTTLE_*` / `PUBLIC_THROTTLE_*` limits — see `.env.example`.
CAPTCHA stack is **code-complete** (assert + optional widget + in-memory 429 escalation); keep `CAPTCHA_PROVIDER=off` until keys set — [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) Gates 0–4.

---

## 6. Ready to submit

- [ ] All **18** migrations applied (`migrate deploy` succeeded)
- [ ] API + web builds deployed
- [ ] Smoke checklist above completed (or failures documented with waiver)
- [ ] Known limitations acknowledged
- [ ] Throttle + CSRF env vars set (section 5)

**Freeze features** after this checklist — no half-migrations or untested schema changes post-submit.
