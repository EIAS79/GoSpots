# What to do now

**Status:** Code ship bars largely met; **§37 acceptance NOT DONE** until **Render resume → manual smoke → flag soaks**. Migrations **applied** on Neon; host env **set** (Render + Vercel); custom domains **www.gospots.eu** / **www.gospots.pl** live. Agent board **clear** (no in-progress lanes). **Render API is suspended** — smoke blocked. Optional later phases can wait. See [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md) and [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) §37.

**Credits pause (2026-07-22):** Agent chaining paused — see [`MONTH_END_HANDOFF.md`](./MONTH_END_HANDOFF.md) for operator resume steps + next-month code residuals.

Full deploy detail: [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) · Preflight: [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) · Operator summary: [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md)

---

## 1. Do first (blocking)

Do these in order before calling the ship done.

### 1. Backup / Neon PITR — **DONE** (retention confirmed; drill still open)

- [x] Confirm Neon **PITR / history retention** on the live project — **6 hours** (Free plan max), recorded in [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md)
- [ ] Run the restore drill and fill in the drill date/outcome in `DISASTER_RECOVERY.md` (still `_never_` / `_TBD_`) — not a ship blocker, do before fully relying on DR in an incident

### 2. Migrate deploy (18 folders — never reset) — **DONE 2026-07-21**

Neon `migrate deploy` applied all 18 (exclusion fixed to `tsrange` on Prisma `timestamp` columns). Verify: disk **58** = applied **58**. See [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md).

**Gates before apply:**

- Exclusion (`20260721060000_*`): `pnpm detect:reservation-overlaps` = **0**
- CSV DROP (`20260721090000_*`): live app must **never** SELECT `Membership.permissions` / `Subscription.addOns`

Run **once** against production (deploy host / controlled window — not a casual workstation):

```bash
pnpm --filter @gospots/api migrate:deploy
```

| # | Folder |
|---|--------|
| 1 | `20260720210000_billing_webhook_events` |
| 2 | `20260720220000_shop_timezone` |
| 3 | `20260720230000_money_decimal_core` |
| 4 | `20260720240000_membership_permissions_subscription_addons` |
| 5 | `20260720250000_guest_token_hash_expiry` |
| 6 | `20260720260000_auth_session_family` |
| 7 | `20260721010000_idempotency_receipts` |
| 8 | `20260721020000_mail_outbox` |
| 9 | `20260721030000_dashboard_key_hash` |
| 10 | `20260721040000_currency_stamp_monetary_rows` |
| 11 | `20260721050000_tenant_rls_core` |
| 12 | `20260721060000_reservation_resource_exclusion` |
| 13 | `20260721070000_gdpr_consent_dsar` |
| 14 | `20260721080000_user_mfa_totp` |
| 15 | `20260721090000_drop_membership_permissions_subscription_addons_csv` |
| 16 | `20260721100000_ledger_entry` |
| 17 | `20260721110000_guest_check` |
| 18 | `20260721120000_seating_source_dining_table_group` |

After deploy (optional): `pnpm run verify:migrations` on the deploy host.

### 3. Host env — **DONE** (operator confirms set on Render + Vercel)

Copied from `apps/api/.env.production.example`. Minimum:

| Key | Prod |
|-----|------|
| `CORS_ORIGINS` | Real HTTPS web origin(s) — set to `https://www.gospots.eu,https://www.gospots.pl` (+ any other bound domain) |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `lax` (prefer Vercel `/api/v1` proxy) |
| `CSRF_PROTECTION` | `true` |
| `THROTTLE_DISABLED` | unset / `false` — **never** `true` |
| Node | **20** LTS on Render + Vercel |

Also required at boot: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `LEMON_SQUEEZY_WEBHOOK_SECRET`. Health-check path → **`/api/v1/ready`**.

**Domains:** custom domains `www.gospots.eu` and `www.gospots.pl` are bound on Vercel for the web app. Confirm both are included in `CORS_ORIGINS` / `WEB_ORIGIN` on the API host, and that Vercel's `API_PROXY_TARGET` points at the live Render API URL.

### 4. Optional flag flips (after migrate + soak)

Defaults are safe off. Flip when ready:

| Flag | When |
|------|------|
| `IDEMPOTENCY_REQUIRE_MONEY_KEYS=true` | After smoke confirms clients send keys (prod example already `true`) |
| `TENANT_RLS=on` | After migrate + smoke — [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) Gates 0–4 |
| `LEDGER_DUAL_WRITE=on` | After ledger migrate + smoke — see [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) Gate 2 |
| `LEDGER_READS=on` | After dual-write soak + `backfill:ledger --apply` — Gate 6 |
| CAPTCHA (`CAPTCHA_PROVIDER` + `NEXT_PUBLIC_CAPTCHA_*`) | When site+secret keys are set — [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) Gates 0–4 |
| `LEGACY_UPLOADS_STATIC=false` | Only when `inventory:legacy-uploads` total = **0** |

---

## 2. Manual smoke

**Blocked 2026-07-22 until Render Resume:** API returns `503` + `x-render-routing: suspend-by-user`.  
Partial probe: `https://gospots.vercel.app` → **200**; direct API `/live` → **503 suspended**. Complete the list after Resume (see [`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md)).

From [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) §3:

- [ ] **Health** — `GET /api/v1/live` OK; `GET /api/v1/ready` → `database: up`
- [ ] **CORS** — credentialed call from web origin allowed; foreign origin not reflected
- [ ] **Login + CSRF** — cookie session + `X-CSRF-Token` mutation succeeds; slug-only dashboard URL
- [ ] **Book** — public book; same slot does not double-book
- [ ] **Guest link** — hash status URL works; legacy plaintext dual-read still OK
- [ ] **Stock + sale** — menu SALE and stock stay consistent
- [ ] **Webhook** — duplicate Lemon delivery no-ops

After guest-token smoke: optional `pnpm run clear:guest-plaintext` (dry-run, then `--apply`).

---

## 3. Phase leftovers (not blocking ship)

| Residual | Note |
|----------|------|
| GuestCheck settle (#10 P3) | Phase 0–2 shipped; single-settle later |
| Resource/dining UI cutover + DROP (#14 Phases 3–4) | Expand dual-write shipped |
| Deeper service splits (#11) | **DONE** (ship bar) — finance/auth/reservations facades; login/register/activate on `AuthService` by design |
| Ledger reads / backfill (#6 Phase 3–5) | Phase 3–4 **shipped**; operator Gates 0–7 [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) |
| Live concurrency C1–C3 (#4/#5) | Util bodies + exclusion **shipped**; operator Gates 0–3 local Docker [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |
| Staff MFA / WebAuthn / org require-MFA | Owner TOTP shipped — phased plan [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md) |
| Redis multi-instance SSE, OTel, signed media, marketplace live cohort | Scale / product later |

Acknowledge known limitations in submit notes ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) §4).

---

## 4. §37 acceptance gates (honest)

| Gate | State |
|------|-------|
| Code + §14 service split | **DONE** (ship bar) — board complete |
| Neon migrate (18 folders) | **DONE** |
| Host env + domains | **DONE** |
| Safety flags (`TENANT_RLS`, `LEDGER_*`) | **OFF** — soak after smoke |
| Render API | **SUSPENDED** — operator must Resume |
| Manual smoke | **BLOCKED** until Resume |
| Flag soak + optional backfill | **NOT STARTED** |
| PITR restore drill | **OPEN** (non-blocker) |

**Ship is not DONE** until Resume + smoke + soaks. Full gate table: [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) §37.

---

## 5. Do not

- **Never** `prisma migrate reset`, `db push`, or reorder migration folders against Neon
- **Never** run `migrate deploy` from a workstation whose `.env` points at prod Neon
- **Never** claim bible / ship **DONE** without Resume + smoke + soaks (code DONE ≠ production accepted)
- **Never** set `THROTTLE_DISABLED=true` in production
