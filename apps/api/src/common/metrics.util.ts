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
let httpDurationMsSum = 0;
let httpDurationMsCount = 0;

export function resetMetricsForTests(): void {
  httpRequests.clear();
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

/** In-process RED-ish counters — lost on restart; no OTel SDK. */
export function recordHttpRequest(
  method: string,
  statusCode: number,
  durationMs: number,
): void {
  if (!isMetricsEndpointEnabled()) return;
  const m = method.trim().toUpperCase() || 'UNKNOWN';
  const key = `${m}:${httpStatusClass(statusCode)}`;
  httpRequests.set(key, (httpRequests.get(key) ?? 0) + 1);
  httpDurationMsSum += Math.max(0, durationMs);
  httpDurationMsCount += 1;
}

export type HttpMetricsSnapshot = {
  requests: ReadonlyMap<string, number>;
  durationMsSum: number;
  durationMsCount: number;
  uptimeSeconds: number;
};

export function snapshotHttpMetrics(): HttpMetricsSnapshot {
  return {
    requests: new Map(httpRequests),
    durationMsSum: httpDurationMsSum,
    durationMsCount: httpDurationMsCount,
    uptimeSeconds: Math.floor((Date.now() - processStartedAt) / 1000),
  };
}

export type MailOutboxMetricsSnapshot = {
  counts: MailOutboxStatusCounts;
  oldestPendingAgeSeconds: number | null;
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
}): string {
  const blocks: string[] = [];

  const requestLines: string[] = [];
  for (const [key, value] of input.http.requests) {
    const [method, statusClass] = key.split(':');
    requestLines.push(
      `${'gospots_http_requests_total'}{method="${escapePrometheusLabel(method)}",status_class="${escapePrometheusLabel(statusClass)}"} ${value}`,
    );
  }
  blocks.push(
    formatCounter(
      'gospots_http_requests_total',
      'HTTP requests handled since process start',
      requestLines,
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
        `${'gospots_mail_outbox_rows'}{status="${status}"} ${count}`,
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

  return `${blocks.join('\n\n')}\n`;
}
