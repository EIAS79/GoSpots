import {
  formatPrometheusMetrics,
  httpStatusClass,
  isMetricsEndpointEnabled,
  recordHttpRequest,
  resetMetricsForTests,
  snapshotHttpMetrics,
} from './metrics.util';

describe('metrics.util', () => {
  beforeEach(() => {
    resetMetricsForTests();
    delete process.env.METRICS_ENDPOINT;
  });

  afterEach(() => {
    delete process.env.METRICS_ENDPOINT;
  });

  it('isMetricsEndpointEnabled accepts on/true/1', () => {
    expect(isMetricsEndpointEnabled({ METRICS_ENDPOINT: 'on' })).toBe(true);
    expect(isMetricsEndpointEnabled({ METRICS_ENDPOINT: 'TRUE' })).toBe(true);
    expect(isMetricsEndpointEnabled({ METRICS_ENDPOINT: '1' })).toBe(true);
    expect(isMetricsEndpointEnabled({})).toBe(false);
  });

  it('httpStatusClass buckets status codes', () => {
    expect(httpStatusClass(200)).toBe('2xx');
    expect(httpStatusClass(404)).toBe('4xx');
    expect(httpStatusClass(503)).toBe('5xx');
  });

  it('recordHttpRequest is no-op when flag off', () => {
    recordHttpRequest('GET', 200, 12);
    expect(snapshotHttpMetrics().requests.size).toBe(0);
  });

  it('recordHttpRequest aggregates when flag on', () => {
    process.env.METRICS_ENDPOINT = 'on';
    recordHttpRequest('get', 200, 10);
    recordHttpRequest('GET', 500, 30);
    const snap = snapshotHttpMetrics();
    expect(snap.requests.get('GET:2xx')).toBe(1);
    expect(snap.requests.get('GET:5xx')).toBe(1);
    expect(snap.durationMsSum).toBe(40);
    expect(snap.durationMsCount).toBe(2);
  });

  it('formatPrometheusMetrics renders counters and mail gauges', () => {
    process.env.METRICS_ENDPOINT = 'on';
    recordHttpRequest('POST', 201, 5);
    const text = formatPrometheusMetrics({
      http: snapshotHttpMetrics(),
      mailOutbox: {
        counts: {
          PENDING: 2,
          SENT: 10,
          FAILED: 0,
          DEAD: 1,
          SKIPPED: 0,
        },
        oldestPendingAgeSeconds: 90,
      },
    });
    expect(text).toContain('gospots_http_requests_total{method="POST",status_class="2xx"} 1');
    expect(text).toContain('gospots_mail_outbox_rows{status="PENDING"} 2');
    expect(text).toContain('gospots_mail_outbox_oldest_pending_age_seconds 90');
  });
});
