# Locora — CSRF + session cookies (Bible §10 / #16)

**Date:** 2026-07-20 (guard + web wiring) / 2026-07-22 (residual docs lane **CSRF10-residual-docs**)  
**Status:** **Bible #16 / §10 DONE** (code ship bar) — double-submit CSRF guard, cookie flags, Helmet, web header wiring, unit specs = **DONE** on disk. Operator login+CSRF smoke, cross-origin cookie tradeoffs, optional Playwright e2e, and auth/CSRF outage UX are **explicitly residual** — operator Gates + phased plan below.  
**Bible:** P0/P1 **§10** — explicit CSRF protection for cookie-authenticated mutations.  
**Ship timing:** Production defaults (`CSRF_PROTECTION=true`, SameSite=lax + Vercel `/api/v1` proxy) are the Friday submit bar; do not disable CSRF in prod except emergency kill-switch.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Global `CsrfGuard` on unsafe methods when session cookies present | **DONE** | `app.module.ts` `APP_GUARD`; `csrf.guard.ts` |
| `CSRF_PROTECTION` env (default `true`; `false` = emergency off) | **DONE** | `csrf.guard.ts`; `.env.production.example`; `render.yaml` |
| Double-submit: `csrf_token` cookie (JS-readable) + `X-CSRF-Token` header | **DONE** | `csrf.constants.ts`, `csrf.util.ts`, `auth.controller.ts` `GET /auth/csrf` |
| `@SkipCsrf()` for HMAC/signature webhooks (Lemon) | **DONE** | `billing.controller.ts` |
| Public routes skip CSRF when no session cookies (guest APIs) | **DONE** | `csrf.guard.ts` + `@Public()`; exceptions: `/auth/refresh`, `/auth/logout` |
| Cookie Secure / SameSite via `resolveAuthCookieFlags` | **DONE** | `cookie-options.util.ts`; prod Secure default; `none` forces Secure |
| Helmet + CORS `x-csrf-token` allowlist | **DONE** | `main.ts`, `cors-origins.ts` |
| Web `ensureCsrf` bootstrap + header on mutations | **DONE** | `apps/web/src/lib/csrf.ts`, `api.ts`, `api-client.ts` |
| One 403 retry after `ensureCsrf` (race: session before CSRF cookie) | **DONE** | `api.ts` `api()` + `credentialedFetch()` |
| `CSRF_INVALID` user copy after retry exhaustion (§36 W2) | **DONE** | `api.ts` `throwApiErrorFromResponse` + `resolveApiErrorDisplay` builtin; login form en/pl (`auth.login.csrfInvalid`); lane **API36-web-w2-csrf** |
| Idempotency-Key stable across same-attempt CSRF retries | **DONE** | Shared `init.headers` — [`GO_SPOTS_IDEMPOTENCY.md`](./GO_SPOTS_IDEMPOTENCY.md) |
| `CSRF_INVALID` stable API code at throw site | **DONE** | `csrf.guard.ts` via `apiForbiddenException` — catalog in `api-error.codes.ts`; [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md) lane **API36-domain-csrf-codes** |
| Jest guard characterization | **DONE** | `csrf.guard.spec.ts` — **9** tests (403 rejects assert `CSRF_INVALID`) |
| Throttle on `GET /auth/csrf` | **DONE** | `AUTH_THROTTLE_CSRF_LIMIT` (default 60/min) |
| Deploy smoke steps (login + CSRF detail) | **DONE** (doc) | [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) §3 |
| **Operator:** prod env + proxy + manual smoke pass | **RESIDUAL (operator)** | Gates 0–2 below; **blocked** while Render API suspended — [`PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md) |
| **Operator:** cross-origin API (`SameSite=none`) soak | **RESIDUAL (operator)** | Only if abandoning Vercel proxy; CSRF load-bearing — Gate 1b |
| Full Playwright CSRF e2e in CI | **RESIDUAL (optional)** | Manual smoke covers ship bar; **no Playwright CSRF spec on disk** |
| CSRF bootstrap failure → classified outage copy | **RESIDUAL** | Partial retry in `ensureCsrf`; `CSRF_INVALID` post-retry copy **DONE** (lane **API36-web-w2-csrf**); full Mode A–C outage message still open — [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phases 5–6 |
| Auth login/register outage vs bad-credentials copy | **RESIDUAL** | Generic `api-error-message`; forms not mode-aware — same offline doc |
| Per-route `@SkipCsrf` audit beyond billing | **RESIDUAL (process)** | Only Lemon webhook today; new skips need explicit review |

**§10 classification:** **DONE** (code ship bar) — not “prompt complete / zero residuals.” Host verification and UX polish documented here, not hidden.

---

## Architecture (double-submit)

```
Browser                         API
   | GET /auth/csrf  ----------------->  Set-Cookie: csrf_token=… (not HttpOnly)
   |<--------------------------------  { csrfToken }
   |
   | POST /shop/…  ----------------->  Cookie: access_token + csrf_token
   |   X-CSRF-Token: (same value)       CsrfGuard: constant-time match
   |   credentials: include
```

**Session detection:** guard runs only when `access_token` or `refresh_token` cookies are present on an unsafe method (`POST`, `PUT`, `PATCH`, `DELETE`). Guest/public `@Public()` routes without session cookies are not blocked even if a dashboard session exists on the same origin (prevents accidental CSRF coupling on public forms).

**Kill-switch:** `CSRF_PROTECTION=false` bypasses the guard entirely — document as **break-glass only**; never default in prod examples.

---

## Cookie posture (P1)

| Cookie | HttpOnly | Secure (prod) | SameSite | Path |
|--------|----------|---------------|----------|------|
| `access_token` | yes | yes (default) | `lax` (preferred) | `/` |
| `refresh_token` | yes | yes | `lax` | `/api/v1/auth` |
| `csrf_token` | **no** (JS reads for header) | yes | `lax` | `/` |

**Preferred production shape:** Vercel rewrites `/api/v1` → Render API (`NEXT_PUBLIC_API_BASE_URL=/api/v1`) so browser calls are **same-site** → `COOKIE_SAME_SITE=lax`.

**Cross-origin tradeoff:** if the browser calls the API on a different site, set `COOKIE_SAME_SITE=none` (browser forces `Secure`). Cookies ride on cross-site requests; **`CSRF_PROTECTION=true` is load-bearing**. Prefer proxy + `lax` — see [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) §1.

---

## Web client behavior

| Surface | CSRF behavior |
|---------|----------------|
| `api()` JSON mutations | `buildJsonHeaders()` merges `getCsrfHeaders()`; 403 → `ensureCsrf()` → one retry; post-retry `CSRF_INVALID` → friendly copy |
| `credentialedFetch()` | Same retry pattern for non-JSON uploads |
| `ensureCsrf()` | `GET /auth/csrf` with credentials; falls back to document cookie on failure |
| Logout | `clearCachedCsrfToken()` in `use-auth.tsx` |

**Idempotency interaction:** finance/play-billing hot paths mint `Idempotency-Key` once per user action and reuse the same `init.headers` object on CSRF retry — no duplicate side effects on replay.

---

## Operator verification checklist

Use after Render API is **resumed** and env matches [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) §1. **Rollback lever:** misconfigured CSRF usually surfaces as immediate 403 on mutations — fix env/proxy before toggling kill-switch.

### Gate 0 — Env + proxy (read-only)

- [ ] Render **`gospots-api`:** `CSRF_PROTECTION=true` (or unset → default on).
- [ ] `COOKIE_SECURE=true`; `COOKIE_SAME_SITE=lax` with Vercel `/api/v1` proxy (not `none` unless cross-origin is intentional).
- [ ] `CORS_ORIGINS` lists web origins only (no `*` with credentials) — [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) §1.
- [ ] Vercel: `NEXT_PUBLIC_API_BASE_URL=/api/v1` + `API_PROXY_TARGET` → Render API URL.

### Gate 1 — Bootstrap + CORS smoke

- [ ] From web origin: credentialed `GET /api/v1/auth/csrf` → 200 + `Set-Cookie: csrf_token`.
- [ ] From foreign origin (or curl with fake `Origin`): no credentialed CORS reflection (Gate 1b in deploy checklist).

### Gate 2 — Login + mutation smoke (required for §37 gate 8)

Follow [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) **Login + CSRF (detail)** — all eight steps, including post-login mutation with matching `x-csrf-token`, hard-refresh session survival, and sign-out cookie clear.

**Fail signals:** `403` with CSRF message on login/refresh/mutation; dashboard stuck after login; mutations missing header.

**After Gate 2:** treat §10 CSRF **operator verification as closed** for ship acceptance. Optional e2e and offline UX residuals are not blockers.

---

## Remaining implementation (optional — not on disk)

| Phase | Scope | Notes |
|-------|--------|-------|
| **1 — Playwright smoke** | Login → dashboard mutation asserts `x-csrf-token` | Optional CI; manual Gate 2 is ship bar |
| **2 — Outage UX** | Classify CSRF bootstrap / auth outage vs validation errors | Cross-link [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) Phases 5–6 |
| **3 — Process** | PR checklist: new `@SkipCsrf()` requires security note | Billing webhook pattern only today |

**Explicit non-goals:** CSRF tokens in `localStorage` (weaker than double-submit cookie); disabling CSRF for “convenience” on dashboard mutations; state-changing SSE/WebSocket commands (reads only — [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md)).

---

## Verify (at ship time)

```bash
pnpm --filter @gospots/api exec jest src/modules/auth/guards/csrf.guard.spec.ts --no-coverage
```

Expect **9** PASS. Full auth suite and nest build covered by CI.

---

*Parent status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) #16 · §10: [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) · Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Deep audit: [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md) §10*
