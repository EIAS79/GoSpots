import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { IntegrationJobStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const JOB_LEASE_MS = 10 * 60_000;

@Injectable()
export class IntegrationRecoveryService {
  constructor(private readonly prisma: PrismaService) {}

  @Interval(60_000)
  async recoverStaleJobs() {
    const cutoff = new Date(Date.now() - JOB_LEASE_MS);
    const stale = await this.prisma.integrationJob.findMany({
      where: {
        status: IntegrationJobStatus.PROCESSING,
        lockedAt: { lt: cutoff },
      },
      select: {
        id: true,
        lockedAt: true,
        attemptCount: true,
        maxAttempts: true,
      },
      take: 100,
    });

    let requeued = 0;
    let dead = 0;
    for (const job of stale) {
      const exhausted = job.attemptCount >= job.maxAttempts;
      const result = await this.prisma.integrationJob.updateMany({
        where: {
          id: job.id,
          status: IntegrationJobStatus.PROCESSING,
          lockedAt: job.lockedAt,
        },
        data: {
          status: exhausted ? IntegrationJobStatus.DEAD : IntegrationJobStatus.RETRY,
          lockedAt: null,
          nextAttemptAt: exhausted ? null : new Date(),
          lastErrorCode: 'WORKER_LEASE_EXPIRED',
          lastError: exhausted
            ? 'Integration worker lease expired and the retry budget is exhausted'
            : 'Integration worker lease expired; job returned to the retry queue',
        },
      });
      if (result.count === 1) {
        if (exhausted) dead += 1;
        else requeued += 1;
      }
    }
    return { scanned: stale.length, requeued, dead };
  }
}
