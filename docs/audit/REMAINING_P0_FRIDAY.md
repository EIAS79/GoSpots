# Remaining for Friday ship

**As of:** 2026-07-21 (post-**#14 DONE** Phase 0–2; reconciled against [`OVERNIGHT_STATUS.md`](./OVERNIGHT_STATUS.md), [`BIBLE_STATUS.md`](./BIBLE_STATUS.md), [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md), [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md))

**Parallel lanes:** Prefer non-hot polish / docs only. Hot files stay serial — claim on [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) before editing. **#10 DONE** / **#14 DONE** (migrations on disk). Schema free. Do not invent conflicting schema lanes without a board claim.

**Verdict:** Audit P0 **code** harden for Friday is **done** (**35** bible items DONE). What is still truly open before submit is almost entirely **operator deploy + smoke**, not more feature waves. Do not invent new P0 coding tracks.

**→ Operator checklist:** [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md)

Ship docs + disk agree: **18** pending migrations on disk (`20260720210000_*` … `20260721120000_seating_source_dining_table_group`). Code for those waves is wired — all **18** are required for Friday `migrate deploy` (never reset), including GuestCheck + resource/dining Phase 2.

---

## Still must do before submit

Short list — gate submit on these, not on bible completeness.

1. **Freeze features** — no new schema/migrations or half-landed waves after this point.
2. **Keep builds green** — API `tsc` / `nest build`; web build (local or host). CI already covers API lint/build/Jest + web typecheck (`.github/workflows/ci.yml`); full `next build` is still a local/deploy gate, not CI.
3. **Neon `migrate deploy`** — apply all **18** pending migrations (**never reset**), `20260720*` through `20260721120000_seating_source_dining_table_group`. Gates: exclusion only after `detect:reservation-overlaps` = 0; CSV DROP only after app never SELECTs those columns. See operator section.
4. **Host env** — at minimum set `CORS_ORIGINS` before prod smoke; confirm CSRF/cookie/throttle prod defaults (`DEPLOY_CHECKLIST.md`, `.env.production.example`):
   - `COOKIE_SECURE=true`
   - `COOKIE_SAME_SITE=lax` (prefer Vercel `/api/v1` proxy)
   - `CSRF_PROTECTION=true`
   - never `THROTTLE_DISABLED=true`
5. **Manual smoke** after deploy — login/CSRF, CORS, book, guest status link, stock+sale, duplicate Lemon webhook (checklist below).
6. **Acknowledge known limitations** in submit notes — ledger dual-write default off; guest dual-read window; media opaque GET; MFA/RLS/exclusion/CSV DROP/ledger Neon residuals (`DEPLOY_CHECKLIST.md` §4).
7. **Optional confirm** — Neon PITR / history retention + restore drill on the live project ([`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md); bible **#24 DONE** for docs). Fill TBD fields before relying on DR.

**Not open as Friday coding P0s** (already marked Done / shipped overnight): webhook idempotency, booking locks, atomic stock+sale (+ order-line txn paths), money `Decimal(19,4)` + serialize, finance channel anti-double-count contract, guest hash/expiry/revoke, CSRF + slug dashboard URLs, tenant `shopId` mutation audit, timezone column + day-key wiring + settings UI, offeringConfig write validation, image upload harden, public booking DTO harden (gaming + dining parity), public event-request create harden, refresh family revoke (code + migration on disk), staff booking DTO party bounds, sessions list/revoke API+UI, GDPR export + guest erase stub, durable mail outbox, currency preview/confirm, public throttle env, Sentry init+filter, connectivity/offline Modes A–C/F.

---

## Nice if time

Only if green and tokens remain — **not** submit blockers.

| Item | Notes |
|------|--------|
| Entitlements cutover polish | Engine + dual-read/write already landed; dropping CSV columns / tightening frontend `plan.ts` CSV-only paths can wait. |
| CI polish | API + web typecheck already in workflow; optional: gate `next build`, web eslint (currently a large backlog — do not block Friday). |
| Health probe host switch | `/live` + `/ready` already implemented; prefer host healthCheckPath → `/api/v1/ready`. |
| Overlap detect on Neon | Run `pnpm detect:reservation-overlaps` read-only; resolve pairs manually if any — **do not** add exclusion DDL until pairs = 0. |
| Clear leftover plaintext guest tokens | After dual-read verification window — `pnpm run clear:guest-plaintext` (dry-run then `--apply`); column DROP later. |
| Neon PITR confirmation + restore drill | **#24 DONE** (runbook); fill [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) TBD + drill from Neon console. |

---

## Explicitly deferred (post-submit)

From fix plan / four-day / overnight / bible — **do not start** before submit:

- Full ledger Phase 3–5 reads/backfill (Phase 1–2 dual-write on disk; flag default off)
- Exclusion Neon apply + **live** concurrency bodies residual (DDL on disk; run after overlaps = 0)
- Staff MFA / WebAuthn (owner TOTP **shipped**; Neon migrate residual)
- GDPR Lemon/Resend processor purge — **#25 DONE** (money amounts kept by design; OPERATOR Neon)
- Resource vs dining model merge (#14 Phase 3–4 — Phase 0–2 DONE)
- Unified guest check Phase 3+ settle (#10 Phase 0–2 DONE; Neon migrate residual)
- Redis / multi-instance SSE fan-out; WebSockets
- OTel / deeper tracing (optional Sentry shipped)
- Full a11y / dashboard i18n sweeps (public + floor chrome partials shipped; axe smoke optional)
- Service split Phases 2–9 (#11 Phase 0+1 shipped; auth/reservations + remaining finance still monolith)
- Pack vs tier optional `tier` DROP; CSV DROP Neon after app cutover (migration on disk)
- Signed / shop-scoped media URLs (public opaque `GET /media/:id` accepted residual)
- Marketplace live cohort / S2 density / guest promo (#35 Phase A city landing + checklist DONE; execution residual)

---

## Operator actions only

Do **not** auto-run `migrate deploy` from a workstation whose `.env` points at Neon. Preflight: [`MIGRATION_PREFLIGHT.md`](./MIGRATION_PREFLIGHT.md) — **14 PASS / 4 WARN** across **18** folders.

### 1. Neon migrate

```bash
pnpm --filter @gospots/api migrate:deploy
```

| # | Folder | Purpose | Preflight |
|---|--------|---------|-----------|
| 1 | `20260720210000_billing_webhook_events` | Lemon receipt uniqueness | PASS |
| 2 | `20260720220000_shop_timezone` | `Shop.timezone` | PASS |
| 3 | `20260720230000_money_decimal_core` | Float → `DECIMAL(19,4)` | WARN (locks / contract) |
| 4 | `20260720240000_membership_permissions_subscription_addons` | Permission/add-on rows + CSV backfill | PASS |
| 5 | `20260720250000_guest_token_hash_expiry` | Hash + expiry + backfill (`pgcrypto`) | WARN |
| 6 | `20260720260000_auth_session_family` | Refresh `familyId` + unique hash | PASS |
| 7 | `20260721010000_idempotency_receipts` | Client `IdempotencyReceipt` | PASS |
| 8 | `20260721020000_mail_outbox` | Durable `MailOutbox` | PASS |
| 9 | `20260721030000_dashboard_key_hash` | `Shop.dashboardKeyHash` + backfill | PASS |
| 10 | `20260721040000_currency_stamp_monetary_rows` | Per-row currency stamps | PASS |
| 11 | `20260721050000_tenant_rls_core` | Tier A RLS ENABLE+FORCE | PASS (`TENANT_RLS` opt-in) |
| 12 | `20260721060000_reservation_resource_exclusion` | GiST EXCLUDE on reservations | WARN (overlaps must be 0) |
| 13 | `20260721070000_gdpr_consent_dsar` | Consent / DSAR tables | PASS |
| 14 | `20260721080000_user_mfa_totp` | Owner TOTP + recovery codes | PASS |
| 15 | `20260721090000_drop_membership_permissions_subscription_addons_csv` | DROP CSV columns | WARN (after app cutover) |
| 16 | `20260721100000_ledger_entry` | `LedgerEntry` (+ RLS policy) | PASS |
| 17 | `20260721110000_guest_check` | `GuestCheck` + child FKs (#10) | PASS |
| 18 | `20260721120000_seating_source_dining_table_group` | `SeatingTableGroup.sourceDiningTableGroupId` (#14) | PASS |

Never `migrate reset` / `db push` against Neon.

### 2. `CORS_ORIGINS` + cookie / CSRF / throttle

Set on the API host **before** prod smoke (comma-separated HTTPS web origins). Empty deny / no localhost in prod — see `.env.production.example` and `DEPLOY_CHECKLIST.md`.

Also confirm (must match production example + code defaults):

| Key | Prod expectation |
|-----|------------------|
| `CORS_ORIGINS` | Real Vercel / custom HTTPS origin(s); set before smoke |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `lax` (prefer same-origin `/api/v1` proxy) |
| `CSRF_PROTECTION` | `true` |
| `THROTTLE_DISABLED` | unset / `false` — **never** `true` |
| `PUBLIC_THROTTLE_*` / `AUTH_THROTTLE_*` | defaults safe if unset; see `.env.production.example` |

Dev templates (`.env.example`) keep cookie/CSRF commented with the same guidance; production example sets them explicitly — **do not** ship prod with empty `CORS_ORIGINS`.

### 3. Smoke (post-deploy)

Per `DEPLOY_CHECKLIST.md` / overnight blockers:

| # | Check |
|---|--------|
| Health | `GET /api/v1/live` OK; `GET /api/v1/ready` DB up |
| CORS | Credentialed call from web origin allowed; foreign origin not reflected |
| Login + CSRF | Cookie session + `X-CSRF-Token` mutation succeeds |
| Book | Public book; same slot does not double-book under lock |
| Guest link | New hash token status URL works; legacy plaintext dual-read still OK |
| Stock + sale | Menu SALE and stock stay consistent (no orphan SALE) |
| Webhook | Duplicate Lemon delivery no-ops (idempotent receipt) |

---

## Honest delta vs deep audit P0/P1

| Audit item | Friday status |
|------------|---------------|
| Float money | **Done** (#1 — Decimal columns + 4dp string wire; intermediate `toMoneyNumber` residual) |
| Fragmented ledger / double-count | **Mitigated** (contract + channel sum); Phase 1–2 dual-write on disk (#6); Phase 3–5 / `LEDGER_READS` deferred |
| Tenant `findUnique` / shopId mutations | **Done** (#3): audited mutators + unit matrix + RLS migration/`SET LOCAL` (`TENANT_RLS` opt-in); media public GET residual **accepted**; Neon migrate + flag soak OPERATOR |
| Overlap races | **Done** (#4 code): resource `FOR UPDATE` + exclusion DDL on disk; Neon apply after overlaps=0; live C1/C2 local-only residual |
| Stock races | **Done** (#5 code): txn + claim-before-delete/cancel; live C3 local-only residual |
| Webhook idempotency | **Done** (Neon migrate still operator) |
| CSRF + cookies | **Done** (double-submit + proxy/lax guidance; host must set env) |
| Guest token hash/expiry | **Done** (dual-read window remains; clear CLI available) |
| Owner sessions / 2FA | Refresh family + sessions UI + **owner TOTP MFA Done** (#18); staff MFA / WebAuthn deferred; Neon MFA migrate OPERATOR |
| Timezone | **Done** (column + day keys + settings UI) |
| offeringConfig validation | **Done** on write (+ Phase 0 `schemaVersion` stamp #15) |
| CSV permissions / dual entitlements | **Done** (#13 rows SoT + DROP migration on disk); Neon DROP OPERATOR; `pendingAddOns` stays CSV |
| Mail outbox | **Done** (#22 durable table + processor + dead-letter UI); prod retries unproven OPERATOR |
| GDPR | **Done** (#25 — consent/DSAR/wipe/retention; OPERATOR Neon migrate + processor purge) |
| Unified guest check / resource merge | **#10 DONE** (Phase 0–2; Neon migrate residual); **#14 DONE** Phase 0–2 (Phases 3–4 residual); not Friday operator P0 |
| CI | **Done** for API test/build + web typecheck + ephemeral migrate dry-run; not full e2e / `next build` |

---

*See also: [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md), [`OVERNIGHT_STATUS.md`](./OVERNIGHT_STATUS.md), [`FOUR_DAY_SHIP_PLAN.md`](./FOUR_DAY_SHIP_PLAN.md), [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md), [`BIBLE_STATUS.md`](./BIBLE_STATUS.md).*
