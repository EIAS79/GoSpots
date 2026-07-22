# Locora — Observability (Sentry / OTel)

**Date:** 2026-07-20 (design) / 2026-07-21 (Sentry ship bar — Lane **UUUUUU**) / 2026-07-22 (residual docs lane **OTEL24-residual-docs**; metrics stub **OBS24-metrics-phase**)  
**Status:** **Bible #23 / §24 PARTIAL** — Nest logs + request interceptor + optional API Sentry 5xx + health probes = **DONE** ship bar. Full OpenTelemetry (traces + metrics) and web (`apps/web`) Sentry are **explicitly deferred** — phased plan below. **No OTel SDK or exporter wired in app code today** (transitive `@opentelemetry/*` via `@sentry/node` / Next.js lockfile only).  
**Audit:** P2 §2.20 / original prompt **§24**.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Nest `Logger` across services | **DONE** | auth, billing, mail outbox, reminders, … |
| `RequestLoggingInterceptor` (method, path, status, duration, `x-request-id`, `shopId`) | **DONE** | `request-logging.interceptor.ts`; no cookies/auth/bodies |
| Health: `GET /api/v1/live`, `/health`, `/ready` (DB) | **DONE** | `health.controller.ts` |
| Optional API Sentry init (`SENTRY_DSN`, fail-open) | **DONE** | Lane V — `sentry.ts`; `main.ts` |
| Global 5xx `SentryExceptionFilter` (4xx not sent) | **DONE** | Lane Y — `sentry-exception.filter.ts` |
| PII scrub + unit tests (no network) | **DONE** | `sentry.ts`; `sentry.spec.ts` |
| Env comments in `.env.example` / `.env.production.example` | **DONE** | Lane I |
| `@sentry/nestjs` performance / tracing module | **RESIDUAL** | filter-only ship bar; no perf spans |
| Sentry performance / distributed tracing (API) | **RESIDUAL** | no `tracesSampleRate` wiring beyond env comment |
| Full OpenTelemetry SDK + OTLP exporter | **RESIDUAL** | **no app OTel bootstrap**; no collector config |
| Nest auto-instrumentation (HTTP, Prisma, pg) | **RESIDUAL** | not on disk |
| Metrics (RED/USE, custom counters) | **PARTIAL** — opt-in `GET /api/v1/metrics` stub (Lane **OBS24-metrics-phase**); no OTel SDK |
| Log correlation (`trace_id` in request logs) | **RESIDUAL** | `x-request-id` only today |
| Web Sentry (`@sentry/nextjs`, client errors, RUM) | **RESIDUAL** | **no Sentry dep in `apps/web`** |
| Dashboards / alert rules (beyond host defaults) | **RESIDUAL** | operator + vendor choice |

**§24 classification:** **PARTIAL** — Friday ship bar met (logs + optional 5xx aggregation + probes); OTel / web Sentry / deeper tracing documented here, not hidden.

---

## Problem

Audit (`GO_SPOTS_DEEP_AUDIT.md` §2.20): Nest `Logger` + `RequestLoggingInterceptor` only historically. No centralized error aggregation without an optional DSN.

## Decision (ship bar — locked)

| Option | Verdict |
|--------|---------|
| **A. Wire `@sentry/node` behind `SENTRY_DSN`** | **Done (Lane V + Y)** — init in `main.ts` via `sentry.ts`; global Nest filter reports 5xx; fail-open; PII scrub |
| **B. Full OpenTelemetry (traces + metrics)** | **Deferred** — phased plan below; needs exporter choice, sampling, and host/collector |
| **C. Docs + optional env comments** | **Done** (Lane I); kept |

### Ship bar (Lane UUUUUU)

| In scope (DONE) | Explicit non-goals / later |
|-----------------|----------------------------|
| Structured request logs + `x-request-id` | OTel SDK bootstrap |
| Optional Sentry 5xx capture | Web client Sentry |
| `/live` + `/ready` probes | Full OTel / Grafana dashboards |
| Opt-in Prometheus `/metrics` stub (`METRICS_ENDPOINT=on`) | OTel SDK bootstrap |
| PII scrub + 4xx excluded from Sentry | `@sentry/nestjs` tracing module |
| In-process HTTP counters + mail outbox gauges on `/metrics` | OTel RED histograms / log–trace correlation |

---

## What exists today (code truth)

- Nest `Logger` across services (auth, billing, mail outbox, reminders, …)
- `RequestLoggingInterceptor` — method, path, status, duration, `x-request-id`, `shopId`; **not** cookies, Authorization, bodies, or secrets
- Health: `GET /api/v1/live`, `/api/v1/health`, `/api/v1/ready` (DB)
- **Optional Sentry:** `initSentryFromEnv()` at process start — no-op without DSN; try/catch so boot never depends on Sentry
- **Unhandled / 5xx → Sentry (Lane Y):** global `SentryExceptionFilter` (`APP_FILTER`) calls `Sentry.captureException` only when status ≥ 500 **and** `Sentry.getClient()` is live (DSN configured + Lane V init succeeded). Client 4xx are **not** sent to Sentry (HTTP interceptor already logs status). Response handling stays with Nest `BaseExceptionFilter`.

**Not on disk:** `@opentelemetry/sdk-node`, OTLP exporter env vars, Nest OTel module, `apps/web` Sentry init, trace propagation middleware. **On disk (stub):** `GET /api/v1/metrics` when `METRICS_ENDPOINT=on` — Prometheus text, in-process HTTP counters, mail outbox depth gauges (no OTel SDK).

---

## Metrics stub (Phase 4 partial — Lane **OBS24-metrics-phase**)

**Trigger:** Operator wants scrape-friendly counters before standing up OTel or Sentry perf.

| Knob | Behavior |
|------|----------|
| `METRICS_ENDPOINT=on` | Enables `GET /api/v1/metrics` (Prometheus text 0.0.4) |
| default / unset | Route returns **404** (hidden) |

**Emitted series (process-local — reset on restart):**

| Metric | Type | Source |
|--------|------|--------|
| `gospots_http_requests_total{method,status_class}` | counter | `RequestLoggingInterceptor` → `recordHttpRequest` |
| `gospots_http_request_duration_ms_sum` / `_count` | counter | same hook |
| `gospots_process_uptime_seconds` | gauge | process start time |
| `gospots_mail_outbox_rows{status}` | gauge | `MailOutboxService.statusCounts()` |
| `gospots_mail_outbox_oldest_pending_age_seconds` | gauge | oldest `PENDING` row (`MetricsService`) |

**Files:** `common/metrics.util.ts`, `modules/metrics/*`, `request-logging.interceptor.ts` (counter hook only).

**Non-goals:** OTel SDK; cardinality by `shopId`; auth on scrape path (restrict at edge / internal network).

**Residual:** Alert rules (5xx rate, DEAD growth); histogram buckets; trace/log correlation; multi-instance aggregation.

---

## Env (API Sentry — shipped)

```bash
# Optional — leave unset = no Sentry (current default).
# SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
# SENTRY_ENVIRONMENT=production   # or staging / development
# SENTRY_TRACES_SAMPLE_RATE=0.1   # start low; raise only after scrubbing verified (tracing not wired — reserved)
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

---

## Residual phased plan (OTel + web Sentry)

Phases ordered by ops value vs infra cost. **Do not add OTel until Gate 0 (staging DSN smoke) passes** for the existing Sentry path — proves scrubbing before more telemetry volume.

### Phase 0 — API logs + optional Sentry 5xx (**DONE**)

- [x] `RequestLoggingInterceptor` + health probes
- [x] Optional `initSentryFromEnv` + `SentryExceptionFilter`
- [x] PII scrub + env examples + design doc
- [ ] **OPERATOR:** staging DSN smoke — force 500 → event without PII; force 404 → no Sentry event

**Exit:** Single-instance API errors visible in logs; optional Sentry for 5xx when DSN set.

### Phase 1 — Web client errors (**RESIDUAL** — `@sentry/nextjs`)

**Trigger:** Production web UX errors are invisible today (API 5xx covered; client React/hydration failures are not).

| Work | Notes |
|------|--------|
| Add `@sentry/nextjs` to `apps/web` | Fail-open init; same scrub rules as API (no cookies/tokens in events) |
| Env | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (CI source maps optional) |
| Scope | Client + server components error boundary; **not** full session replay in v1 |
| PII | Mirror API denylist; `sendDefaultPii: false`; strip query from URLs |
| Deploy | Vercel env + release tagging aligned with API `SENTRY_ENVIRONMENT` |

**Non-goals:** OTel in web; performance monitoring; user feedback widget.

**Exit:** Unhandled client exceptions appear in same Sentry project (or sibling project) with scrub verified.

### Phase 2 — API distributed tracing (Sentry-native, minimal OTel)

**Trigger:** Need request latency breakdown (DB vs outbound mail/LS) **before** standing up a full OTel collector.

| Work | Notes |
|------|--------|
| Enable Sentry tracing sample | Wire `SENTRY_TRACES_SAMPLE_RATE` in `initSentryFromEnv` (start **0.05–0.1**) |
| Nest integration | Evaluate `@sentry/nestjs` vs manual `startSpan` on hot paths only |
| Propagation | Honor incoming `sentry-trace` / `baggage` from Vercel proxy if present |
| Prisma / HTTP spans | Use Sentry's bundled OTel instrumentation (already transitive via `@sentry/node`) — no separate exporter yet |

**Non-goals:** Custom metrics; log-trace correlation; vendor lock-in beyond Sentry.

**Exit:** Slow 5xx/debug traces show DB and outbound HTTP child spans in Sentry Performance.

### Phase 3 — Full OpenTelemetry export (**RESIDUAL** — vendor-neutral)

**Trigger:** Multi-service topology (split API workers, separate job runner, or non-Sentry backend) **or** host offers managed OTLP ingest (Grafana Cloud, Honeycomb, Datadog agent, Render/Vercel OTel sidecar).

| Work | Notes |
|------|--------|
| Exporter choice | **OTLP/HTTP** default (`OTEL_EXPORTER_OTLP_ENDPOINT`); document Render vs self-hosted collector |
| SDK bootstrap | `@opentelemetry/sdk-node` **before** NestFactory (same slot as Sentry init); fail-open |
| Auto-instrumentation | `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-pg` or Prisma wrapper |
| Resource attrs | `service.name=gospots-api`, `deployment.environment`, `service.version` from git SHA |
| Sampling | Parent-based; head sample **≤10%** prod; 100% staging |
| Sentry coexistence | Either Sentry OTel bridge (`@sentry/opentelemetry`) **or** disable Sentry tracing to avoid double-export — pick one |
| Log correlation | Inject `trace_id` / `span_id` into `RequestLoggingInterceptor` when active span exists |

**Env sketch (not wired):**

```bash
# OTEL_EXPORTER_OTLP_ENDPOINT=https://...
# OTEL_SERVICE_NAME=gospots-api
# OTEL_TRACES_SAMPLER=parentbased_traceidratio
# OTEL_TRACES_SAMPLER_ARG=0.1
```

**Non-goals:** Full service mesh; custom metrics cardinality explosion; PII in span attributes.

**Exit:** Traces visible in chosen backend; request logs include trace id; no PII in span tags.

### Phase 4 — Metrics + alerting polish (**PARTIAL** — stub shipped)

**Prerequisite:** Phase 2 or 3 stable in staging (for full OTel path). **Stub lane:** in-process scrape without OTel.

| Work | Notes |
|------|--------|
| **DONE (stub)** | `METRICS_ENDPOINT=on` → `GET /api/v1/metrics` — HTTP counters + mail outbox depth gauges — Lane **OBS24-metrics-phase** |
| RED metrics | Request rate, error rate, duration histograms (OTel metrics or Sentry/custom) — **residual** beyond sum/count stub |
| Job / outbox | Mail processor lag metric — **partial** (oldest PENDING age gauge on stub) |
| Alerts | 5xx rate, `/ready` failing, outbox age — wired to Pager/Slack (operator) — **residual** |
| Runbook | Link from [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) / [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) — **residual** |

**Exit (full):** On-call can distinguish API vs DB vs mail failures without log diving + paging on SLO breach.

---

## Recommendation (when to pull which phase)

| When | Action |
|------|--------|
| **Today (single API + Vercel web)** | Logs + optional API Sentry 5xx is enough for Friday. |
| **Client errors reported but API clean** | Phase 1 web Sentry. |
| **Slow endpoints, single monolith** | Phase 2 Sentry tracing (cheaper than full OTel). |
| **≥2 services or mandated OTLP backend** | Phase 3 full OTel export. |
| **Scaling / on-call maturity** | Phase 4 metrics + alerts. |

---

## Files

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_OBSERVABILITY.md` | This design + residual plan |
| `apps/api/src/sentry.ts` | Optional init + scrub |
| `apps/api/src/main.ts` | Calls `initSentryFromEnv()` before NestFactory |
| `apps/api/src/common/sentry-exception.filter.ts` | Global `APP_FILTER` — 5xx/unexpected → `captureException` |
| `apps/api/src/common/request-logging.interceptor.ts` | Structured request logs + optional HTTP counter hook |
| `apps/api/src/app.module.ts` | Registers filter + interceptor |
| `apps/api/src/common/metrics.util.ts` | Env gate + in-process counters + Prometheus text |
| `apps/api/src/modules/metrics/metrics.controller.ts` | Opt-in `GET /metrics` |
| `apps/api/.env.example` / `.env.production.example` | Commented knobs |

## Non-goals (unchanged)

- Finance, auth, or reservations behavior changes for observability
- Mandatory Sentry/OTel (must remain optional / fail-open)
- Session replay or full RUM suite in v1
- Replacing host platform logs (Render/Vercel) — complement only

## Operator next steps

1. Staging DSN smoke (Phase 0 exit): 500 → event; 404 → no event; verify scrub
2. Only then Phase 1 web Sentry if client-side gaps matter
3. Phase 2–3 when latency debugging or multi-service topology requires it
