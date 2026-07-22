# Locora — Offline & degraded-operation behavior

**Date:** 2026-07-21  
**Status:** **Shipped** — Modes A–C/F UX + classified errors + poll backoff + public booking/chat fail-closed + DR appendix (Lane **PPPPP**) + owner in-app runbook (Lane **SSSSS**). No service worker / IndexedDB mutation queue (explicit non-goal).  
**Bible:** P2 **#32** — offline and degraded-operation behavior.  
**Ship criteria (accepted):** clarity of degraded modes + user-visible banners + fail-closed money/booking + ops runbook — **not** offline-first PWA.

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Before / through Friday submit** | Do **not** ship a PWA, offline mutation queue, or service worker. Keep `/api/v1/ready` as host probe; document operator playbooks below. |
| **After Friday** | Ship **connectivity UX** (global banner + classified errors) and **ops runbook** appendix; optionally tighten poll behavior during degradation. **Do not** offline-queue money/booking writes in v1. |

**Why defer:** Locora is a **connected SaaS** (Postgres, cookie auth, CSRF, multi-tenant). True offline-first would touch auth, finance, reservations, and proxy — hot paths and submit risk. The bible asks for **clarity**, not a full offline product.

---

## Problem (bible #32)

When the network, API, database, or a third-party dependency fails, behavior is **implicit and inconsistent**:

- Staff may see dev-oriented errors (“run `pnpm db:setup`”) in production-shaped failures.
- Background polls **silently drop** errors — pages look “stale live” with no explanation.
- There is **no** global “you are offline / server unavailable” affordance.
- Operators lack a **partial-outage runbook** (DB blip vs Render restart vs Resend down vs proxy misconfig).
- Public guests booking or checking status get generic failures with no retry guidance.

**Required fix (bible):** define degraded modes, user-visible behavior, and operator response — not necessarily full offline support.

---

## What exists today

### API / infra signals

| Piece | Behavior |
|-------|----------|
| `GET /api/v1/live` | Liveness only — **200 even when Postgres is down** |
| `GET /api/v1/ready` | `SELECT 1`; **503** + `database: down` when DB unreachable |
| `GET /api/v1/health` | Backward-compatible **liveness alias** (same as `/live`) |
| Sentry | Optional, **fail-open** — absence of DSN does not block boot |
| Request logging | Skips probe paths; structured JSON elsewhere |
| Cron reminders | Single-flight advisory lock (Lane C) — reduces duplicate no-show mail on multi-instance, not a general outage story |

Host guidance already prefers **`/ready`** for load balancers ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md), [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md)).

### Web client

| Piece | Behavior |
|-------|----------|
| `api.ts` / `credentialedFetch` | Network throw → `ApiError` **status 0** with **local-dev** copy (PostgreSQL / `pnpm dev`) |
| `useLiveData` | Polls on interval; pauses when tab hidden; backs off on Connectivity A–C / thrown failures (Lane SSS); Mode F via `reportLivePollResult` |
| `NotificationToasts` | Poll backs off on Connectivity A–C / failures (Lane TTT); reports → Mode F; pauses when tab hidden |
| Vercel proxy `route.ts` | Missing `API_PROXY_TARGET` → **503** JSON (“proxy not configured”) |
| Public / guest clients | Direct `fetch`; no shared connectivity layer |
| Service worker / PWA | **None** |
| Offline cache / mutation queue | **None** |

### Partial dependency degradation (already implicit)

| Dependency | Degraded behavior today |
|------------|-------------------------|
| **Postgres** | `/ready` 503; all mutations fail; polls fail silently or throw per page |
| **Resend (mail)** | `MailService` try/catch at call sites; outbox is **stub only** ([`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md)) — no retry |
| **Lemon Squeezy** | Webhook idempotent; checkout/portal fail at request time |
| **Neon brief blip** | Connection pool errors → 5xx; Sentry may capture if configured |

There is **no** product-level “maintenance mode” flag or status page link in-app.

---

## Failure taxonomy (define these modes)

Use a small shared vocabulary in UX copy and ops docs:

| Mode | Detection (client) | Detection (ops) | User expectation |
|------|-------------------|-----------------|------------------|
| **A. Browser offline** | `navigator.onLine === false` or fetch `TypeError` / status 0 with no response | N/A | “No internet — changes won’t save until you’re back online.” |
| **B. API unreachable** | status 0 / 502 / 504 from proxy or upstream | Render down; DNS; bad `API_PROXY_TARGET` | “Can’t reach Locora servers — try again shortly.” |
| **C. API up, DB down** | Repeated **503** on `/ready` or API 5xx with DB errors | `/ready` → `database: down`; Neon incident | “Locora is temporarily unavailable — your data is safe; retry in a minute.” |
| **D. Authenticated session expired** | **401** on API | Normal auth rotation | Distinct from outage — redirect login, not “offline” banner |
| **E. Partial feature degradation** | 502/503 on one route; others OK | Resend fail, media upload fail, Lemon timeout | Scoped toast: “Email not sent — reservation still saved.” |
| **F. Stale read / poll lag** | Last successful fetch timestamp old; polls failing silently | DB/API recovered but tab not refocused | Banner: “Showing last saved view — refresh when connection returns.” |

**Do not conflate D with A–C** — mixing “session expired” and “server down” erodes trust.

---

## Product principles (non-negotiable)

1. **Fail closed on money and inventory** — never queue offline SALE, stock adjust, play-billing pay, or walk-in settle client-side. Staff must see explicit failure and retry manually when online.
2. **Fail closed on public booking** — guest booking/event requests must not “save locally” and sync later (overlap / double-book risk).
3. **Stale reads OK with label** — floor/session **display** may show last successful payload during brief outages if timestamp + banner are visible.
4. **Silent failure is worse than stale data** — polls that swallow errors should either surface mode F or increment a connectivity counter consumed by a banner.
5. **Operator clarity over engineering cleverness** — post-submit v1 is banners + classified errors + runbook, not IndexedDB sync.

---

## UX by surface (target — not built)

### Staff dashboard (global)

- **ConnectivityProvider** (client): listens to `online`/`offline`, optional periodic `GET /api/v1/ready` (60s, paused when hidden).
- **Banner** (top of `tenant-shell`): modes A–C and F; dismiss only for F when fresh fetch succeeds.
- **Replace dev copy** in `ApiError` status 0 with environment-aware messages (prod vs localhost).

### Floor / sessions / dining ops (high stakes)

| Action | Degraded behavior |
|--------|-------------------|
| View floor | Show last load + “as of {time}” chip; disable optimistic edits |
| Start/stop session, walk-in, assign table | Block with modal: retry when online; **no** local queue |
| Poll (`useLiveData`) | Back off interval on consecutive failures (e.g. 20s → 60s → 120s cap); resume fast on success |

Cross-link [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md): when SSE exists, treat stream disconnect as mode B/C with poll fallback.

### Finance / menu / stock

- Mutations: inline error + “Retry” button; idempotency keys on hot writes (bible #7) reduce double-post on retry — **required before** encouraging aggressive retry UX.
- Reads: table skeleton → error state; no fake rows.

### Public venue pages & guest tokens

- Schedule/status pages: friendly outage card; manual “Refresh status” button.
- Booking form: disable submit when offline; on 503 show “try again in a few minutes” — do not leave form in ambiguous spinner state.
- Guest chat: show disconnected state; keep typed draft in memory only (lost on refresh — acceptable).

### Auth

- Login/register: distinguish mode A/B/C from invalid credentials.
- CSRF bootstrap failure: one retry (already partially exists); then outage message.

---

## Operator runbook (partial outages)

Append to [`docs/operations/DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) after Friday — sketch:

### Symptom → likely cause → action

| Symptom | Likely cause | First actions |
|---------|--------------|---------------|
| `/ready` 503, `/live` 200 | Postgres / Neon | Check Neon status; verify `DATABASE_URL`; scale/restart API after DB recovery; **do not** `migrate reset` |
| Web loads, all API 503 “proxy not configured” | Vercel `API_PROXY_TARGET` missing | Set env to Render URL; redeploy web |
| Web 502, API `/live` OK | Vercel ↔ Render network / wrong URL | Verify Render URL, SSL, CORS `WEB_ORIGIN` |
| API 200 but emails missing | Resend outage or key | Check Resend dashboard; expect **no** durable retry until mail outbox (#22) |
| Subscription webhooks failing | Lemon secret / URL | Rotate webhook secret; replay from Lemon dashboard; idempotent handler safe |
| Staff “session expired” spike | JWT/refresh misconfig or clock skew | Check cookie `Secure`/SameSite behind proxy; not a DB outage |
| Duplicate reminder/no-show mail | Multi-instance cron without lock | Confirm advisory lock migration deployed; single instance or lock keys |

### Communication

- **In-app:** connectivity banner (post-submit) — no separate status page required for v1.
- **External:** operator posts on venue social / phone guests for prolonged mode C during open hours.

### RPO / RTO

- Full DR remains **operator** (bible #24) — this lane does not close backup verification.

---

## Technical approach (post-submit phases)

| Phase | Scope | Exit criteria |
|-------|--------|---------------|
| **0** | This doc + runbook appendix in DR doc | Team agrees principles + no offline money queue |
| **1** | Shell banner + prod-safe `ApiError` + `ConnectivityProvider` / `/ready` (**Lane RR/TT/QQQ/RRR** — Modes A–C banner + classified copy shipped) | Staff sees outage vs auth vs offline |
| **2** | Poll hardening: `useLiveData` backoff + Mode F (**Lane SSS**); notification-toast poll backoff (**Lane TTT**); silent loaders report (**Lane WWW**) | No hammering API during known outage; Mode F when polls fail |
| **3** | Public booking/chat outage states (**Lanes UUU/VVV**) | Guests get retry UX; no local booking queue |
| **4** | Owner in-app ops runbook + DR appendix (**Lanes PPPPP / SSSSS**) | Settings panel + [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) symptom table |
| **5** (optional, deferred) | Read-only **sessionStorage** snapshot for floor layout ids only — **display fallback**, not write cache | Survives brief refresh during mode C; timestamp mandatory |

### Explicit non-goals (v1 realtime/offline)

- Service worker, Workbox, or “install app for offline”
- IndexedDB mutation outbox for reservations/finance
- Offline TOTP (#18) — design already notes TOTP works offline on **device**; that is authenticator-app scope, not Locora PWA
- Background Sync API for guest bookings
- Changing health probe semantics pre-submit

---

## Overlap with other bible items

| Item | Relationship |
|------|--------------|
| #22 Mail outbox | Email degradation → durable retry; until then, mode E copy for “saved but email pending” |
| #23 Observability | Sentry 5xx + request logs help ops distinguish B vs C; not user-facing |
| #24 Backups / DR | Full restore playbook; this doc covers **live** partial failure |
| #28 Realtime | SSE disconnect handling reuses connectivity banner + poll fallback |
| #7 Idempotency | Prerequisite for safe “Retry” on finance mutations after outage |

---

## Files (this lane)

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_OFFLINE.md` | This design + ship criteria |
| `docs/operations/DISASTER_RECOVERY.md` | Partial-outage symptom table |
| `apps/web/src/components/settings/ops-outage-runbook-panel.tsx` | Owner in-app runbook (Lane **SSSSS**) |
| `apps/web/src/lib/i18n.ts` | `opsOutage.*` en/pl |
| `docs/audit/BIBLE_STATUS.md` | #32 → **DONE** |
| `docs/audit/BIBLE_FINISHED.md` | Lane SSSSS append |
| `docs/audit/AGENT_COORDINATION.md` | Lane SSSSS claim/complete |

**Verify:** `pnpm --filter @gospots/web run typecheck` + `i18n:check`
