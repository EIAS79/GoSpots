import { Injectable } from '@nestjs/common';
import {
  ComplianceDocumentKind,
  ComplianceDocumentState,
  PaymentOperationState,
  Prisma,
  PrintJobStatus,
} from '@prisma/client';
import {
  formatPrometheusMetrics,
  isMetricsEndpointEnabled,
  snapshotHttpMetrics,
  type MailOutboxMetricsSnapshot,
  type OperationalMetricsSnapshot,
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
    const [mailOutbox, operational] = await Promise.all([
      this.collectMailOutboxMetrics(),
      this.collectOperationalMetrics(),
    ]);
    return formatPrometheusMetrics({
      http: snapshotHttpMetrics(),
      mailOutbox,
      operational,
    });
  }

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

  /**
   * Phase 16 operational telemetry is deliberately derived from canonical durable
   * domain facts. A failed collector is visible via gospots_metrics_collection_errors;
   * it must never be converted into a misleading zero.
   */
  private async collectOperationalMetrics(): Promise<OperationalMetricsSnapshot> {
    const gauges: Record<string, number> = {};
    let collectionErrors = 0;
    const collect = async (name: string, loader: () => Promise<number>) => {
      try {
        const value = await loader();
        if (!Number.isFinite(value)) throw new Error('metric is not finite');
        gauges[name] = value;
      } catch {
        collectionErrors += 1;
      }
    };
    const ageSeconds = (date: Date | null | undefined) =>
      date ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000)) : 0;

    await Promise.all([
      collect('gospots_db_query_latency_ms', async () => {
        const started = performance.now();
        await this.prisma.$queryRaw`SELECT 1`;
        return Math.max(0, performance.now() - started);
      }),
      collect('gospots_payment_unknown', () =>
        this.prisma.paymentOperation.count({
          where: {
            state: PaymentOperationState.UNKNOWN,
            reconciliationRequired: true,
          },
        }),
      ),
      collect('gospots_payment_oldest_unknown_age_seconds', async () => {
        const oldest = await this.prisma.paymentOperation.findFirst({
          where: {
            state: PaymentOperationState.UNKNOWN,
            reconciliationRequired: true,
          },
          orderBy: { updatedAt: 'asc' },
          select: { updatedAt: true },
        });
        return ageSeconds(oldest?.updatedAt);
      }),
      collect('gospots_provider_failures_24h', () =>
        this.prisma.paymentOperation.count({
          where: {
            state: PaymentOperationState.FAILED,
            updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
      ),
      collect('gospots_fiscal_failures', () =>
        this.prisma.complianceDocument.count({
          where: {
            state: {
              in: [
                ComplianceDocumentState.REJECTED,
                ComplianceDocumentState.UNKNOWN,
                ComplianceDocumentState.DISABLED,
              ],
            },
          },
        }),
      ),
      collect('gospots_ksef_backlog', () =>
        this.prisma.complianceDocument.count({
          where: {
            kind: ComplianceDocumentKind.INVOICE,
            state: {
              in: [
                ComplianceDocumentState.PENDING,
                ComplianceDocumentState.SUBMITTED,
                ComplianceDocumentState.UNKNOWN,
              ],
            },
          },
        }),
      ),
      collect('gospots_ksef_oldest_backlog_age_seconds', async () => {
        const oldest = await this.prisma.complianceDocument.findFirst({
          where: {
            kind: ComplianceDocumentKind.INVOICE,
            state: {
              in: [
                ComplianceDocumentState.PENDING,
                ComplianceDocumentState.SUBMITTED,
                ComplianceDocumentState.UNKNOWN,
              ],
            },
          },
          orderBy: { updatedAt: 'asc' },
          select: { updatedAt: true },
        });
        return ageSeconds(oldest?.updatedAt);
      }),
      collect('gospots_edge_sync_backlog', () =>
        this.prisma.idempotencyReceipt.count({
          where: {
            scope: { in: ['offline.edge.phase12.v1', 'offline.edge.cash.v1'] },
            status: 'PENDING',
          },
        }),
      ),
      collect('gospots_edge_oldest_pending_age_seconds', async () => {
        const oldest = await this.prisma.idempotencyReceipt.findFirst({
          where: {
            scope: { in: ['offline.edge.phase12.v1', 'offline.edge.cash.v1'] },
            status: 'PENDING',
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        return ageSeconds(oldest?.createdAt);
      }),
      collect('gospots_print_failures', () =>
        this.prisma.printJob.count({ where: { status: PrintJobStatus.FAILED } }),
      ),
      collect('gospots_kds_oldest_live_ticket_age_seconds', async () => {
        const oldest = await this.prisma.prepTicket.findFirst({
          where: { status: { in: ['NEW', 'PREPARING', 'READY'] } },
          orderBy: { openedAt: 'asc' },
          select: { openedAt: true },
        });
        return ageSeconds(oldest?.openedAt);
      }),
      collect('gospots_login_failures_current', async () => {
        const result = await this.prisma.user.aggregate({
          where: { failedLogins: { gt: 0 } },
          _sum: { failedLogins: true },
        });
        return result._sum.failedLogins ?? 0;
      }),
      collect('gospots_locked_accounts', () =>
        this.prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      ),
      collect('gospots_inventory_negative_balances', async () => {
        const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "count"
          FROM (
            SELECT "shopId", "stockItemId", "locationId"
            FROM "StockMovement"
            GROUP BY "shopId", "stockItemId", "locationId"
            HAVING SUM("quantityMilli") < 0
          ) AS negative_balances
        `);
        return Number(rows[0]?.count ?? 0n);
      }),
    ]);

    return { gauges, collectionErrors };
  }
}
