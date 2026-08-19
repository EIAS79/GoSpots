import { PHASE16_SLOS } from './slo.catalog';

describe('Phase 16 SLO catalog', () => {
  it('defines every required SLO exactly once with an executable measurement', () => {
    const expected = [
      'api_availability',
      'checkout_latency',
      'live_floor_freshness',
      'payment_reconciliation',
      'edge_sync_convergence',
      'kds_delivery',
      'ksef_backlog_resolution',
      'critical_notification_delivery',
    ];
    expect(PHASE16_SLOS.map((slo) => slo.id).sort()).toEqual(expected.sort());
    expect(new Set(PHASE16_SLOS.map((slo) => slo.id)).size).toBe(PHASE16_SLOS.length);
    for (const slo of PHASE16_SLOS) {
      expect(slo.objective.trim()).not.toBe('');
      expect(slo.window.trim()).not.toBe('');
      expect(slo.sli).toMatch(/gospots_/);
      expect(slo.alert.trim()).not.toBe('');
    }
  });
});
