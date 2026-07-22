# Locora — Public abuse & CAPTCHA escalation (Bible §28 / #26)

**Date:** 2026-07-21 (lanes BB→RRRRR) / 2026-07-22 (residual docs lane **ABUSE28-residual-docs**)  
**Status:** **Bible #26 / §28 PARTIAL** — throttles + verify util + route assert + optional widget + in-memory `after_throttle` 429 escalation = **DONE** ship bar (`CAPTCHA_PROVIDER=off` no-op). Live vendor enable, Redis multi-instance escalation store, and verify-fail metrics are **explicitly deferred** — operator Gates + phased plan below.  
**Bible:** P2 **§28** / **#26** — public endpoints need stronger abuse controls.  
**Ship timing:** Keep `CAPTCHA_PROVIDER=off` until operator Gates 1–3. Env `PUBLIC_THROTTLE_*` + global/auth limits are the Friday submit bar.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Per-IP `PUBLIC_THROTTLE_*` on six public creates | **DONE** | Lane **BB**; `publicThrottle()` + `@Throttle` on `public.controller.ts` |
| Global + auth throttles | **DONE** | `THROTTLE_GLOBAL_LIMIT`; `AUTH_THROTTLE_*` |
| Public schedule read throttles (429-only, no CAPTCHA) | **DONE** | hardcoded 60/min availability |
| DTO validation on booking/event payloads | **DONE** | public create DTOs |
| `@SkipThrottle` on billing webhooks | **DONE** | webhook routes |
| `captcha.util.ts` verify + `assertCaptchaOrThrow` | **DONE** | Lane **GGGGG**; Turnstile + hCaptcha siteverify |
| Assert on all six publicThrottle creates | **DONE** | Lane **IIIII**; body `captchaToken` or `X-Captcha-Token` |
| Optional web `PublicCaptchaWidget` | **DONE** | Lane **LLLLL**; off unless `NEXT_PUBLIC_CAPTCHA_*` set |
| In-memory `after_throttle` 429 escalation map | **DONE** | Lane **MMMMM**; `captcha-escalation.util.ts` |
| `CaptchaAwareThrottlerGuard` notes public-create 429s | **DONE** | replaces default `ThrottlerGuard` in `app.module.ts` |
| Cross-surface burst (≥2 kinds → all creates) | **DONE** | `notePublicThrottle429` + `isCaptchaEscalated` |
| Default `CAPTCHA_PROVIDER=off` → assert no-op | **DONE** | limits-only prod behavior until operator enable |
| jest captcha + captcha-escalation specs | **DONE** | **19** PASS (prior lanes) |
| Live Turnstile/hCaptcha keys + provider flip | **RESIDUAL (operator)** | examples stay **off**; Gate 1–3 below |
| Redis / shared escalation store (multi-instance) | **RESIDUAL** | **process-local Map only on disk** — v1 comment in util |
| `captcha_verify_fail` metrics + provider error logs | **RESIDUAL** | sketch in “Remaining implementation” |
| WAF / edge rate limit; honeypot fields | **RESIDUAL** | design only |
| Deeper pattern detection (IP reputation, geo) | **RESIDUAL** | audit stretch goal |
| `CAPTCHA_MODE=always` prod soak | **RESIDUAL (optional)** | env exists; default `after_throttle` |

**§28 classification:** **PARTIAL** — code-complete progressive abuse stack shipped with provider off; operator enable + scale residuals documented here, not hidden.

---

## What is shipped today (Lane BB)

Per-IP rate limits on public **create** surfaces, layered under the global limiter (`THROTTLE_GLOBAL_LIMIT`, default **100/min**). TTL window: `THROTTLE_TTL_MS` (default **60s**). Implemented via `publicThrottle()` in `throttle.config.ts` and `@Throttle(...)` on `public.controller.ts`.

| Env key | Default | Route / surface |
|---------|---------|-----------------|
| `PUBLIC_THROTTLE_BOOKING_LIMIT` | **5**/min | `POST` dining + gaming reservation create |
| `PUBLIC_THROTTLE_EVENT_LIMIT` | **5**/min | `POST` event-request create |
| `PUBLIC_THROTTLE_CONTACT_LIMIT` | **5**/min | `POST` contact |
| `PUBLIC_THROTTLE_REVIEW_LIMIT` | **5**/min | `POST` review |
| `PUBLIC_THROTTLE_CHAT_OPEN_LIMIT` | **5**/min | `POST` guest chat **open** (not message/ping) |

Also in place: auth `AUTH_THROTTLE_*`, public schedule read throttles (hardcoded 60/min on availability), DTO validation on booking/event payloads, `@SkipThrottle` on billing webhooks. **`THROTTLE_DISABLED=true` must never be set in production.**

---

## CAPTCHA route wire (Lane IIIII)

`assertCaptchaOrThrow` runs **before** service logic on all five `publicThrottle` creates:

| Method | Path |
|--------|------|
| `POST` | `/public/venues/:slug/dining/reservations` |
| `POST` | `/public/venues/:slug/gaming/reservations` |
| `POST` | `/public/venues/:slug/event-requests` |
| `POST` | `/public/venues/:slug/contact` |
| `POST` | `/public/venues/:slug/reviews` |
| `POST` | `/public/venues/:slug/chats` (open only) |

**Token sources (documented):**

1. **Preferred:** JSON body field `captchaToken` (optional on create DTOs; CORS-safe).
2. **Also:** header `X-Captcha-Token` (`CAPTCHA_TOKEN_HEADER`).

With default `CAPTCHA_PROVIDER=off` (or provider set without secret), assert is a **no-op** — production behavior unchanged until secrets + keys. Guest widget is ready (Lane **LLLLL**); do **not** set provider to turnstile/hcaptcha in prod examples as required until site/secret keys are configured together.

**CORS:** prefer body `captchaToken` (no header allowlist needed). Header path is for non-browser clients.

---

## CAPTCHA escalation — when to require a challenge

Use a **progressive** model: cheap limits first, human proof only when abuse signals appear.

| Signal | Action |
|--------|--------|
| **Normal traffic** | Rate limits only; no widget (keeps guest UX frictionless for Friday bar). |
| **Approaching limit** | Optional post-submit: invisible/managed widget on **writes only** (booking, event, contact, review, chat open). |
| **429 on same IP + surface within TTL** | **Require** valid CAPTCHA token on the **next** attempt for that surface (escalation). |
| **Cross-surface burst** | Same IP hits 429 on ≥2 public create kinds in one TTL → require CAPTCHA on **all** public creates from that IP until window resets. |
| **Repeated post-CAPTCHA failures** | Keep 429; do not bypass throttle with a bad token; log/metric for ops. |
| **Read-only public GETs** | Schedule/availability throttles stay **429-only** — no CAPTCHA on reads. |

**Do not** use CAPTCHA on: auth login/register (separate abuse story), webhooks, media GET, GDPR, dashboard APIs.

**Fail-closed:** If provider is configured but verify fails (network, bad secret, expired token) → **403** with generic copy; do not process the create. If provider env is **unset**/`off` → behave as today (limits only).

### Lane MMMMM — `after_throttle` map (shipped)

| Piece | Behavior |
|-------|----------|
| `captcha-escalation.util.ts` | Process-local `(ip, surface) → requireCaptchaUntil`; cross-surface ≥2 → all-creates flag. TTL = `THROTTLE_TTL_MS`. |
| `CaptchaAwareThrottlerGuard` | On 429, if path is a public create → `notePublicThrottle429`. Replaces default `ThrottlerGuard` in `app.module`. |
| `public.controller` | Passes `escalated: isCaptchaEscalated(ip, surface)` into `assertCaptchaOrThrow`. |

**Safe with provider off:** map may update on 429s, but `captchaTokenRequired` stays false → public creates unchanged.

**Residual:** multi-instance Redis store; `captcha_verify_fail` metrics; live provider+secrets enable.

---

## Vendor options

| Criterion | **Cloudflare Turnstile** | **hCaptcha** |
|-----------|--------------------------|--------------|
| Cost | Free tier generous for SaaS volume | Free tier; enterprise at scale |
| UX | Managed / invisible modes; low friction | Checkbox + invisible tiers |
| Privacy | No Google; CF privacy policy | Privacy/marketing positioning |
| EU / GDPR | Widely used; document DPA with CF | DPA available |
| Nest verify | `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` | `POST https://api.hcaptcha.com/siteverify` |
| Next.js widget | `@marsidev/react-turnstile` or script tag | `@hcaptcha/react-hcaptcha` |
| Multi-tenant | **Platform keys** (Locora-operated) — venues do not bring their own keys in v1 | Same |

### Recommendation (design)

**Default pick: Turnstile** — free, low-friction managed mode, simple siteverify, fits guest public forms on Vercel + API on Render without extra billing entity.

**hCaptcha** remains a valid swap if CF terms, jurisdiction, or future enterprise bot scoring is required — verify is behind `resolveCaptchaConfig` + `verifyCaptchaToken` so provider is one env flip.

**Shipped stack:** `captcha.util.ts` verify + `public.controller` assert + web `PublicCaptchaWidget` + **MMMMM** escalation map. Default **off** → no widget / no token / assert no-op.

---

## Operator Gates 0–4 (enable CAPTCHA)

Flip only after Render smoke unblocks ([`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md)). **Never** set `THROTTLE_DISABLED=true` in production.

| Gate | Action | Exit |
|------|--------|------|
| **0** | Confirm throttles only (default) | Public creates succeed without widget; 429 after limit burst |
| **1** | Obtain Turnstile (recommended) or hCaptcha site + secret keys | Keys in password manager; DPA noted if required |
| **2** | Set **both** API + web env together | `CAPTCHA_PROVIDER` + secret on Render; `NEXT_PUBLIC_CAPTCHA_PROVIDER` + site key on Vercel; redeploy both |
| **3** | Smoke escalation path | Deliberate 429 on one surface → next create returns `CAPTCHA_REQUIRED` / widget visible; cross-surface burst requires token on all creates until TTL |
| **4** (optional) | `CAPTCHA_MODE=always` after Gate 3 soak | All public writes require token even without prior 429 — higher friction; product decision |

**Rollback:** set `CAPTCHA_PROVIDER=off` + clear web provider env → assert no-op; throttles unchanged.

---

## Residual phases (scale / future app)

| Phase | When | Scope |
|-------|------|--------|
| **3** | ≥2 API instances | Redis (or shared) escalation store — today each instance has its own Map ([`captcha-escalation.util.ts`](../../apps/api/src/common/captcha-escalation.util.ts) header comment) |
| **3b** | Ops polish | `captcha_verify_fail` counter + provider error logs (no token in logs) |
| **4** | If abuse persists | WAF / edge rate limit; honeypot on public forms; optional `CAPTCHA_MODE=always` |

**Not on disk today:** Redis escalation adapter; metrics counter; WAF rules.

---

## Remaining implementation sketch

1. **~~Web widget~~** — Lane **LLLLL** shipped (optional; off by default).
2. **~~Escalation state~~** — Lane **MMMMM** v1 in-memory; v2 = Redis if multi-instance (**residual Phase 3**).
3. **Observability:** Counter `captcha_verify_fail` + log provider errors (no token in logs) — **residual Phase 3b**.
4. **Enable:** operator Gates 1–3 — set `CAPTCHA_PROVIDER=turnstile` + secrets + `NEXT_PUBLIC_*` site key; optionally Gate 4 `CAPTCHA_MODE=always`.

**Env (keep provider off until widget + secrets):**

```env
# CAPTCHA_PROVIDER=off          # off | turnstile | hcaptcha
# CAPTCHA_MODE=after_throttle   # after_throttle | always
# TURNSTILE_SITE_KEY=
# TURNSTILE_SECRET_KEY=
# HCAPTCHA_SITE_KEY=
# HCAPTCHA_SECRET_KEY=
```

---

## Phased rollout

| Phase | When | Scope |
|-------|------|--------|
| **0** | **Now / Friday** | `PUBLIC_THROTTLE_*` only (shipped). Document known limitation. |
| **0.5** | Stub | Verify util + env (Lane **GGGGG**) — default off. |
| **0.75** | Route wire | Lane **IIIII** — assert on publicThrottle creates; still default off. |
| **1** | Widget | Lane **LLLLL** — optional Turnstile/hCaptcha UI; still default off until secrets. |
| **2** | Escalation | Lane **MMMMM** — `after_throttle` from 429 + cross-surface burst (in-memory). |
| **3** | If needed | Redis multi-instance; WAF / edge; honeypot; metrics. |

---

## Files

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_PUBLIC_ABUSE.md` | This design |
| `apps/api/src/common/captcha.util.ts`(+spec) | Verify + `readCaptchaToken` |
| `apps/api/src/common/captcha-escalation.util.ts`(+spec) | Lane **MMMMM** 429 map |
| `apps/api/src/common/captcha-throttler.guard.ts` | Lane **MMMMM** note on 429 |
| `apps/api/src/modules/public/public.controller.ts` | Assert + escalated wire |
| `apps/api/src/app.module.ts` | `CaptchaAwareThrottlerGuard` |
| Public create DTOs | optional `captchaToken` |
| Web public clients | optional `captchaToken` on body types |
| `apps/web/src/lib/public-captcha.ts` | Lane **LLLLL** resolve + `withCaptchaToken` |
| `apps/web/src/components/venues/public/public-captcha-widget.tsx` | Lane **LLLLL** widget |
| Public create forms | booking / contact / review / event / chat open |
| `apps/api/.env.example` / `.env.production.example` | `CAPTCHA_*` placeholders (keep off) |
| `apps/web/.env.example` | `NEXT_PUBLIC_CAPTCHA_*` placeholders (keep off) |
| `docs/audit/BIBLE_STATUS.md` | #26 stays **PARTIAL** — see [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) §28 shipped vs residual |
| `docs/audit/BIBLE_FINISHED.md` | Lanes KK / GGGGG / IIIII / LLLLL / MMMMM |
| `docs/audit/AGENT_COORDINATION.md` | Lane MMMMM |

**Verify (escalation):** jest `captcha-escalation` + `captcha.util`; `nest build` PASS

*Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) #26 · Finished log: [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md)*
