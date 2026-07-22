import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { withMailOutboxCronLock } from '../../common/pg-advisory-lock.util';
import { PrismaService } from '../../prisma/prisma.service';
import { MailOutboxService } from './mail-outbox.service';
import { MailService } from './mail.service';
import { MAIL_OUTBOX_BATCH_SIZE } from './mail-outbox.types';

/**
 * Minute cron: claim due PENDING/FAILED outbox rows (advisory lock) and retry
 * via MailService.deliverPayload. Does not rewrite auth/finance/reservations.
 */
@Injectable()
export class MailOutboxProcessor {
  private readonly logger = new Logger(MailOutboxProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: MailOutboxService,
    private readonly mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      const outcome = await withMailOutboxCronLock(this.prisma, async () => {
        return this.processDue(MAIL_OUTBOX_BATCH_SIZE);
      });
      if (!outcome.acquired) {
        this.logger.debug(
          'Mail outbox tick skipped (another instance holds cron lock)',
        );
        return;
      }
      if (outcome.result > 0) {
        this.logger.log(`Mail outbox tick processed ${outcome.result} row(s)`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('does not exist')) {
        this.logger.warn(
          `Mail outbox skipped (DB schema out of date): ${message.split('\n')[0]}`,
        );
        return;
      }
      this.logger.warn(`Mail outbox tick failed: ${message.split('\n')[0]}`);
    }
  }

  /** Process up to `limit` due rows. Exported for tests. */
  async processDue(limit = MAIL_OUTBOX_BATCH_SIZE): Promise<number> {
    const now = new Date();
    const rows = await this.prisma.mailOutbox.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: Math.max(1, Math.min(limit, 100)),
      select: { id: true },
    });

    let processed = 0;
    for (const row of rows) {
      const ok = await this.processOne(row.id);
      if (ok) processed += 1;
    }
    return processed;
  }

  private async processOne(id: string): Promise<boolean> {
    const payload = await this.outbox.getPayload(id);
    if (!payload) {
      await this.outbox.markFailed(id, new Error('Invalid outbox payload'));
      return true;
    }

    const intent = {
      to: payload.to,
      subject: payload.subject,
      required: payload.required,
    };

    try {
      const result = await this.mail.deliverPayload(payload);
      if (result.sent) {
        await this.outbox.markSent(id, intent);
      } else {
        await this.outbox.markSkipped(id, intent);
      }
      return true;
    } catch (error) {
      await this.outbox.markFailed(id, error, intent);
      return true;
    }
  }
}
