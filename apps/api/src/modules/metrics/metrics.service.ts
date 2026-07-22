import { Injectable } from '@nestjs/common';
import {
  formatPrometheusMetrics,
  isMetricsEndpointEnabled,
  snapshotHttpMetrics,
  type MailOutboxMetricsSnapshot,
} from '../../common/metrics.util';
import { PrismaService } from '../../prisma/prisma.service';
import { MailOutboxService } from '../mail/mail-outbox.service';

@Injectable()
export class MetricsService {
  constructor(
    private readonly outbox: MailOutboxService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return isMetricsEndpointEnabled();
  }

  async renderPrometheusText(): Promise<string> {
    const mailOutbox = await this.collectMailOutboxMetrics();
    return formatPrometheusMetrics({
      http: snapshotHttpMetrics(),
      mailOutbox,
    });
  }

  /** Hook point for Phase 4 outbox depth — reuses MailOutboxService.groupBy counts. */
  private async collectMailOutboxMetrics(): Promise<
    MailOutboxMetricsSnapshot | undefined
  > {
    const counts = await this.outbox.statusCounts();
    const oldest = await this.prisma.mailOutbox.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const oldestPendingAgeSeconds = oldest
      ? Math.max(0, Math.floor((Date.now() - oldest.createdAt.getTime()) / 1000))
      : null;
    return { counts, oldestPendingAgeSeconds };
  }
}
