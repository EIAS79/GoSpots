import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrintJobStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PRINT_LEASE_MS = 10 * 60_000;

@Injectable()
export class HardwareRecoveryService {
  constructor(private readonly prisma: PrismaService) {}

  @Interval(60_000)
  async recoverStaleClaims() {
    const cutoff = new Date(Date.now() - PRINT_LEASE_MS);
    const stale = await this.prisma.printJob.findMany({
      where: {
        status: { in: [PrintJobStatus.CLAIMED, PrintJobStatus.PRINTING] },
        claimedAt: { lt: cutoff },
      },
      select: {
        id: true,
        status: true,
        claimedAt: true,
        claimedByEdgeDeviceId: true,
        attemptCount: true,
        maxAttempts: true,
      },
      take: 100,
    });

    let requeued = 0;
    let failed = 0;
    for (const job of stale) {
      const exhausted = job.attemptCount >= job.maxAttempts;
      const result = await this.prisma.printJob.updateMany({
        where: {
          id: job.id,
          status: job.status,
          claimedAt: job.claimedAt,
          claimedByEdgeDeviceId: job.claimedByEdgeDeviceId,
        },
        data: {
          status: exhausted ? PrintJobStatus.FAILED : PrintJobStatus.QUEUED,
          claimedByEdgeDeviceId: null,
          claimedAt: null,
          printingAt: null,
          lastErrorCode: 'EDGE_PRINT_LEASE_EXPIRED',
          lastError: exhausted
            ? 'Edge Hub print lease expired and the retry budget is exhausted'
            : 'Edge Hub print lease expired; job returned to the queue',
        },
      });
      if (result.count === 1) {
        if (exhausted) failed += 1;
        else requeued += 1;
      }
    }
    return { scanned: stale.length, requeued, failed };
  }
}
