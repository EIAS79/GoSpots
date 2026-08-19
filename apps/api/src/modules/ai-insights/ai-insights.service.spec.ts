import { AiInsightsService } from './ai-insights.service';
import { DeterministicInsightProvider } from './ai-insights.provider';

const actor = { sub: 'user-1', email: 'owner@example.com', shopId: 'shop-1', shopRole: 'OWNER' } as any;

function basePrisma() {
  const snapshot = {
    id: 'snapshot-1',
    shopId: 'shop-1',
    windowStart: new Date('2026-08-01T00:00:00Z'),
    windowEnd: new Date('2026-08-08T00:00:00Z'),
    metricsHash: 'hash',
  };
  return {
    analyticsFact: { findMany: jest.fn().mockResolvedValue([]) },
    ticketScan: { groupBy: jest.fn().mockResolvedValue([]) },
    rfidWallet: { aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { balanceMinor: null } }) },
    automationExecution: { count: jest.fn().mockResolvedValue(0) },
    automationDeadLetter: { count: jest.fn().mockResolvedValue(0) },
    insightSnapshot: { findUnique: jest.fn().mockResolvedValue(snapshot), create: jest.fn() },
    aiInsightRun: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'run-1', status: 'RUNNING' }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'run-1', ...data })),
      count: jest.fn().mockResolvedValue(0),
    },
    aiInsight: {
      upsert: jest.fn().mockImplementation(async ({ create }) => ({ id: 'insight-1', ...create })),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  } as any;
}

describe('AiInsightsService', () => {
  it('persists FAILED when the deterministic provider cannot generate insights', async () => {
    const prisma = basePrisma();
    const deterministic = { name: 'DETERMINISTIC', generate: jest.fn().mockRejectedValue(new Error('generator down')) } as any;
    const external = { name: 'EXTERNAL', configured: jest.fn().mockReturnValue(false), generate: jest.fn() } as any;
    const service = new AiInsightsService(prisma, deterministic, external);

    await expect(service.run(actor, { provider: 'DETERMINISTIC', windowStart: '2026-08-01T00:00:00Z', windowEnd: '2026-08-08T00:00:00Z' } as any)).rejects.toThrow('generator down');
    expect(prisma.aiInsightRun.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'run-1' }, data: expect.objectContaining({ status: 'FAILED', failureCode: 'DETERMINISTIC_PROVIDER_FAILURE' }) }));
  });

  it('degrades to deterministic insights when the external provider fails', async () => {
    const prisma = basePrisma();
    const deterministic = new DeterministicInsightProvider();
    const external = { name: 'EXTERNAL', configured: jest.fn().mockReturnValue(true), generate: jest.fn().mockRejectedValue(new Error('provider unavailable')) } as any;
    const service = new AiInsightsService(prisma, deterministic, external);
    const result = await service.run(actor, { provider: 'EXTERNAL', windowStart: '2026-08-01T00:00:00Z', windowEnd: '2026-08-08T00:00:00Z' } as any);
    expect(result.run.status).toBe('DEGRADED');
    expect(result.run.failureCode).toBe('PROVIDER_FAILURE');
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it('blocks new generation after the rolling-hour rate budget is exhausted', async () => {
    const prisma = basePrisma();
    prisma.aiInsightRun.count.mockResolvedValueOnce(30);
    const deterministic = new DeterministicInsightProvider();
    const external = { name: 'EXTERNAL', configured: jest.fn().mockReturnValue(false), generate: jest.fn() } as any;
    const service = new AiInsightsService(prisma, deterministic, external);
    await expect(service.run(actor, { provider: 'DETERMINISTIC', windowStart: '2026-08-01T00:00:00Z', windowEnd: '2026-08-08T00:00:00Z' } as any)).rejects.toThrow('limited to 30 new runs');
    expect(prisma.aiInsightRun.create).not.toHaveBeenCalled();
  });

  it('blocks external generation after the daily provider-cost budget is exhausted', async () => {
    const prisma = basePrisma();
    prisma.aiInsightRun.count.mockResolvedValueOnce(0).mockResolvedValueOnce(50);
    const deterministic = new DeterministicInsightProvider();
    const external = { name: 'EXTERNAL', configured: jest.fn().mockReturnValue(true), generate: jest.fn() } as any;
    const service = new AiInsightsService(prisma, deterministic, external);
    await expect(service.run(actor, { provider: 'EXTERNAL', windowStart: '2026-08-01T00:00:00Z', windowEnd: '2026-08-08T00:00:00Z' } as any)).rejects.toThrow('limited to 50 new runs');
    expect(external.generate).not.toHaveBeenCalled();
    expect(prisma.aiInsightRun.create).not.toHaveBeenCalled();
  });

  it('replays an existing run without consuming generation budget', async () => {
    const prisma = basePrisma();
    prisma.aiInsightRun.findUnique.mockResolvedValue({ id: 'existing-run', provider: 'EXTERNAL', status: 'SUCCEEDED' });
    prisma.aiInsight.findMany.mockResolvedValue([{ id: 'insight-1' }]);
    const deterministic = new DeterministicInsightProvider();
    const external = { name: 'EXTERNAL', configured: jest.fn().mockReturnValue(true), generate: jest.fn() } as any;
    const service = new AiInsightsService(prisma, deterministic, external);
    const result = await service.run(actor, { provider: 'EXTERNAL', windowStart: '2026-08-01T00:00:00Z', windowEnd: '2026-08-08T00:00:00Z' } as any);
    expect(result.replayed).toBe(true);
    expect(prisma.aiInsightRun.count).not.toHaveBeenCalled();
    expect(external.generate).not.toHaveBeenCalled();
  });
});
