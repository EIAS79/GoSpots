# 4-day ship plan (Mon → Fri)



**Goal:** Submit a product that won't lose money, double-book, or leak guest links — not the full 40-point bible.

**Bible index:** [`BIBLE_PROGRESS.md`](./BIBLE_PROGRESS.md) — full 40-point tracker (this doc is the Friday ship slice).

**Token rule:** Prefer one focused wave at a time. Stop starting new megawork if usage is low.

**Parallel agents:** [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) — claim a lane before editing; B/C/D may be in flight.



---



## Already in (do not rip out)



| Item | Status |

|------|--------|

| Lemon webhook idempotency + edge cases | **Done** (sig fail no receipt; unknown ignore; duplicate no-op) |

| Booking resource locks | Done |

| Public schedule / availability harden | **Done** (venue-TZ day bounds; `ScheduleQueryDto` on public GETs; category belongs-to-shop + kind; date horizon; schedule throttle 60/min; create past/horizon guard; TOCTOU accepted — create still locks) |

| Public booking input harden | **Done** (gaming + dining parity: DTO bounds, shopId from slug, capacity, hours) |

| Public event-request create harden | **Done** (DTO bounds, email/phone, shopId from slug, opening hours; guest-token hash already wired) |

| Atomic stock + SALE | Done |

| CSRF + slug dashboard URLs | Done |

| Money `Decimal(19,4)` + util wiring | Done (build green) |

| FX rates / convertMoney harden | **Done** (live rates; `convertMoney`/`fxCrossRate`; no DB Float FX columns; residual: no multi-currency ledger) |

| Guest token hash util + migration | **Done** (hash+expiry create/validate; dual-read legacy plaintext) |

| Guest cancel/revoke harden | Done (cancel + staff cancel/NO_SHOW always revoke; expired/revoked refuse reuse) |
| Auto NO_SHOW cron race-safe + revoke | **Done** (conditional `updateMany`; revoke same write; skip when `count === 0`) |

| Owner password-reset + staff activate tokens | **Done** (SHA-256 at rest; TTL 1h/7d; atomic single-use clear; columns already on DB — no new migrate) |

| offeringConfig validation | Done (DTO `@IsOfferingConfig` + util spec) |

| Finance reporting double-count | **Done** (contract + `sumRevenueChannels`; dashboard + finance analytics) |

| Web CSRF smoke hardening | Done |

| Auth rate-limit hardening | **Done** (env `AUTH_THROTTLE_*`; `THROTTLE_DISABLED` local smoke only — never prod) |

| Shop timezone wiring | Done |

| Refresh token family revoke | **Done** (hashed at rest; rotate on use; reuse → family revoke; migration `20260720260000_*`) |

| Helmet API headers | **Done** (CSP off; CORP `cross-origin`; HSTS prod-only; `DEPLOY_CHECKLIST.md`) |

| Prod boot secrets | **Done** (`assertCriticalSecretsAtBoot`: JWT / DATABASE_URL / LEMON webhook secret required in production) |

| Seat limit assert | **Done** (`assertStaffSeatCapacity` on staff create + reactivate) |

| Feature asserts on gated routes | **Done** (`assertShopHasFeature` on reservation/events/messaging/multi_shop/reports/transaction/audit/notifications/reviews/marketing) |

| Notification href safety | **Done** (`sanitizeAppRelativeHref` / `guestVenueStatusPath` / `absoluteAppUrl`; open-redirect audit) |

| Entitlements / CI stubs | Partial — finish only if green, else defer |

| CI web build / typecheck | **Done** (workflow `web` job: `pnpm run typecheck`) |

| Image upload safety | Done (MIME allowlist + magic-byte sniff, size limits, shop-scoped deletes, shared multer) |

| Media GET harden | **Done** (keep public; drop `Access-Control-Allow-Origin: *` — residual accepted) |

| Atomic order-line patches | **Done** (patch/cancel/delete line + delete order in single txn) |

| `updatePlaySession` booking lock | **Done** (exclusion gap closed; docs + detect script) |

| Tenant shopId mutation audit | **Done** (all mutators scoped incl. hours/gallery/seating-tables/audit) |

| Notifications shopId scoping | **Done** (list/mark-read/archive/delete + upsert/reservation-tab) |

| Money serialize / JSON normalize | **Done** (`serializeMoney` on API payloads; `normalizeOfferingConfigPrices` on writes; rounded JS numbers per money decision) |

| Staff permissions dual-read | **Done** (`/me` + staff list merge CSV + rows; web `plan.ts` addOns shapes) |

| Staff invite / activate lifecycle | **Done** (hash+TTL+atomic consume; seat assert on activate; permissions dual-write; inactive refused) |
| Walk-in pay/cancel/update race harden | **Done** (conditional `updateMany` claims + resource locks on interval moves) |
| Migration preflight (Neon) | **Done** — [MIGRATION_PREFLIGHT.md](./MIGRATION_PREFLIGHT.md): **6 PASS / 2 WARN** across **eight** pending migrations (`20260720*` + `20260721010000_idempotency_receipts` + `20260721020000_mail_outbox`; money in-place Decimal locks; guest `pgcrypto` + index build; #7–#8 expand-only PASS). Friday `migrate deploy` = operator only; **do not auto-deploy** (env is Neon) |

| CORS production harden | **Done** — set `CORS_ORIGINS` on host before prod smoke |

| Cookie security audit | **Done** — prod Secure auto-on via `NODE_ENV`; localhost HTTP stays off; prefer SameSite=lax + proxy |



**Residual (accepted):** Public `GET /media/:id` — opaque id still world-readable if leaked; no signed URLs. Postgres exclusion constraint DDL deferred until overlap detect = 0. No multi-currency ledger (FX convert harden done).



---



## In flight / overnight Mon



> **Reconciled 2026-07-20** against `GO_SPOTS_IMPLEMENTATION_REPORT.md` — no waves still in progress. Operator away shutdown complete for this bucket.



---



## What we WILL finish by Friday (highest priority only)



### P0 — must ship



1. **Keep API + web building green** after every change  

2. **Deploy all pending Prisma migrations** — preflight **Done** ([MIGRATION_PREFLIGHT.md](./MIGRATION_PREFLIGHT.md): 6 PASS / 2 WARN on eight folders); Friday operator runs `migrate deploy` only — never reset; **do not auto-deploy** from dev (Neon)  

3. **Guest tokens:** hash + expiry on create/validate for booking status, cancel, event-request, guest chat (dual-read legacy plaintext) — **Done 2026-07-20**  

4. **Finance reporting:** stop obvious double-count paths in analytics (contract fix, not full ledger) — **Done** 2026-07-20 (`GO_SPOTS_FINANCE_CONTRACT.md` + shared sum)  

5. **Smoke checklist** for login, book, pay/stock, webhook duplicate, CSRF mutation  



### P1 — only if time + tokens remain



6. Entitlements single helper wired on critical guards (if already started, finish; else skip)  

7. CI workflow that runs API tests + build  

8. Health `/live` + `/ready`  



### Explicitly OUT until after submit



- Full ledger rewrite  

- 2FA / session management UI  

- GDPR export/delete  

- Resource/dining model merge  

- Unified customer ticket/tab  

- Realtime websockets  

- Full a11y / i18n sweeps  

- Exclusion constraints / Postgres concurrency integration suite  

- Marketing / branding polish  



**Mon guest-token note:** No blockers. Cancel/status edge cases tightened 2026-07-20: cancel + staff cancel/NO_SHOW always revoke (incl. idempotent already-canceled seal); expired/revoked refuse reuse via `assertGuestTokenActive`; dual-read legacy plaintext still works until expiry. Known follow-up only: status-update emails omit `statusPath` for hash-only rows (guest keeps create link). Canonical guest migration: `20260720250000_*` (no migrate reset).

**Mon notification-href note:** Open-redirect / cross-tenant audit done 2026-07-20. Hrefs must be same-app relative (`sanitizeAppRelativeHref`); guest `statusPath` from DB `shop.slug` via `guestVenueStatusPath`; email CTAs via `absoluteAppUrl`; web rejects non-relative track/notification links. Spec + `tsc`/`nest build` green.

**Mon auth-token note:** Owner `passwordResetTokenHash`/`ExpiresAt` + staff `inviteTokenHash`/`inviteExpiresAt` already hashed (SHA-256) with TTL (1h / 7d). Columns present on live DB (reuse; no new migration — history drift vs `db push` accepted). Consume paths now atomically clear hash+expiry (`updateMany` count === 1) so concurrent reuse fails; staff activate also requires `passwordSetAt: null`. Staff “forgot password” only flags owner (`passwordResetRequestedAt`) — new link via regenerate invite.



---



## Day plan



| Day | Focus | Exit criteria |

|-----|--------|----------------|

| **Mon (today)** | Stabilize: guest-token E2E finish, migration inventory, build green | `tsc`/`nest build` green; guest status/cancel/chat use hash path |

| **Tue** | Finance double-count fix + migration preflight + smoke script | Analytics + preflight Done 2026-07-20; smoke still open |

| **Wed** | Buffer / catch-up (or light CI + health if ahead) | No red build; critical bugs from Tue fixed |

| **Thu** | End-to-end smoke on real/local stack; fix blockers only | Login → book → staff ops paths work with CSRF |

| **Fri** | Freeze features; deploy checklist; submit | **[Remaining P0 →](./REMAINING_P0_FRIDAY.md)** · Known limitations listed; no half-migrations — see [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md) |



---



## Deploy order (Friday)

**Remaining P0:** [REMAINING_P0_FRIDAY.md](./REMAINING_P0_FRIDAY.md)

```bash

pnpm --filter @gospots/api migrate:deploy

pnpm --filter @gospots/api run build

pnpm --filter @gospots/web run build

```



Migrations on disk (`apps/api/prisma/migrations/`, verified 2026-07-21):



| # | Folder | Purpose |

|---|--------|---------|

| 1 | `20260720210000_billing_webhook_events` | Lemon webhook idempotency receipt table |

| 2 | `20260720220000_shop_timezone` | Shop `timezone` column (IANA, default UTC) |

| 3 | `20260720230000_money_decimal_core` | Float → `DECIMAL(19,4)` on money columns |

| 4 | `20260720240000_membership_permissions_subscription_addons` | Relational permissions + subscription add-ons (CSV dual-read retained) |

| 5 | `20260720250000_guest_token_hash_expiry` | Guest token hash + expiry + backfill (dual-read legacy plaintext) |

| 6 | `20260720260000_auth_session_family` | AuthSession `familyId` + unique `refreshTokenHash` (reuse → family revoke) |

| 7 | `20260721010000_idempotency_receipts` | Client `IdempotencyReceipt` table (finance hot-write keys; Lane AA) |

| 8 | `20260721020000_mail_outbox` | Durable `MailOutbox` table (email retry worker; Lane SS) |



Deploy with `prisma migrate deploy` only — **never reset**. Order is by folder timestamp (Prisma default).



Reconciled: duplicate `20260720220000_guest_token_hash_expiry` and `20260720220000_membership_permissions_*` stubs were removed; all **eight** folders above are untracked/new (not yet applied to Neon). Refresh-family + client idempotency receipt + mail outbox code is wired.

**Preflight:** [MIGRATION_PREFLIGHT.md](./MIGRATION_PREFLIGHT.md) — **6 PASS / 2 WARN** (money Decimal locks; guest `pgcrypto` + index build; auth session family **PASS**; idempotency receipts **PASS** expand-only; mail outbox **PASS** expand-only). Operator runs `migrate deploy` on Friday only — not from local `.env` against Neon.



If any migration folder exists without matching code paths, **do not deploy it** — remove or finish first.



---



## Definition of "ready to submit"



- [ ] API typecheck + nest build pass  

- [ ] Web build passes  

- [ ] CSRF login/refresh works in browser  

- [ ] Guest booking link works with new tokens; old links still dual-read — **implemented; smoke on deploy**  

- [ ] Duplicate Lemon webhook does not re-apply  

- [ ] Two overlapping bookings cannot both succeed for same resource  

- [ ] Stock + sale cannot leave orphan SALE  

- [ ] Written "known limitations" (no full ledger, no 2FA, etc.)

