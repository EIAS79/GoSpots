import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { withPlaySessionLifecycleCronLock } from '../../common/pg-advisory-lock.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const ENDING_WARNING_MS = 5 * 60_000;
const MAX_ROWS_PER_TICK = 1000;

@Injectable()
export class PlaySessionLifecycleService {
  private readonly logger = new Logger(PlaySessionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      const outcome = await withPlaySessionLifecycleCronLock(
        this.prisma,
        () => this.runOnce(),
      );
      if (!outcome.acquired) {
        this.logger.debug(
          'Timed walk-in lifecycle tick skipped (another instance holds cron lock)',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Timed walk-in lifecycle tick failed: ${message.split('\n')[0]}`,
      );
    }
  }

  /**
   * Public for deterministic regression tests. Production calls this through the
   * cron lock in tick().
   */
  async runOnce(at: Date = new Date()) {
    const rows = await this.prisma.playSession.findMany({
      where: {
        status: 'ACTIVE',
        reservationId: null,
        archivedAt: null,
        endedAt: null,
        durationMinutes: { gt: 0 },
      },
      select: {
        id: true,
        shopId: true,
        label: true,
        startedAt: true,
        durationMinutes: true,
        completedAt: true,
        resource: { select: { name: true } },
      },
      take: MAX_ROWS_PER_TICK,
    });

    let autoEnded = 0;
    let warnings = 0;

    for (const row of rows) {
      if (row.durationMinutes == null || row.durationMinutes <= 0) continue;
      const plannedEnd = new Date(
        row.startedAt.getTime() + row.durationMinutes * 60_000,
      );
      const label = row.label?.trim() || 'Walk-in guest';
      const unit = row.resource?.name ? ` · ${row.resource.name}` : '';

      if (plannedEnd <= at) {
        // Include duration in the claim so an extension racing this tick wins
        // safely instead of being overwritten by the old planned end.
        const claimed = await this.prisma.playSession.updateMany({
          where: {
            id: row.id,
            shopId: row.shopId,
            status: 'ACTIVE',
            reservationId: null,
            endedAt: null,
            durationMinutes: row.durationMinutes,
          },
          data: { endedAt: plannedEnd },
        });
        if (claimed.count !== 1) continue;

        autoEnded += 1;
        await this.audit.recordForShop(row.shopId, {
          section: 'finance',
          action: 'finance.play_session.auto_end',
          summary: `Auto-ended timed walk-in ${label}${unit}`,
          meta: {
            sessionId: row.id,
            plannedEnd: plannedEnd.toISOString(),
            durationMinutes: row.durationMinutes,
          },
          actorName: 'System',
        });
        if (row.completedAt == null) {
          await this.notifications.recordFinanceEvent(row.shopId, {
            title: 'Walk-in awaiting payment',
            body: `${label}${unit} finished automatically — collect payment in Game billing.`,
            href: '/play-billing?tab=awaiting_payment',
            dedupeKey: `walkin_awaiting_${row.id}`,
          });
        }
        continue;
      }

      if (row.completedAt != null) continue;
      const remainingMs = plannedEnd.getTime() - at.getTime();
      if (remainingMs > ENDING_WARNING_MS) continue;

      const dedupeKey = `walkin_end_warning:${row.id}:${plannedEnd.toISOString()}`;
      const existing = await this.prisma.notification.findFirst({
        where: { shopId: row.shopId, dedupeKey },
        select: { id: true },
      });
      if (existing) continue;

      warnings += 1;
      await this.notifications.recordFinanceEvent(row.shopId, {
        title: 'Session ending in 5 minutes',
        body: `${label}${unit} is due to finish soon. Extend it in Game billing if the guest wants more time.`,
        href: '/play-billing?tab=in_progress',
        dedupeKey,
      });
    }

    if (autoEnded || warnings) {
      this.logger.debug(
        `Timed walk-in lifecycle: ${autoEnded} auto-ended, ${warnings} warning(s)`,
      );
    }
    return { autoEnded, warnings };
  }
}
