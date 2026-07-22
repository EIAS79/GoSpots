# Overnight status snapshot

> **Bible progress:** [`BIBLE_PROGRESS.md`](./BIBLE_PROGRESS.md) · **Per-item:** [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) · **Finished log:** [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md)

**As of:** Tue 2026-07-21 (post-**#14 DONE** Phase 0–2; bible code ship bar **35 DONE**)

**Parallel agents:** [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) — claim a lane before editing; hot files still serial. Schema free after **#14** Phase 2. Do not start Neon migrate from agents.

---

## Done

- Lemon webhook idempotency + edge cases (sig fail no receipt; unknown ignore; duplicate no-op)
- Booking resource locks
- Public booking input harden (**Done** — gaming + dining parity: DTO bounds, shopId from slug, capacity, opening hours; `reservations.service.spec`)
- Staff booking partySize 1–100 DTO/service bounds (aligned with public)
- Public event-request create harden (**Done** — DTO bounds, email/phone, shopId from slug, opening hours, category scope; guest-token hash wired; `event-requests.service.spec`)
- Public schedule / availability harden (**Done** — venue-TZ day bounds; `ScheduleQueryDto` on public GETs; category belongs-to-shop + kind; date horizon; schedule throttle 60/min; create past/horizon guard; TOCTOU accepted — create still locks)
- Atomic stock + SALE
- CSRF + slug dashboard URLs
- Money `Decimal(19,4)` + util wiring (build green)
- Guest token hash + expiry on create/validate (dual-read legacy plaintext)
- Guest cancel/revoke harden (cancel + staff cancel/NO_SHOW revoke; expired/revoked refuse reuse)
- Auto NO_SHOW cron race-safe + revoke (conditional `updateMany`; side effects only when `count > 0`)
- `offeringConfig` validation (DTO + util spec)
- Finance reporting double-count fix (contract + `sumRevenueChannels`)
- Web CSRF smoke hardening
- Auth rate-limit hardening (env `AUTH_THROTTLE_*`; `THROTTLE_DISABLED` local smoke only — never prod)
- Shop timezone wiring + settings UI (Lane B)
- CI web build / typecheck (`web` job: `pnpm run typecheck`)
- Web `next build` green locally (exit 0); Node 20 recommended — Node 26 engine warning non-blocking
- Image upload safety (MIME allowlist + magic-byte sniff, size limits, shop-scoped deletes, shared multer)
- Media GET harden (keep public; drop `Access-Control-Allow-Origin: *` — residual accepted)
- Atomic order-line patches + order cancel per-line (patch/cancel/delete line + delete order in single txn; no double restore)
- `updatePlaySession` booking lock (exclusion gap closed; docs + detect script)
- Tenant shopId mutation audit (**Done** — all mutators scoped incl. hours/gallery/seating-tables/audit)
- Notifications shopId scoping (**Done** — list/mark-read/archive/delete + upsert/reservation-tab)
- Notification href safety (**Done** — `sanitizeAppRelativeHref` / `guestVenueStatusPath` / `absoluteAppUrl`; open-redirect audit)
- Money serialize / JSON normalize (**Done** — `serializeMoney` on API payloads; `normalizeOfferingConfigPrices` on writes; rounded JS numbers per money decision)
- FX rates / convertMoney harden (**Done** — live rates; `convertMoney`/`fxCrossRate`; no DB Float FX columns; residual: no multi-currency ledger)
- Helmet API headers (**Done** — CSP off; CORP `cross-origin`; HSTS prod-only; see `DEPLOY_CHECKLIST.md`)
- Prod boot secrets (**Done** — `assertCriticalSecretsAtBoot`: JWT / DATABASE_URL / LEMON webhook secret required in production)
- Refresh token family revoke (**Done** — hashed at rest; rotate on use; reuse → family revoke; migration `20260720260000_*` on disk)
- Feature asserts on gated routes (**Done** — `assertShopHasFeature` on reservation/events/messaging/multi_shop/reports/transaction/audit/notifications/reviews/marketing)
- Seat limit assert (**Done** — `assertStaffSeatCapacity` on staff create + reactivate; activate path counts seat at invite)
- Owner password-reset + staff invite atomic consume (**Done** — SHA-256 + TTL; `updateMany` single-use clear)
- API stabilize pass — full Jest **56 suites / 378 tests** + `tsc` + `nest build` green (`apps/api`)
- Staff permissions dual-read — `/me` + staff list merge CSV + rows; web `plan.ts` addOns shapes (CSV + relational)
- Staff invite / activate lifecycle — hash-at-rest + TTL + atomic single-use consume; seat assert before activate; permissions dual-write on activate
- Walk-in pay/cancel/update race harden — conditional `updateMany` claims + resource locks on interval moves
- Migration preflight — **14 PASS / 4 WARN** on **18** pending folders ([MIGRATION_PREFLIGHT.md](./MIGRATION_PREFLIGHT.md)): money + guest + exclusion + CSV DROP WARN; through seating source FK `20260721120000_*`
- CORS production harden — host must set `CORS_ORIGINS` before prod smoke
- Cookie security audit (**Done** — prod Secure auto-on via `NODE_ENV`; localhost HTTP stays off; prefer SameSite=lax + Vercel `/api/v1` proxy)
- Cron single-flight (reminders + mail outbox) — `pg_try_advisory_xact_lock` (Lanes C / SS)
- Atomic FX catalog reprice + currency preview/confirm (Lanes D / CC / MM)
- Client `Idempotency-Key` on finance hot writes (API + web) (Lanes AA / NN)
- GDPR export + guest erase + consent/DSAR/account wipe/retention (**#25 DONE** / VVVVVV; OPERATOR Neon)
- Sessions list/revoke API + settings UI; UA on issue; new-device alert email (Lanes J/O/R/VV)
- Durable mail outbox + processor (Lane SS) — prod retries not yet proven
- Optional Sentry init + 5xx filter (Lanes V / Y)
- Public throttle env on booking/event/contact/review/chat-open (Lane BB)
- Owner/guest marketing route split (Lane GG) — `/` + `/for-venues` owner; `/venues` guest
- Connectivity / offline Modes A–C/F + public booking/chat outage UX (Lanes RR–WWW)
- Optional Playwright e2e smoke + axe a11y smoke (**13** public routes; not CI-gated) (Lanes QQ / UU / EEE / YYY / **JJJJJ**)
- Concurrency suite design + opt-in scaffold (`test:concurrency`; live bodies deferred) (Lanes CCC / XXX)
- CI ephemeral Postgres migrate dry-run (`api-migrate` job; never Neon) (Lane **KKKKK**)
- Public CAPTCHA assert + optional guest widget (default provider off; enable with keys) (Lanes GGGGG / IIIII / **LLLLL**)

**Residual (accepted):** Public `GET /media/:id` — opaque id still world-readable if leaked; no signed URLs. Exclusion DDL on disk — apply only after overlap detect = 0. Ledger dual-write default off. No Neon migrate yet (operator; **18** folders through `20260721120000_seating_source_dining_table_group`).

---

## Secrets / build artifacts (pre-commit hygiene)

**As of:** 2026-07-20 — ignore + leak scan (no commit performed)

| Pattern | Root `.gitignore` | Tracked in git? |
|---|---|---|
| `node_modules` | yes (L1) | no |
| `dist` (covers `apps/api/dist`) | yes (L4) | no |
| `.next` | yes (L5); also `apps/web/.gitignore` `/.next/` | no |
| `.env` | yes (L9); also `.env.local`, `.env.*.local`, `.env.production` | no (`apps/api/.env` is ignored) |

**OK:** Only template env files are tracked: `apps/api/.env.example`, `apps/api/.env.production.example`. Local `apps/api/.env` and `apps/api/dist/**` show as ignored (`!!`), not staged.

**Operator note:** No `git rm --cached` needed — dist / `.env` were never indexed. Before any commit, still double-check `git status` does not stage `dist`, `.env`, `.next`, or `node_modules` (Windows path quirks / force-add).

**Docs secret scan (`docs/`, esp. `docs/audit/*`):** No real API keys, JWTs, webhook secrets, Neon hostnames, or private-key blocks found. Mentions are env **names**, placeholders (`change-me-…`), or local docker Postgres in `docs/DATABASE.md` only.

**Risk:** Low. Residual: do not `git add -f` ignored paths; keep real Neon / Lemon secrets out of chat pastes into docs.

---

## Still in flight

_(none)_

**Done this wave (moved off in-flight):** **#10** GuestCheck Phase 0–2 — migration `20260721110000_guest_check` on disk; attach APIs + open-tabs UI. Residual Phase 3 settle + OPERATOR Neon. **#14** resource/dining Phase 0–2 — migration `20260721120000_seating_source_dining_table_group` on disk; dual-write default on. Residual Phases 3–4 + OPERATOR Neon.

Friday **P0 harden** waves remain reconciled (items **1–35** DONE). Deep residuals (ledger Phase 3+, #10/#14 Phase 3+) are post-harden, not Friday operator blockers.

**Friday remaining is operator:** Neon `migrate deploy` (**18** on disk: `20260720210000_*` … `20260721120000_seating_source_dining_table_group`) + `CORS_ORIGINS` / cookie / CSRF / throttle prod defaults + manual smoke — [`REMAINING_P0_FRIDAY.md`](./REMAINING_P0_FRIDAY.md) · [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md)

---

## Blockers for Friday

**Remaining P0:** [REMAINING_P0_FRIDAY.md](./REMAINING_P0_FRIDAY.md)

1. **Neon migrate deploy** — Operator action Friday only; **do not auto-deploy** from workstation (`.env` may point at Neon). Preflight done ([MIGRATION_PREFLIGHT.md](./MIGRATION_PREFLIGHT.md)); **18** pending folders (`20260720210000_*` … `20260721120000_seating_source_dining_table_group`) — `migrate deploy` only, **never reset**.
2. **Host env** — Set `CORS_ORIGINS` before prod smoke; confirm `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax` (prefer Vercel `/api/v1` proxy), `CSRF_PROTECTION=true`, never `THROTTLE_DISABLED` (see `.env.production.example`).
3. **Manual smoke** — login/CSRF, CORS, book, guest status link, stock+sale, duplicate Lemon webhook ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) §3).
4. **Deploy Node** — Render + Vercel: **20 LTS** (root `engines.node` `20.x`).

**Operator confirm (residual):** Neon PITR / retention + restore drill — fill TBD in [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) (bible **#24 DONE** for runbook).

---

## Explicitly deferred (post-submit)

Full ledger Phase 3–5 · Exclusion Neon apply (after overlaps=0) + live concurrency residual · Resource/dining merge Phases 3–4 (#14 Phase 0–2 DONE) · Unified guest check Phase 3+ settle (#10 Phase 0–2 DONE; Neon residual) · Redis/multi-instance SSE · OTel · Full dashboard a11y / i18n sweeps · Pack `tier` DROP · CSV DROP Neon · Signed media URLs · Marketplace GTM (#35) · Lemon/Resend GDPR processor purge (accounting money rows kept by design)

**Not deferred (already shipped / on disk):** sessions list/revoke UI · GDPR #25 · owner 2FA/TOTP (#18) · durable mail outbox (retries unproven in prod) · timezone / currency stamps · RLS / exclusion / CSV DROP / ledger migrations on disk · connectivity Modes A–C/F · money string JSON wire (#1) · #11 Phase 0+1 finance extract

---

## Parallel-agent conflict check

**As of:** 2026-07-21 — post-**#14 DONE** Phase 0–2 (no migrate deploy)

| Check | Result |
|---|---|
| Conflict markers (`<<<<<<<` / `=======` / `>>>>>>>`) | **None** (repo-wide; excluded `node_modules` / `.next` / `dist`) |
| `pnpm --filter @gospots/api exec nest build` | **PASS** |
| `pnpm --filter @gospots/web run typecheck` | **PASS** |
| CI workflow | Still sensible: `api` lint/build/Jest · `api-migrate` ephemeral Postgres · `web` typecheck · `web-a11y-smoke` non-blocking |
| Spot-check hot services | **Do not** parallelize finance / reservations / auth / schema / `main.ts` without a board claim — schema currently free |

**Surgical fixes:** None — builds already green. Skipped ledger Phase 3 / `LEDGER_READS` (post-submit residual).
