# GoSpots observability and SLO operations

Status: Phase 16 production contract.

## Correlation contract

- API requests receive `x-request-id`; a valid inbound ID is preserved, otherwise the API creates one.
- Request logs contain the request ID, method, path without query parameters, status and duration.
- Provider diagnostics redact bearer tokens, API/webhook secrets and never log request cookies or raw bodies.
- Durable job/domain records continue to carry the existing correlation/idempotency context owned by their modules.
- Prometheus route labels are normalized before emission so tenant/customer/entity IDs do not become metric labels.

Primary code: `apps/api/src/common/request-logging.interceptor.ts`, `apps/api/src/common/metrics.util.ts`.

## Scrape contract

`GET /api/v1/metrics` is disabled unless `METRICS_ENDPOINT=on|true|1`. Production should expose it only through infrastructure access controls.

Required telemetry:

| Requirement | Metric/evidence |
|---|---|
| request count / error rate | `gospots_http_requests_total{method,status_class}` |
| route latency | `gospots_http_route_duration_ms_sum/count{method,route}` |
| DB latency | `gospots_db_query_latency_ms` |
| job/notification queue | `gospots_mail_outbox_rows`, `gospots_mail_outbox_oldest_pending_age_seconds` |
| payment unknown | `gospots_payment_unknown`, `gospots_payment_oldest_unknown_age_seconds` |
| provider failures | `gospots_provider_failures_24h` |
| fiscal failures | `gospots_fiscal_failures` |
| KSeF backlog | `gospots_ksef_backlog`, `gospots_ksef_oldest_backlog_age_seconds` |
| Edge sync backlog | `gospots_edge_sync_backlog`, `gospots_edge_oldest_pending_age_seconds` |
| print failures | `gospots_print_failures` |
| KDS lag/attention | `gospots_kds_oldest_live_ticket_age_seconds` |
| inventory exceptions | `gospots_inventory_negative_balances` |
| login failures | `gospots_login_failures_current`, `gospots_locked_accounts` |
| collector integrity | `gospots_metrics_collection_errors` must be `0` |

Operational gauges are calculated from canonical durable domain records. A failed collector increments `gospots_metrics_collection_errors`; it is not converted into a false zero.

## SLO catalog

The executable source is `apps/api/src/modules/reliability/slo.catalog.ts`; authorized operators can read the same contract from `GET /api/v1/reliability/slos`.

| SLO | Objective | SLI |
|---|---|---|
| API availability | >= 99.9% / 30d | non-5xx ratio from request counters |
| checkout latency | <= 750 ms mean / 5m | normalized checkout route duration |
| live floor freshness | <= 500 ms mean server refresh / 5m | `/api/v1/operations/floor` duration |
| payment reconciliation | oldest unresolved `UNKNOWN` <= 300 s | payment-operation backlog age |
| Edge convergence | oldest pending replay <= 60 s while cloud healthy | Phase 12 durable replay age |
| KDS delivery/attention | no live ticket older than 120 s | oldest live prep-ticket age |
| KSeF backlog resolution | <= 900 s outside certified outage mode | oldest pending/unknown invoice age |
| critical notification delivery | pending outbox <= 120 s | oldest mail-outbox pending age |

KSeF certified outage/special modes retain their legal submission deadlines and are not reclassified by the generic SLO.

## Alert discipline

1. Alert on sustained objective breach, not a single scrape.
2. Include the request/correlation ID and canonical entity links where available.
3. Do not retry `PaymentOperation=UNKNOWN` blindly; use reconciliation.
4. Do not manually edit database rows to clear an alert.
5. A non-zero `gospots_metrics_collection_errors` is itself a monitoring incident because other gauges may be absent.

## Validation

Blocking Phase 16 validation:

- unit tests lock the required eight SLOs and metric label privacy;
- the compiled API is started against PostgreSQL 17;
- `/metrics` must expose every required operational gauge;
- `gospots_metrics_collection_errors` must equal zero;
- the fault drill pauses PostgreSQL and proves liveness/readiness semantics and recovery.
