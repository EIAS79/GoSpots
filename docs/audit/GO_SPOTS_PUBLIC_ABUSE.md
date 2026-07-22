# Locora — Public abuse & CAPTCHA escalation

**Date:** 2026-07-21  
**Status:** Design + **verify util** (GGGGG) + **route wire** (IIIII) + **widget** (LLLLL) + **429 escalation map** (MMMMM). Rate limits **shipped** (BB).  
**Bible:** P2 **#26** — public endpoints need stronger abuse controls. Parent stays **PARTIAL** (throttles + assert + optional widget + escalation; CAPTCHA vendor not live — keep `CAPTCHA_PROVIDER=off`).
**Ship timing:** Keep `CAPTCHA_PROVIDER=off` for Friday. Env `PUBLIC_THROTTLE_*` + global/auth limits are the submit bar.

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

## Remaining implementation sketch

1. **~~Web widget~~** — Lane **LLLLL** shipped (optional; off by default).
2. **~~Escalation state~~** — Lane **MMMMM** v1 in-memory; v2 = Redis if multi-instance.
3. **Observability:** Counter `captcha_verify_fail` + log provider errors (no token in logs).
4. **Enable:** set `CAPTCHA_PROVIDER=turnstile` + secrets + `NEXT_PUBLIC_*` site key only when ready; optionally `CAPTCHA_MODE=always`.

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
| `docs/audit/BIBLE_STATUS.md` | #26 stays **PARTIAL** |
| `docs/audit/BIBLE_FINISHED.md` | Lanes KK / GGGGG / IIIII / LLLLL / MMMMM |
| `docs/audit/AGENT_COORDINATION.md` | Lane MMMMM |

**Verify (escalation):** jest `captcha-escalation` + `captcha.util`; `nest build` PASS

*Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) #26 · Finished log: [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md)*
