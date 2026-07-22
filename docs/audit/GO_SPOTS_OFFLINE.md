# Locora — Offline & degraded-operation behavior (Bible §33 / #32)

**Date:** 2026-07-21 (Modes A–F ship bar — Lanes **QQQ→SSSSS**) / 2026-07-22 (residual docs lane **OFFLINE33-residual-docs**)  
**Status:** **Bible #32 / §33 PARTIAL** — connectivity Modes A–C/F + classified errors + poll backoff + public booking/chat fail-closed + DR + in-app runbook = **DONE** ship bar. Mode E scoped degradation, floor/session timestamp UX, finance retry polish, guest status outage cards, and optional display snapshot are **explicitly deferred** — phased plan below. **No service worker / IndexedDB mutation queue on disk** (intentional non-goals).  
**Audit:** P2 **#32** / original prompt **§33**.  
**Ship criteria (accepted):** clarity of degraded modes + user-visible banners + fail-closed money/booking + ops runbook — **not** offline-first PWA.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Failure taxonomy Modes A–F (design) | **DONE** | This doc + [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) |
| `GET /api/v1/live` + `/ready` (DB probe) | **DONE** | `health.controller.ts` |
| Prod-safe `ApiError` copy (status 0 / 502 / 503 / 504) | **DONE** | Lane **QQQ** — `api-error-message.ts`; wired `api` + public clients |
| `ConnectivityProvider` — browser + `/ready` probe (60s) | **DONE** | Lane **RRR** — `connectivity-context.tsx`; Modes A–C + F |
| App-wide `OfflineBanner` (Modes A–C/F, en/pl) | **DONE** | Lane **TT** — root `layout.tsx`; `opsOutage.mode*Desc` |
| `useLiveData` poll backoff + `reportLivePollResult` | **DONE** | Lane **SSS** — `use-live-data.ts`; Mode F when streak ≥ 2 |
| `NotificationToasts` poll backoff + Mode F reporting | **DONE** | Lane **TTT** — `notification-toasts.tsx` |
| Silent loader `return false` convention for Mode F | **DONE** (infra) | `use-live-data.ts` + Lane **WWW** docs; **not every loader audited** |
| Public gaming/dining booking fail-closed on A–C | **DONE** | Lanes **UUU/VVV** — `public-gaming-booking-dialog.tsx` |
| Public guest chat fail-closed on A–C | **DONE** | Lane **UUU** — `venue-guest-chat-widget.tsx` |
| Fail-closed money/booking (no offline queue) | **DONE** (principle) | Product rule enforced — no client outbox on disk |
| DR partial-outage symptom table | **DONE** | Lane **PPPPP** — [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) |
| Owner in-app outage runbook (Settings) | **DONE** | Lane **SSSSS** — `ops-outage-runbook-panel.tsx`; en/pl |
| Mode **D** (401) distinct from A–C | **DONE** (by design) | Auth redirect — not mixed into outage banner |
| Mode **E** partial feature degradation toasts | **PARTIAL** | Gaming/dining public booking: amber scoped notice when API `emailSent === false` (`public-gaming-booking-dialog.tsx`); menu section/item save + upload partial: `FeedbackBanner` warning via `menu-dialogs.tsx` / menu page. Staff reservation mail, event requests, gallery/gaming standalone uploads, payment partial fail — **still residual** Phase 6 |
| Floor / sessions “as of {time}” stale chip | **RESIDUAL** | Global Mode F banner only; no per-surface timestamp |
| Finance / menu / stock explicit retry UX | **RESIDUAL** | Generic errors; no connectivity-classified retry affordance |
| Public guest **status** pages outage card + refresh | **RESIDUAL** | Booking/chat wired; status routes poll silently only |
| Auth login/register outage vs bad-credentials copy | **RESIDUAL** (partial) | `api-error-message` helps; login forms not mode-aware |
| CSRF bootstrap failure → outage message | **RESIDUAL** | Partial retry exists; no classified outage copy |
| Maintenance mode flag / external status link | **RESIDUAL** | No in-app maintenance toggle |
| Optional `sessionStorage` floor display snapshot | **RESIDUAL** | Phase 5 sketch only — **not on disk** |
| Realtime SSE disconnect → connectivity banner | **RESIDUAL** | Cross-link [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md) Phase 3 |
| Service worker / PWA / offline mutation queue | **RESIDUAL** (intentionally avoided) | Explicit non-goal |

**§33 classification:** **PARTIAL** — Friday ship bar met (Modes A–C/F + fail-closed writes + runbook); polish and Mode E documented here, not hidden.

---

## Ship bar (Lanes QQQ → SSSSS — connectivity UX)

| In scope (DONE) | Explicit non-goals / later |
|-----------------|---------------------------|
| Global banner Modes A–C/F + `/ready` probe | Service worker / Workbox / PWA install |
| Classified prod-safe network/gateway copy | IndexedDB mutation outbox |
| Poll backoff + Mode F stale read banner | Offline-queue money / booking / inventory |
| Public booking + guest chat fail-closed A–C | Background Sync API |
| DR appendix + owner Settings runbook | Changing `/live` semantics pre-submit |
| en/pl `opsOutage.*` copy | Offline TOTP in Locora (authenticator-app scope) |

**Verify:** `pnpm --filter @gospots/web run typecheck` + `i18n:check`

---

## Recommendation (operator / scale)

| When | Action |
|------|--------|
| **Single-region connected SaaS (today)** | Ship bar is enough — banner + fail-closed writes + runbook. |
| **After mail outbox (#22) ships** | Mode **E** scoped toasts (“reservation saved; email pending”) — **outbox shipped**; Mode E UX still **RESIDUAL** Phase 6 |
| **After multi-instance SSE (#23)** | Wire SSE disconnect into same connectivity modes + poll fallback. |
| **Optional polish** | Floor timestamp chip, guest status outage cards, finance retry UX — Phase 5–6 below. |

**Why no offline queue:** Locora is a **connected SaaS** (Postgres, cookie auth, CSRF, multi-tenant). Client-side mutation queues on money/booking would create overlap, idempotency, and trust problems on reconnect.

---

## What exists today (code truth)

### API / infra signals

| Piece | Behavior |
|-------|----------|
| `GET /api/v1/live` | Liveness only — **200 even when Postgres is down** |
| `GET /api/v1/ready` | `SELECT 1`; **503** + `database: down` when DB unreachable |
| `GET /api/v1/health` | Backward-compatible **liveness alias** (same as `/live`) |
| Sentry | Optional, **fail-open** — absence of DSN does not block boot |
| Request logging | Skips probe paths; structured JSON elsewhere |
| Cron reminders | Single-flight advisory lock — reduces duplicate no-show mail on multi-instance |

Host guidance prefers **`/ready`** for load balancers ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md), [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md)).

### Web client (shipped)

| Piece | Behavior |
|-------|----------|
| `ConnectivityProvider` | `online`/`offline` + periodic `GET /ready` (60s, hidden-tab pause; 2-fail streak before B/C) |
| `OfflineBanner` | Modes A–C/F; `role="status"` + `aria-live="polite"`; locale from venue or public prefs |
| `api-error-message.ts` | Status 0 offline vs unreachable; bare 502/504/503 prod copy; local-dev Postgres hint retained |
| `api.ts` / `credentialedFetch` + public clients | Classified copy on network throw / gateway statuses |
| `useLiveData` | Backoff 20s → 60s → 120s on outage / failures; reports → Mode F |
| `NotificationToasts` | Same backoff pattern; reports poll outcomes |
| Public booking + guest chat | Disable writes on Modes A/B/C; inline amber copy; Mode F does not block |
| Service worker / PWA | **None** |
| Offline cache / mutation queue | **None** |

### Partial dependency degradation (implicit today)

| Dependency | Degraded behavior today |
|------------|-------------------------|
| **Postgres** | `/ready` 503; mutations fail; Mode C banner |
| **Resend (mail)** | try/catch at call sites; **durable outbox** ([`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md)) retries via worker — no Mode E toast yet |
| **Lemon Squeezy** | Webhook idempotent; checkout/portal fail at request time |
| **Neon brief blip** | Pool errors → 5xx; optional Sentry if DSN set |

There is **no** product-level maintenance-mode flag or external status-page link in-app.

---

## Failure taxonomy (shared vocabulary)

Use in UX copy and ops docs:

| Mode | Detection (client) | Detection (ops) | User expectation |
|------|-------------------|-----------------|------------------|
| **A. Browser offline** | `navigator.onLine === false` or fetch `TypeError` / status 0 with no response | N/A | “No internet — changes won’t save until you’re back online.” |
| **B. API unreachable** | status 0 / 502 / 504 from proxy or upstream | Render down; DNS; bad `API_PROXY_TARGET` | “Can’t reach Locora servers — try again shortly.” |
| **C. API up, DB down** | Repeated **503** on `/ready` or API 5xx with DB errors | `/ready` → `database: down`; Neon incident | “Locora is temporarily unavailable — your data is safe; retry in a minute.” |
| **D. Authenticated session expired** | **401** on API | Normal auth rotation | Distinct from outage — redirect login, not “offline” banner |
| **E. Partial feature degradation** | 502/503 on one route; others OK | Resend fail, media upload fail, Lemon timeout | Scoped toast: “Email not sent — reservation still saved.” (**RESIDUAL**) |
| **F. Stale read / poll lag** | Live-poll fail streak ≥ 2 while `/ready` OK | DB/API recovered but tab not refocused | Banner: “Showing last saved view — refresh when connection returns.” |

**Do not conflate D with A–C** — mixing “session expired” and “server down” erodes trust.

---

## Product principles (non-negotiable)

1. **Fail closed on money and inventory** — never queue offline SALE, stock adjust, play-billing pay, or walk-in settle client-side.
2. **Fail closed on public booking** — guest booking/event requests must not “save locally” and sync later (overlap / double-book risk).
3. **Stale reads OK with label** — floor/session **display** may show last successful payload during brief outages if timestamp + banner are visible.
4. **Silent failure is worse than stale data** — polls that swallow errors must `return false` or throw so Mode F / backoff can react.
5. **Operator clarity over engineering cleverness** — banners + classified errors + runbook beat IndexedDB sync for v1.

---

## UX by surface

### Shipped

| Surface | Behavior |
|---------|----------|
| **Global shell** | `ConnectivityProvider` + `OfflineBanner` on all routes (staff + public) |
| **Staff polls** | `useLiveData` / notification toasts backoff + Mode F |
| **Public booking** | Submit disabled on A–C; en/pl outage copy |
| **Public guest chat** | Actions disabled on A–C; draft in memory only |
| **Owner ops** | Settings → Outage runbook panel + DR symptom table |

### Residual (polish — not ship-bar blockers)

| Surface | Target behavior |
|---------|-----------------|
| **Floor / sessions** | “As of {time}” chip on last good payload; block session/walk-in modals during A–C (not just banner) |
| **Finance / menu / stock** | Inline connectivity-classified error + explicit Retry (idempotency keys on hot writes — bible #7) |
| **Public status pages** | Gaming/dining/event status: outage card + manual Refresh when polls fail |
| **Auth** | Login/register distinguish A/B/C from invalid credentials in form copy |
| **CSRF bootstrap** | One retry then outage message (not generic failure) |
| **Mode E** | Scoped toasts when mail/upload/payment partial fail but core mutation saved |

---

## Operator runbook (partial outages)

**Shipped** in [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) + owner **Shop settings → Outage runbook** (`OpsOutageRunbookPanel`).

### Symptom → likely cause → action (summary)

| Symptom | Likely cause | First actions |
|---------|--------------|---------------|
| `/ready` 503, `/live` 200 | Postgres / Neon | Check Neon status; verify `DATABASE_URL`; restart API after DB recovery; **never** `migrate reset` |
| Web loads, all API 503 “proxy not configured” | Vercel `API_PROXY_TARGET` missing | Set env to Render URL; redeploy web |
| Web 502, API `/live` OK | Vercel ↔ Render network / wrong URL | Verify Render URL, SSL, CORS `WEB_ORIGIN` |
| API 200 but emails missing | Resend outage or key | Resend dashboard; owner Settings → mail outbox dead-letter retry ([`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md) Gates 0–5) |
| Subscription webhooks failing | Lemon secret / URL | Rotate webhook secret; replay from Lemon; idempotent handler |
| Staff “session expired” spike | JWT/refresh misconfig or clock skew | Cookie `Secure`/SameSite behind proxy — **mode D**, not A–C |
| Duplicate reminder/no-show mail | Multi-instance cron without lock | Confirm advisory lock migration deployed |

### Communication

- **In-app:** connectivity banner — no separate status page required for v1.
- **External:** operator posts on venue social / phone guests for prolonged mode C during open hours.

Full DR / PITR remains [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) — this lane covers **live** partial failure only.

---

## Residual phased plan (post ship bar)

Phases 0–4 delivered the bible ship bar. Remaining work is polish and cross-feature integration — **do not** reopen PWA/offline-queue scope.

### Phase 0 — Design + principles (**DONE**)

- [x] Failure taxonomy + fail-closed principles
- [x] This doc + team agreement: no offline money queue

### Phase 1 — Global connectivity UX (**DONE**)

- [x] Prod-safe `ApiError` copy (Lane **QQQ**)
- [x] `ConnectivityProvider` + `/ready` probe (Lane **RRR**)
- [x] App-wide `OfflineBanner` Modes A–C (Lane **TT**)

### Phase 2 — Poll hardening + Mode F (**DONE**)

- [x] `useLiveData` backoff + `reportLivePollResult` (Lane **SSS**)
- [x] Notification-toast poll backoff (Lane **TTT**)
- [x] Silent loader `return false` convention documented (Lane **WWW**)

### Phase 3 — Public write fail-closed (**DONE**)

- [x] Guest chat disable on A–C (Lane **UUU**)
- [x] Public booking dialog disable on A–C (Lane **VVV**)

### Phase 4 — Ops runbook (**DONE**)

- [x] DR appendix symptom table (Lane **PPPPP**)
- [x] Owner in-app runbook panel en/pl (Lane **SSSSS**)

### Phase 5 — Surface polish (**RESIDUAL**)

**Trigger:** Operator feedback after Render resume + manual smoke, or guest confusion on status pages during blips.

| Work | Notes |
|------|--------|
| Guest status outage cards | `/venue/.../gaming-status`, dining-status, event-status — manual Refresh + friendly copy |
| Floor/session “as of” timestamp | Last successful poll time on high-stakes ops views |
| Finance/menu retry UX | Connectivity-classified inline error + Retry; lean on idempotency (#7) |
| Auth / CSRF outage copy | Form-level distinction: outage vs bad password vs validation |
| Silent loader audit | Grep `silent: true` loaders; ensure failures `return false` for Mode F |

**Exit:** High-stakes surfaces show timestamp or scoped error; no new offline write paths.

### Phase 6 — Mode E + optional display snapshot (**PARTIAL**)

**Prerequisite:** Mail outbox (#22) **shipped**.

| Work | Notes |
|------|--------|
| Mode E scoped toasts | **PARTIAL (Lane OFFLINE33-mode-e):** Public gaming/dining booking success shows amber notice when `emailSent === false` (API already returns flag; en/pl `venuePage.booking.emailDelayed`). Menu save-then-upload partial fail uses dismissible `FeedbackBanner` warning (`menu.uploadSectionPartial` / `menu.photoUploadPartial`) instead of blocking `window.alert`. **Still open:** staff reservation create/update mail side-effects, event-request mail, finance/payment partial fail, global toast host — need product design or API `emailSent` hooks at more mutation sites. |
| Optional `sessionStorage` floor snapshot | **Display-only** layout ids; timestamp mandatory; lost on clear — not write cache |
| Maintenance mode | Optional `SHOP_MAINTENANCE` or host-level banner — low priority |
| SSE disconnect → banner | When [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md) multi-instance SSE stable |

**Non-goals:** Service worker; IndexedDB outbox; offline TOTP in Locora PWA.

---

## Explicit non-goals (v1 offline)

- Service worker, Workbox, or “install app for offline”
- IndexedDB mutation outbox for reservations/finance
- Offline TOTP (#18) on **device** — authenticator-app scope, not Locora PWA
- Background Sync API for guest bookings
- Changing `/live` vs `/ready` probe semantics

---

## Overlap with other bible items

| Item | Relationship |
|------|--------------|
| #22 Mail outbox | Durable retry **shipped** (table + worker + dead-letter UI); Mode E “email pending” toasts + prod proof **residual** — [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md) |
| #23 Observability | Sentry 5xx + request logs help ops distinguish B vs C; not user-facing |
| #24 Backups / DR | Full restore playbook; this doc covers **live** partial failure |
| #23 Realtime / §28 SSE | Stream disconnect should reuse connectivity banner + poll fallback |
| #7 Idempotency | Prerequisite for safe “Retry” on finance mutations after outage |
| #29 A11y | Offline banner uses `role="status"` — see [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md) |

---

## Files (this lane)

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_OFFLINE.md` | This design + shipped/residual plan |
| `docs/operations/DISASTER_RECOVERY.md` | Partial-outage symptom table |
| `docs/audit/ORIGINAL_AUDIT_BIBLE.md` | §33 classification |
| `docs/audit/BIBLE_PROGRESS.md` | §33 quick-status cross-link |
| `docs/audit/AGENT_COORDINATION.md` | Lane **OFFLINE33-residual-docs** complete |

**Verify:** n/a (docs only)
