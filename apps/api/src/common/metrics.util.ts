import type { MailOutboxStatusCounts } from '../modules/mail/mail-outbox.types';

/** Env gate for Prometheus-style scrape endpoint (default off). */
export function isMetricsEndpointEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.METRICS_ENDPOINT?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

const processStartedAt = Date.now();
const httpRequests = new Map<string, number>();
const httpRouteRequests = new Map<string, number>();
const httpRouteDurationMsSum = new Map<string, number>();
const httpRouteDurationMsCount = new Map<string, number>();
let httpDurationMsSum = 0;
let httpDurationMsCount = 0;

export function resetMetricsForTests(): void {
  httpRequests.clear();
  httpRouteRequests.clear();
  httpRouteDurationMsSum.clear();
  httpRouteDurationMsCount.clear();
  httpDurationMsSum = 0;
  httpDurationMsCount = 0;
}

export function httpStatusClass(statusCode: number): string {
  if (statusCode >= 500) return '5xx';
  if (statusCode >= 400) return '4xx';
  if (statusCode >= 300) return '3xx';
  if (statusCode >= 200) return '2xx';
  return 'other';
}

/**
 * Keep Prometheus route labels bounded and free of tenant/customer identifiers.
 * Nest route templates are not available in the global interceptor, so path segments
 * that look like identifiers are replaced before they become labels.
 */
export function normalizeMetricRoute(path: string): string {
  const clean = String(path ?? '').split('?')[0]?.trim() || '/';
  const segments = clean.split('/').map((segment) => {
    if (!segment) return segment;
    if (/^\d+$/.test(segment)) return ':id';
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
    if (/^(?:c[a-z0-9]{20,}|[a-z0-9_-]{24,})$/i.test(segment)) return ':id';
    return segment;
  });
  return segments.join('/').slice(0, 160) || '/';
}

/** In-process RED counters. The metrics backend retains history across restarts. */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
): void {
  if (!isMetricsEndpointEnabled()) return;
  const m = method.trim().toUpperCase() || 'UNKNOWN';
  const statusClass = httpStatusClass(statusCode);
  const route = normalizeMetricRoute(path);
  const requestKey = `${m}\t${statusClass}`;
  const routeKey = `${m}\t${route}\t${statusClass}`;
  const durationKey = `${m}\t${route}`;
  const safeDuration = Math.max(0, durationMs);

  httpRequests.set(requestKey, (httpRequests.get(requestKey) ?? 0) + 1);
  httpRouteRequests.set(routeKey, (httpRouteRequests.get(routeKey) ?? 0) + 1);
  httpRouteDurationMsSum.set(
    durationKey,
    (httpRouteDurationMsSum.get(durationKey) ?? 0) + safeDuration,
  );
  httpRouteDurationMsCount.set(
    durationKey,
    (httpRouteDurationMsCount.get(durationKey) ?? 0) + 1,
  );
  httpDurationMsSum += safeDuration;
  httpDurationMsCount += 1;
}

export type HttpMetricsSnapshot = {
  requests: ReadonlyMap<string, number>;
  routeRequests: ReadonlyMap<string, number>;
  routeDurationMsSum: ReadonlyMap<string, number>;
  routeDurationMsCount: ReadonlyMap<string, number>;
  durationMsSum: number;
  durationMsCount: number;
  uptimeSeconds: number;
};

export function snapshotHttpMetrics(): HttpMetricsSnapshot {
  return {
    requests: new Map(httpRequests),
    routeRequests: new Map(httpRouteRequests),
    routeDurationMsSum: new Map(httpRouteDurationMsSum),
    routeDurationMsCount: new Map(httpRouteDurationMsCount),
    durationMsSum: httpDurationMsSum,
    durationMsCount: httpDurationMsCount,
    uptimeSeconds: Math.floor((Date.now() - processStartedAt) / 1000),
  };
}

export type MailOutboxMetricsSnapshot = {
  counts: MailOutboxStatusCounts;
  oldestPendingAgeSeconds: number | null;
};

export type OperationalMetricsSnapshot = {
  gauges: Readonly<Record<string, number>>;
  collectionErrors: number;
};

function escapePrometheusLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatCounter(name: string, help: string, lines: string[]): string {
  const out = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
  for (const line of lines) out.push(line);
  return out.join('\n');
}

function formatGauge(name: string, help: string, lines: string[]): string {
  const out = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
  for (const line of lines) out.push(line);
  return out.join('\n');
}

/** Prometheus text exposition 0.0.4 (subset — no OTel exporter). */
export function formatPrometheusMetrics(input: {
  http: HttpMetricsSnapshot;
  mailOutbox?: MailOutboxMetricsSnapshot;
  operational?: OperationalMetricsSnapshot;
}): string {
  const blocks: string[] = [];

  const requestLines: string[] = [];
  for (const [key, value] of input.http.requests) {
    const [method, statusClass] = key.split('\t');
    requestLines.push(
      `gospots_http_requests_total{method="${escapePrometheusLabel(method)}",status_class="${escapePrometheusLabel(statusClass)}"} ${value}`,
    );
  }
  blocks.push(
    formatCounter(
      'gospots_http_requests_total',
      'HTTP requests handled since process start',
      requestLines,
    ),
  );

  const routeRequestLines: string[] = [];
  for (const [key, value] of input.http.routeRequests) {
    const [method, route, statusClass] = key.split('\t');
    routeRequestLines.push(
      `gospots_http_route_requests_total{method="${escapePrometheusLabel(method)}",route="${escapePrometheusLabel(route)}",status_class="${escapePrometheusLabel(statusClass)}"} ${value}`,
    );
  }
  blocks.push(
    formatCounter(
      'gospots_http_route_requests_total',
      'HTTP requests by normalized low-cardinality route',
      routeRequestLines,
    ),
  );

  const routeDurationSumLines: string[] = [];
  const routeDurationCountLines: string[] = [];
  for (const [key, value] of input.http.routeDurationMsSum) {
    const [method, route] = key.split('\t');
    const labels = `method="${escapePrometheusLabel(method)}",route="${escapePrometheusLabel(route)}"`;
    routeDurationSumLines.push(
      `gospots_http_route_duration_ms_sum{${labels}} ${value}`,
    );
    routeDurationCountLines.push(
      `gospots_http_route_duration_ms_count{${labels}} ${input.http.routeDurationMsCount.get(key) ?? 0}`,
    );
  }
  blocks.push(
    formatCounter(
      'gospots_http_route_duration_ms_sum',
      'Sum of HTTP request durations by normalized route',
      routeDurationSumLines,
    ),
  );
  blocks.push(
    formatCounter(
      'gospots_http_route_duration_ms_count',
      'Count of HTTP request durations by normalized route',
      routeDurationCountLines,
    ),
  );

  blocks.push(
    formatGauge(
      'gospots_process_uptime_seconds',
      'API process uptime in seconds',
      [`gospots_process_uptime_seconds ${input.http.uptimeSeconds}`],
    ),
  );

  if (input.http.durationMsCount > 0) {
    blocks.push(
      formatCounter(
        'gospots_http_request_duration_ms_sum',
        'Sum of HTTP request durations in milliseconds',
        [`gospots_http_request_duration_ms_sum ${input.http.durationMsSum}`],
      ),
    );
    blocks.push(
      formatCounter(
        'gospots_http_request_duration_ms_count',
        'Count of HTTP requests with recorded duration',
        [`gospots_http_request_duration_ms_count ${input.http.durationMsCount}`],
      ),
    );
  }

  if (input.mailOutbox) {
    const gaugeLines = (
      Object.entries(input.mailOutbox.counts) as [keyof MailOutboxStatusCounts, number][]
    ).map(
      ([status, count]) =>
        `gospots_mail_outbox_rows{status="${status}"} ${count}`,
    );
    blocks.push(
      formatGauge(
        'gospots_mail_outbox_rows',
        'Mail outbox rows by DB status (global)',
        gaugeLines,
      ),
    );
    if (input.mailOutbox.oldestPendingAgeSeconds != null) {
      blocks.push(
        formatGauge(
          'gospots_mail_outbox_oldest_pending_age_seconds',
          'Age in seconds of oldest PENDING outbox row',
          [
            `gospots_mail_outbox_oldest_pending_age_seconds ${input.mailOutbox.oldestPendingAgeSeconds}`,
          ],
        ),
      );
    }
  }

  if (input.operational) {
    for (const [name, value] of Object.entries(input.operational.gauges).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!/^gospots_[a-z0-9_]+$/.test(name)) continue;
      blocks.push(formatGauge(name, `GoSpots operational gauge ${name}`, [`${name} ${value}`]));
    }
    blocks.push(
      formatGauge(
        'gospots_metrics_collection_errors',
        'Number of operational metric collectors that failed during this scrape',
        [`gospots_metrics_collection_errors ${input.operational.collectionErrors}`],
      ),
    );
  }

  return `${blocks.join('\n\n')}\n`;
}
