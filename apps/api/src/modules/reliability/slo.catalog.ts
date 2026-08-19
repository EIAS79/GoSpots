export type Phase16Slo = {
  id: string;
  objective: string;
  window: string;
  sli: string;
  alert: string;
  notes: string;
};

/**
 * Machine-readable Phase 16 SLO contract. PromQL is intentionally stored beside
 * the objective so an SLO cannot exist as prose without a measurement source.
 */
export const PHASE16_SLOS: readonly Phase16Slo[] = [
  {
    id: 'api_availability',
    objective: '>=99.9%',
    window: '30d',
    sli: '1 - (sum(rate(gospots_http_requests_total{status_class="5xx"}[5m])) / clamp_min(sum(rate(gospots_http_requests_total[5m])), 1))',
    alert: '<0.999 for 10m',
    notes: 'Health/metrics probes are excluded from request logging; this measures user/API traffic.',
  },
  {
    id: 'checkout_latency',
    objective: '<=750ms mean',
    window: '5m',
    sli: 'sum(rate(gospots_http_route_duration_ms_sum{route=~"/api/v1/(billing/checkout|checkout/.*)"}[5m])) / clamp_min(sum(rate(gospots_http_route_duration_ms_count{route=~"/api/v1/(billing/checkout|checkout/.*)"}[5m])), 1)',
    alert: '>750 for 10m',
    notes: 'Route identifiers are normalized before label emission.',
  },
  {
    id: 'live_floor_freshness',
    objective: '<=500ms mean server refresh',
    window: '5m',
    sli: 'sum(rate(gospots_http_route_duration_ms_sum{route="/api/v1/operations/floor"}[5m])) / clamp_min(sum(rate(gospots_http_route_duration_ms_count{route="/api/v1/operations/floor"}[5m])), 1)',
    alert: '>500 for 10m',
    notes: 'The live floor reads canonical state synchronously; server refresh latency is therefore the freshness SLI.',
  },
  {
    id: 'payment_reconciliation',
    objective: 'oldest UNKNOWN <=300s',
    window: 'continuous',
    sli: 'gospots_payment_oldest_unknown_age_seconds',
    alert: '>300 for 5m',
    notes: 'UNKNOWN is never treated as failed; provider reconciliation owns resolution.',
  },
  {
    id: 'edge_sync_convergence',
    objective: 'oldest pending <=60s while cloud reachable',
    window: 'continuous',
    sli: 'gospots_edge_oldest_pending_age_seconds',
    alert: '>60 for 5m when cloud connectivity is healthy',
    notes: 'Measures durable Phase 12 Edge replay receipts, not client-side queue guesses.',
  },
  {
    id: 'kds_delivery',
    objective: 'no unacknowledged live ticket older than 120s',
    window: 'continuous',
    sli: 'gospots_kds_oldest_live_ticket_age_seconds',
    alert: '>120 for 5m',
    notes: 'This is an operational delivery/attention SLI. Prep-time performance is reported separately in analytics.',
  },
  {
    id: 'ksef_backlog_resolution',
    objective: 'oldest pending/unknown invoice <=900s outside certified outage mode',
    window: 'continuous',
    sli: 'gospots_ksef_oldest_backlog_age_seconds',
    alert: '>900 for 10m outside certified outage mode',
    notes: 'Legal special modes retain their explicit statutory deadlines and are not reclassified by this SLO.',
  },
  {
    id: 'critical_notification_delivery',
    objective: 'oldest pending outbox item <=120s',
    window: 'continuous',
    sli: 'gospots_mail_outbox_oldest_pending_age_seconds',
    alert: '>120 for 5m',
    notes: 'Critical operational email/SMS adapters ultimately use the durable provider-neutral outbox/delivery path.',
  },
] as const;
