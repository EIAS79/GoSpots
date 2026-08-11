import { PrintJobStatus } from '@prisma/client';
import { HardwareRecoveryService } from './hardware-recovery.service';

describe('HardwareRecoveryService', () => {
  it('requeues an expired Edge claim while retries remain', async () => {
    const claimedAt = new Date(Date.now() - 20 * 60_000);
    const prisma: any = {
      printJob: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'job-1', status: PrintJobStatus.CLAIMED, claimedAt,
          claimedByEdgeDeviceId: 'edge-1', attemptCount: 2, maxAttempts: 5,
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new HardwareRecoveryService(prisma);
    await expect(service.recoverStaleClaims()).resolves.toEqual({ scanned: 1, requeued: 1, failed: 0 });
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'job-1', claimedAt, claimedByEdgeDeviceId: 'edge-1' }),
      data: expect.objectContaining({ status: PrintJobStatus.QUEUED, claimedAt: null }),
    }));
  });

  it('fails an expired Edge claim when retry budget is exhausted', async () => {
    const prisma: any = {
      printJob: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'job-2', status: PrintJobStatus.PRINTING, claimedAt: new Date(0),
          claimedByEdgeDeviceId: 'edge-1', attemptCount: 5, maxAttempts: 5,
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new HardwareRecoveryService(prisma);
    const result = await service.recoverStaleClaims();
    expect(result.failed).toBe(1);
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PrintJobStatus.FAILED }),
    }));
  });
});
