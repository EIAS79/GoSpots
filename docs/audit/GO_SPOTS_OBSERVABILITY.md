# Locora — Observability (Sentry / OTel)

**Date:** 2026-07-20  
**Status:** **Optional Sentry wired** (Lane V init + Lane Y Nest 5xx filter). **Bible #23 DONE** (Lane **UUUUUU**) for Nest logs + request interceptor + optional Sentry 5xx + health probes. Full OpenTelemetry still deferred residual.

## Problem

Audit (`GO_SPOTS_DEEP_AUDIT.md` §2.20): Nest `Logger` + `RequestLoggingInterceptor` only historically. No centralized error aggregation without an optional DSN.

## Decision

| Option | Verdict |
|--------|---------|
| **A. Wire `@sentry/node` behind `SENTRY_DSN`** | **Done (Lane V + Y)** — init in `main.ts` via `sentry.ts`; global Nest filter reports 5xx; fail-open; PII scrub |
| **B. Full OpenTelemetry (traces + metrics)** | Deferred — needs exporter choice, sampling, and host/collector; not Friday-critical |
| **C. Docs + optional env comments** | Done earlier (Lane I); kept |

## What exists today

- Nest `Logger` across services (auth, billing, mail outbox, reminders, …)
- `RequestLoggingInterceptor` — method, path, status, duration, `x-request-id`, `shopId`; **not** cookies, Authorization, bodies, or secrets
- Health: `GET /api/v1/live`, `/api/v1/health`, `/api/v1/ready` (DB)
- **Optional Sentry:** `initSentryFromEnv()` at process start — no-op without DSN; try/catch so boot never depends on Sentry
- **Unhandled / 5xx → Sentry (Lane Y):** global `SentryExceptionFilter` (`APP_FILTER`) calls `Sentry.captureException` only when status ≥ 500 **and** `Sentry.getClient()` is live (DSN configured + Lane V init succeeded). Client 4xx are **not** sent to Sentry (HTTP interceptor already logs status). Response handling stays with Nest `BaseExceptionFilter`.

## Env

```bash
# Optional — leave unset = no Sentry (current default).
# SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
# SENTRY_ENVIRONMENT=production   # or staging / development
# SENTRY_TRACES_SAMPLE_RATE=0.1   # start low; raise only after scrubbing verified
```

Documented in `apps/api/.env.example` and `.env.production.example`. Do **not** put a real DSN in git.

## Capture / scrub (wired)

**Do capture**

- Unhandled exceptions with stack (SDK defaults + Nest filter for thrown 5xx)
- Nest `HttpException` with status ≥ 500 via `SentryExceptionFilter`
- Request method / scrubbed URL (query stripped); headers with cookie/auth redacted
- `user.id` only when present — never email / IP

**Do not capture (PII / secrets scrub + noise)**

- **4xx HttpExceptions** (validation, auth, not-found) — Nest/HTTP logs only; no Sentry event
- Cookies, `Authorization`, `x-csrf-token`
- Request bodies / `data`
- Query strings (status tokens, magic links)
- Nested keys matching email / phone / password / token / secret / api_key / jwt / csrf
- `sendDefaultPii: false`

Scrub helpers live in `apps/api/src/sentry.ts` and are unit-tested in `sentry.spec.ts` (no network).

## OpenTelemetry — defer

Full OTel (SDK + OTLP exporter + dashboards) is out of scope until product needs cross-service latency or the host already offers a collector.

## Files

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_OBSERVABILITY.md` | This design |
| `apps/api/src/sentry.ts` | Optional init + scrub |
| `apps/api/src/main.ts` | Calls `initSentryFromEnv()` before NestFactory |
| `apps/api/src/common/sentry-exception.filter.ts` | Global `APP_FILTER` — 5xx/unexpected → `captureException` |
| `apps/api/src/app.module.ts` | Registers `SentryExceptionFilter` |
| `apps/api/.env.example` / `.env.production.example` | Commented knobs |

## Non-goals

- Full `@sentry/nestjs` performance / tracing module (filter-only is enough for Friday)
- OTel packages or collector config
- Web (`apps/web`) Sentry
- Changes to finance, auth, or reservations

## Next

1. Staging DSN smoke: force 500 → event arrives without PII; force 404 → no Sentry event
2. Only then consider OTel traces if product needs cross-service latency
