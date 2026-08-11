import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrintJobStatus } from '@prisma/client';
import { HardwareService } from './hardware.service';

describe('HardwareService print relay', () => {
  const headers = {} as Record<string, string | string[] | undefined>;

  function setup() {
    const prisma: any = {
      printJob: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      printerDeviceConfiguration: { findUnique: jest.fn() },
    };
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

  it('requeues a non-terminal printer failure and preserves retry budget', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'job-1', attemptCount: 2, maxAttempts: 5, claimedAt: new Date(),
    });
    prisma.printJob.update.mockResolvedValue({});

    const result = await service.edgeComplete(headers, 'job-1', {
      status: PrintJobStatus.FAILED,
      errorCode: 'PAPER_OUT',
      error: 'Paper out',
    });

    expect(result.status).toBe(PrintJobStatus.QUEUED);
    expect(prisma.printJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PrintJobStatus.QUEUED, claimedByEdgeDeviceId: null }),
    }));
  });

  it('keeps a failure terminal when max attempts are exhausted', async () => {
    const { prisma, service } = setup();
    prisma.printJob.findFirst.mockResolvedValue({
      id: 'job-1', attemptCount: 5, maxAttempts: 5, claimedAt: new Date(),
    });
    prisma.printJob.update.mockResolvedValue({});
    const result = await service.edgeComplete(headers, 'job-1', {
      status: PrintJobStatus.FAILED,
      error: 'Offline',
    });
    expect(result.status).toBe(PrintJobStatus.FAILED);
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
});
