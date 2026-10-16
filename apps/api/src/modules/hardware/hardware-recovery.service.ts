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
        OR: [
          { lastErrorCode: null },
          { lastErrorCode: { not: 'EDGE_PRINT_OUTCOME_UNKNOWN' } },
        ],
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

    let quarantined = 0;
    for (const job of stale) {
      const result = await this.prisma.printJob.updateMany({
        where: {
          id: job.id,
          status: job.status,
          claimedAt: job.claimedAt,
          claimedByEdgeDeviceId: job.claimedByEdgeDeviceId,
          // Competing recovery workers must not quarantine the same lease
          // twice or overwrite diagnostics from a newer completion.
          OR: [
            { lastErrorCode: null },
            { lastErrorCode: { not: 'EDGE_PRINT_OUTCOME_UNKNOWN' } },
          ],
        },
        data: {
          // No terminal status or device release: physical output may already
          // exist, even when the cloud state is still CLAIMED.
          lastErrorCode: 'EDGE_PRINT_OUTCOME_UNKNOWN',
          lastError: 'Edge print lease expired; physical output is unknown. Operator review required; automatic reassignment blocked.',
        },
      });
      if (result.count === 1) quarantined += 1;
    }
    return { scanned: stale.length, requeued: 0, failed: 0, quarantined };
  }
}
