import { IntegrationJobStatus } from '@prisma/client';
import { IntegrationRecoveryService } from './integration-recovery.service';

describe('IntegrationRecoveryService', () => {
  it('requeues a stale processing lease without incrementing the attempt twice', async () => {
    const lockedAt = new Date(Date.now() - 20 * 60_000);
    const prisma: any = {
      integrationJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1', lockedAt, attemptCount: 1, maxAttempts: 5 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new IntegrationRecoveryService(prisma);
    await expect(service.recoverStaleJobs()).resolves.toEqual({ scanned: 1, requeued: 1, dead: 0 });
    expect(prisma.integrationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-1', status: IntegrationJobStatus.PROCESSING, lockedAt },
      data: expect.objectContaining({ status: IntegrationJobStatus.RETRY, lockedAt: null }),
    }));
  });

  it('dead-letters a stale job whose retry budget is exhausted', async () => {
    const prisma: any = {
      integrationJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-2', lockedAt: new Date(0), attemptCount: 8, maxAttempts: 8 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new IntegrationRecoveryService(prisma);
    const result = await service.recoverStaleJobs();
    expect(result.dead).toBe(1);
    expect(prisma.integrationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: IntegrationJobStatus.DEAD, nextAttemptAt: null }),
    }));
  });
});
