import { Phase15DeterministicInsightsService } from './phase15-deterministic-insights.service';

const actor = { sub: 'owner-1', shopId: 'shop-1', shopRole: 'OWNER' } as any;

function workspace() {
  return {
    resources: { utilizationPct: 24 },
    inventory: { variance: { costMinor: -12000, quantityMilli: -2000 } },
    reservations: { noShowRatePct: 35 },
    restaurant: { kds: { slaPct: 55 } },
    financial: { currencies: [{ currency: 'PLN', netSalesMinor: 90000, refundsMinor: 10000 }] },
    attention: { items: [{ id: 'device-1', domain: 'DEVICE', title: 'DEVICE_OFFLINE', detail: 'Terminal offline' }] },
  };
}

describe('Phase15DeterministicInsightsService', () => {
  it('derives evidence-backed alerts from canonical Phase 14 facts', async () => {
    const analytics = { workspace: jest.fn().mockResolvedValue(workspace()) } as any;
    const capabilities = { snapshot: jest.fn().mockResolvedValue({ canUseAiInsights: true }) } as any;
    const service = new Phase15DeterministicInsightsService(analytics, capabilities);
    const result = await service.generate(actor, { fromDate: '2026-08-01', toDate: '2026-08-01' });
    expect(result.generatedBy).toBe('DETERMINISTIC_INSIGHT_ENGINE');
    expect(result.insights.map((row) => row.type)).toEqual(expect.arrayContaining([
      'LOW_RESOURCE_UTILIZATION', 'STOCK_VARIANCE', 'NO_SHOW_RATE_RISING', 'KDS_PREP_DEGRADATION', 'DEVICE_OUTAGE', 'REFUND_RATE_ELEVATED',
    ]));
    for (const insight of result.insights) {
      expect(insight.evidence.dataScope).toMatchObject({ shopId: 'shop-1', tenantScoped: true });
      expect(insight.evidence.metric).toEqual(expect.any(String));
      expect(insight.evidence.limitations).toEqual(expect.any(Array));
    }
  });
});
