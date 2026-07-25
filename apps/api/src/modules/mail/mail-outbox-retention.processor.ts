import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { withMailOutboxRetentionCronLock } from '../../common/pg-advisory-lock.util';
import { PrismaService } from '../../prisma/prisma.service';
import { MailOutboxService } from './mail-outbox.service';
import { MAIL_OUTBOX_SENT_RETENTION_DAYS_DEFAULT } from './mail-outbox.types';

/**
 * Daily retention sweep: delete old SENT mail outbox rows (payload holds PII).
 *
 * Disabled by default — enable with MAIL_OUTBOX_SENT_RETENTION_CRON=on.
 * Uses existing `sentAt`; no schema changes.
 */
@Injectable()
export class MailOutboxRetentionProcessor {
  private readonly logger = new Logger(MailOutboxRetentionProcessor.name);
  private schemaOutOfDateLogged = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly outbox: MailOutboxService,
  ) {}

  private enabled(): boolean {
    const raw = this.config
      .get<string>('MAIL_OUTBOX_SENT_RETENTION_CRON')
      ?.trim()
      .toLowerCase();
    return raw === 'on' || raw === 'true' || raw === '1';
  }

  private retentionDays(): number {
    const raw = this.config.get<string>('MAIL_OUTBOX_SENT_RETENTION_DAYS');
    if (raw == null || raw.trim() === '') {
      return MAIL_OUTBOX_SENT_RETENTION_DAYS_DEFAULT;
    }
    const parsed = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return MAIL_OUTBOX_SENT_RETENTION_DAYS_DEFAULT;
    }
    return Math.min(parsed, 3650);
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async tick() {
    if (!this.enabled()) return;

    try {
      const days = this.retentionDays();
      const outcome = await withMailOutboxRetentionCronLock(
        this.prisma,
        () => this.runRetentionPass(days),
        { timeout: 120_000 },
      );

      if (!outcome.acquired) {
        this.logger.debug(
          'Mail outbox SENT retention skipped (another instance holds cron lock)',
        );
        return;
      }

      const { deleted, cutoff } = outcome.result;
      if (deleted > 0) {
        this.logger.log(
          `Mail outbox SENT retention: deleted ${deleted} row(s) with sentAt before ${cutoff}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('does not exist')) {
        if (!this.schemaOutOfDateLogged) {
          this.schemaOutOfDateLogged = true;
          this.logger.warn(
            `Mail outbox SENT retention skipped (DB schema out of date — run prisma migrate). Further skips are silent. ${message.split('\n')[0]}`,
          );
        }
        return;
      }
      this.logger.warn(
        `Mail outbox SENT retention failed: ${message.split('\n')[0]}`,
      );
    }
  }

  /** Exposed for unit tests. */
  async runRetentionPass(
    olderThanDays = MAIL_OUTBOX_SENT_RETENTION_DAYS_DEFAULT,
    now = new Date(),
  ) {
    return this.outbox.purgeSentRows({ olderThanDays, now });
  }
}
