import { PrintJobStatus } from '@prisma/client';
import { HardwareRecoveryService } from './hardware-recovery.service';
import { attachPrintIncidentTransactionMock } from './print-incident-transaction.mock';

describe('HardwareRecoveryService', () => {
  it('quarantines an expired Edge CLAIMED lease without requeue or device reassignment', async () => {
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
    attachPrintIncidentTransactionMock(prisma);
    const service = new HardwareRecoveryService(prisma);
    await expect(service.recoverStaleClaims()).resolves.toEqual({ scanned: 1, requeued: 0, failed: 0, quarantined: 1 });
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'job-1', claimedAt, claimedByEdgeDeviceId: 'edge-1' }),
      data: expect.objectContaining({ lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN' }),
    }));
  });

  it('quarantines expired PRINTING even with exhausted attempts instead of making it retryable', async () => {
    const prisma: any = {
      printJob: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'job-2', status: PrintJobStatus.PRINTING, claimedAt: new Date(0),
          claimedByEdgeDeviceId: 'edge-1', attemptCount: 5, maxAttempts: 5,
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    attachPrintIncidentTransactionMock(prisma);
    const service = new HardwareRecoveryService(prisma);
    const result = await service.recoverStaleClaims();
    expect(result).toEqual({ scanned: 1, requeued: 0, failed: 0, quarantined: 1 });
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN' }),
    }));
  });
  it('two concurrent recovery workers quarantine once; successful completion wins any later stale snapshot', async () => {
    const claimedAt = new Date(Date.now() - 20 * 60_000);
    const row = {
      id: 'race-lease', status: PrintJobStatus.PRINTING, claimedAt,
      claimedByEdgeDeviceId: 'edge-1', lastErrorCode: null as string | null,
      attemptCount: 2, maxAttempts: 5,
    };
    const staleSnapshot = { ...row };
    const prisma: any = {
      printJob: {
        findMany: jest.fn().mockImplementation(async () => [{ ...staleSnapshot }]),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          if (row.status !== where.status || row.lastErrorCode === 'EDGE_PRINT_OUTCOME_UNKNOWN')
            return { count: 0 };
          row.lastErrorCode = data.lastErrorCode;
          return { count: 1 };
        }),
      },
    };
    attachPrintIncidentTransactionMock(prisma);
    const service = new HardwareRecoveryService(prisma);
    const [a, b] = await Promise.all([service.recoverStaleClaims(), service.recoverStaleClaims()]);
    expect(a.quarantined + b.quarantined).toBe(1);
    expect(row.status).toBe(PrintJobStatus.PRINTING);
    expect(row.claimedByEdgeDeviceId).toBe('edge-1');
    expect(row.claimedAt).toBe(claimedAt);
    // A terminal callback winning the race must never be reverted by the
    // stale worker's conditional update (row stays SUCCEEDED).
    row.status = PrintJobStatus.SUCCEEDED;
    row.lastErrorCode = null;
    await expect(service.recoverStaleClaims()).resolves.toMatchObject({ quarantined: 0 });
    expect(row.status).toBe(PrintJobStatus.SUCCEEDED);
  });

});
