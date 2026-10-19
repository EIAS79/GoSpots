import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrintJobStatus } from '@prisma/client';
import { HardwareService } from './hardware.service';
import { attachPrintIncidentTransactionMock } from './print-incident-transaction.mock';

describe('HardwareService print relay', () => {
  const headers = {} as Record<string, string | string[] | undefined>;

  function setup() {
    const prisma: any = {
      printJob: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      printerDeviceConfiguration: { findUnique: jest.fn() },
    };
    attachPrintIncidentTransactionMock(prisma);
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
    const audit = { record: jest.fn() } as any;
    const edge = {
      authenticateSignedRequest: jest.fn().mockResolvedValue({
        device: { id: 'edge-1', shopId: 'shop-1' },
      }),
    } as any;
    return { prisma, edge, service: new HardwareService(prisma, flags, audit, edge) };
  }

  it('claims one queued print atomically and returns printer configuration', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'job-1', printerDeviceId: 'printer-1', status: PrintJobStatus.QUEUED,
    });
    prisma.printJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.printJob.findUnique.mockResolvedValue({
      id: 'job-1', type: 'CUSTOMER_RECEIPT', payload: { text: 'Receipt' },
      sourceType: 'GuestCheck', sourceId: 'check-1', attemptCount: 1,
      printerDeviceId: 'printer-1',
    });
    prisma.printerDeviceConfiguration.findUnique.mockResolvedValue({
      deviceId: 'printer-1', adapter: 'tcp-escpos', host: '192.0.2.10', port: 9100,
      paperWidthMm: 80, capabilities: null,
    });

    const result = await service.edgeClaim(headers);
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'job-1', status: PrintJobStatus.QUEUED }),
      data: expect.objectContaining({
        status: PrintJobStatus.CLAIMED,
        claimedByEdgeDeviceId: 'edge-1',
        attemptCount: { increment: 1 },
      }),
    }));
    expect(result.job?.printer.adapter).toBe('tcp-escpos');
  });

  it('returns no job when another Edge Hub wins the atomic claim', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({ id: 'job-1', printerDeviceId: 'printer-1' });
    prisma.printJob.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.edgeClaim(headers)).resolves.toEqual({ job: null });
    expect(prisma.printJob.findUnique).not.toHaveBeenCalled();
  });

  it('keeps ambiguous post-claim printer failures assigned for manual review without auto-requeue', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'job-1', status: PrintJobStatus.CLAIMED, attemptCount: 2, maxAttempts: 5, claimedAt: new Date(),
    });
    prisma.printJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.edgeComplete(headers, 'job-1', {
      status: PrintJobStatus.FAILED,
      errorCode: 'PAPER_OUT',
      error: 'Paper out',
    });

    expect(result.status).toBe(PrintJobStatus.CLAIMED);
    expect(result.manualReviewRequired).toBe(true);
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PrintJobStatus.CLAIMED, claimedByEdgeDeviceId: 'edge-1', lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN' }),
    }));
  });

  it('keeps exhausted ambiguous failures quarantined, not falsely marked terminal FAILED', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'job-1', status: PrintJobStatus.PRINTING, attemptCount: 5, maxAttempts: 5, claimedAt: new Date(),
    });
    prisma.printJob.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.edgeComplete(headers, 'job-1', {
      status: PrintJobStatus.FAILED,
      error: 'Offline',
    });
    expect(result.status).toBe(PrintJobStatus.PRINTING);
    expect(result.manualReviewRequired).toBe(true);
  });

  it('rejects a completion status outside the Edge success/failure contract', async () => {
    const { service } = setup();
    await expect(service.edgeComplete(headers, 'job-1', {
      status: PrintJobStatus.CANCELED as never,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses completion for a job not owned by this Edge Hub', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue(null);
    await expect(service.edgeComplete(headers, 'job-1', {
      status: PrintJobStatus.SUCCEEDED,
    })).rejects.toBeInstanceOf(ConflictException);
  });
  it('only marks a proven CLAIMED pre-I/O rejection FAILED, never QUEUED', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'preflight', status: PrintJobStatus.CLAIMED,
      claimedAt: new Date(), printingAt: null,
      attemptCount: 1, maxAttempts: 5,
    });
    prisma.printJob.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.edgeComplete(headers, 'preflight', {
      status: PrintJobStatus.FAILED,
      errorCode: 'UNSUPPORTED_PRINTER_ADAPTER',
      error: 'Typed preflight rejected adapter',
    });
    expect(result.status).toBe(PrintJobStatus.FAILED);
    expect(result.manualReviewRequired).toBeUndefined();
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: PrintJobStatus.FAILED, claimedByEdgeDeviceId: 'edge-1',
        lastErrorCode: 'UNSUPPORTED_PRINTER_ADAPTER',
      }),
    }));
  });

  it('a PRINTING job reporting UNSUPPORTED is still physically ambiguous and never requeued', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'post-output', status: PrintJobStatus.PRINTING,
      claimedAt: new Date(), printingAt: new Date(),
      attemptCount: 2, maxAttempts: 5,
    });
    prisma.printJob.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.edgeComplete(headers, 'post-output', {
      status: PrintJobStatus.FAILED,
      errorCode: 'UNSUPPORTED_PRINTER_ADAPTER',
      error: 'Printed bytes then transport raised UNSUPPORTED',
    });
    expect(result).toMatchObject({ status: PrintJobStatus.PRINTING, manualReviewRequired: true });
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: PrintJobStatus.PRINTING,
        lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN',
        claimedByEdgeDeviceId: 'edge-1',
      }),
    }));
  });

  it('blocks manual retry of legacy expired-lease failures even when claimedAt was cleared', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'legacy-uncertain', shopId: 'shop-1',
      status: PrintJobStatus.FAILED, claimedAt: null,
      lastErrorCode: 'EDGE_PRINT_LEASE_EXPIRED',
    });
    await expect(service.retryPrintJob({
      sub: 'owner', shopId: 'shop-1', shopRole: 'OWNER', perms: '*',
    } as any, 'legacy-uncertain')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.printJob.update).not.toHaveBeenCalled();
  });

  it('blocks retry of any previously claimed failed print until audited operator resolution', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'attempted', shopId: 'shop-1',
      status: PrintJobStatus.FAILED, claimedAt: new Date(),
      lastErrorCode: 'PAPER_OUT',
    });
    await expect(service.retryPrintJob({
      sub: 'owner', shopId: 'shop-1', shopRole: 'OWNER', perms: '*',
    } as any, 'attempted')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.printJob.update).not.toHaveBeenCalled();
  });

  it('two competing completion callbacks cannot overwrite a successful print with FAILED', async () => {
    const { prisma, service } = setup();
    const row = {
      id: 'concurrent-print', status: PrintJobStatus.PRINTING,
      claimedAt: new Date('2026-10-14T10:00:00Z'), claimedByEdgeDeviceId: 'edge-1',
    };
    // Both handlers read PRINTING before either makes its conditional write.
    prisma.printJob.findFirst.mockImplementation(async () => ({ ...row }));
    prisma.printJob.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (row.status !== where.status || row.claimedByEdgeDeviceId !== where.claimedByEdgeDeviceId)
        return { count: 0 };
      row.status = data.status;
      return { count: 1 };
    });
    const [success, failure] = await Promise.allSettled([
      service.edgeComplete(headers, row.id, { status: PrintJobStatus.SUCCEEDED }),
      service.edgeComplete(headers, row.id, { status: PrintJobStatus.FAILED, errorCode: 'PAPER_OUT' }),
    ]);
    expect([success.status, failure.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(row.status).toBe(PrintJobStatus.SUCCEEDED);
    expect(prisma.printJob.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: row.id, status: PrintJobStatus.PRINTING,
        claimedByEdgeDeviceId: 'edge-1', claimedAt: row.claimedAt,
      }),
    }));
  });

});
