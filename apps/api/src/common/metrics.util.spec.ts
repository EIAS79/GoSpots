import {
  formatPrometheusMetrics,
  normalizeMetricRoute,
  recordHttpRequest,
  resetMetricsForTests,
  snapshotHttpMetrics,
} from './metrics.util';

describe('Phase 16 metrics', () => {
  const original = process.env.METRICS_ENDPOINT;

  beforeEach(() => {
    process.env.METRICS_ENDPOINT = 'on';
    resetMetricsForTests();
  });

  afterAll(() => {
    if (original === undefined) delete process.env.METRICS_ENDPOINT;
    else process.env.METRICS_ENDPOINT = original;
  });

  it('normalizes identifiers before route labels are stored', () => {
    expect(
      normalizeMetricRoute(
        '/api/v1/checkout/settlements/123e4567-e89b-12d3-a456-426614174000/payments?token=secret',
      ),
    ).toBe('/api/v1/checkout/settlements/:id/payments');
  });

  it('renders route latency, status and operational gauges', () => {
    recordHttpRequest('post', '/api/v1/checkout/settlements/123456789012345678901234/payments', 200, 42);
    recordHttpRequest('post', '/api/v1/checkout/settlements/123456789012345678901234/payments', 500, 58);
    const text = formatPrometheusMetrics({
      http: snapshotHttpMetrics(),
      operational: {
        gauges: { gospots_payment_unknown: 2 },
        collectionErrors: 0,
      },
    });

    expect(text).toContain('route="/api/v1/checkout/settlements/:id/payments"');
    expect(text).toContain('status_class="2xx"');
    expect(text).toContain('status_class="5xx"');
    expect(text).toContain('gospots_http_route_duration_ms_sum');
    expect(text).toContain('gospots_payment_unknown 2');
    expect(text).toContain('gospots_metrics_collection_errors 0');
    expect(text).not.toContain('123456789012345678901234');
  });
});
