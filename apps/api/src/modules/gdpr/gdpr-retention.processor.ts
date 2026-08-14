import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { withGdprRetentionCronLock } from '../../common/pg-advisory-lock.util';
import { PrismaService } from '../../prisma/prisma.service';

const REDACTED = '[redacted]';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Retention windows (operator-reviewed defaults). */
export const GDPR_RETENTION = {
  reservationMonths: 24,
  contactMonths: 12,
  guestChatMonths: 12,
  reviewMonths: 36,
  auditMonths: 24,
  analyticsMonths: 13,
  authSessionGraceDays: 7,
} as const;

function monthsAgo(months: number, now = new Date()): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/**
 * Daily retention sweep: redact aged guest PII, strip old audit identifiers,
 * delete old analytics, hard-delete expired auth sessions.
 * Money rows are never deleted.
 *
 * Disable with GDPR_RETENTION_CRON=off.
 */
@Injectable()
export class GdprRetentionProcessor {
  private readonly logger = new Logger(GdprRetentionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private enabled(): boolean {
    const raw = this.config
      .get<string>('GDPR_RETENTION_CRON')
      ?.trim()
      .toLowerCase();
    if (raw === 'off' || raw === 'false' || raw === '0') return false;
    return true;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async tick() {
    if (!this.enabled()) return;

    const outcome = await withGdprRetentionCronLock(
      this.prisma,
      () => this.runRetentionPass(),
      { timeout: 120_000 },
    );

    if (!outcome.acquired) {
      this.logger.debug('GDPR retention skipped — lock not acquired');
      return;
    }

    this.logger.log(`GDPR retention pass: ${JSON.stringify(outcome.result)}`);
  }

  /** Exposed for unit tests. */
  async runRetentionPass(now = new Date()) {
    const reservationCutoff = monthsAgo(GDPR_RETENTION.reservationMonths, now);
    const contactCutoff = monthsAgo(GDPR_RETENTION.contactMonths, now);
    const chatCutoff = monthsAgo(GDPR_RETENTION.guestChatMonths, now);
    const reviewCutoff = monthsAgo(GDPR_RETENTION.reviewMonths, now);
    const auditCutoff = monthsAgo(GDPR_RETENTION.auditMonths, now);
    const analyticsCutoff = monthsAgo(GDPR_RETENTION.analyticsMonths, now);
    const sessionCutoff = new Date(
      now.getTime() - GDPR_RETENTION.authSessionGraceDays * DAY_MS,
    );

    const tokenRevoke = {
      guestToken: null as string | null,
      guestTokenHash: null as string | null,
      guestTokenExpiresAt: null as Date | null,
      guestTokenRevokedAt: new Date(),
    };

    const reservations = await this.prisma.reservation.updateMany({
      where: {
        endsAt: { lt: reservationCutoff },
        status: { in: ['COMPLETED', 'CANCELED', 'NO_SHOW'] },
        NOT: { guestName: REDACTED },
      },
      data: {
        guestName: REDACTED,
        guestEmail: null,
        guestPhone: null,
        notes: null,
        ...tokenRevoke,
        version: { increment: 1 },
      },
    });

    const eventRequests = await this.prisma.eventRequest.updateMany({
      where: {
        createdAt: { lt: reservationCutoff },
        status: { in: ['APPROVED', 'DECLINED', 'CANCELED'] },
        NOT: { guestName: REDACTED },
      },
      data: {
        guestName: REDACTED,
        guestEmail: null,
        guestPhone: null,
        message: null,
        ...tokenRevoke,
      },
    });

    const contacts = await this.prisma.contactMessage.updateMany({
      where: {
        createdAt: { lt: contactCutoff },
        NOT: { guestName: REDACTED },
      },
      data: {
        guestName: REDACTED,
        guestEmail: null,
        guestPhone: null,
        subject: null,
        message: REDACTED,
      },
    });

    const reviews = await this.prisma.venueReview.updateMany({
      where: {
        createdAt: { lt: reviewCutoff },
        NOT: { guestName: REDACTED },
      },
      data: {
        guestName: REDACTED,
        guestEmail: null,
        comment: null,
      },
    });

    const staleChats = await this.prisma.guestChat.findMany({
      where: {
        OR: [
          { endedAt: { lt: chatCutoff } },
          {
            endedAt: null,
            updatedAt: { lt: chatCutoff },
            status: 'ENDED',
          },
        ],
        NOT: { guestName: REDACTED },
      },
      select: { id: true },
      take: 500,
    });

    for (const c of staleChats) {
      await this.prisma.$transaction([
        this.prisma.guestChat.update({
          where: { id: c.id },
          data: {
            guestName: REDACTED,
            guestEmail: null,
            guestPhone: null,
            ...tokenRevoke,
          },
        }),
        this.prisma.guestChatMessage.updateMany({
          where: { chatId: c.id },
          data: { body: REDACTED },
        }),
      ]);
    }

    const audits = await this.prisma.auditLog.updateMany({
      where: {
        createdAt: { lt: auditCutoff },
        OR: [{ actorEmail: { not: null } }, { ipAddress: { not: null } }],
      },
      data: {
        actorEmail: null,
        ipAddress: null,
      },
    });

    const analytics = await this.prisma.analyticsEvent.deleteMany({
      where: { createdAt: { lt: analyticsCutoff } },
    });

    const sessions = await this.prisma.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: sessionCutoff } },
          { revokedAt: { lt: sessionCutoff } },
        ],
      },
    });

    const summary = {
      reservations: reservations.count,
      eventRequests: eventRequests.count,
      contactMessages: contacts.count,
      venueReviews: reviews.count,
      guestChats: staleChats.length,
      auditLogsStripped: audits.count,
      analyticsDeleted: analytics.count,
      authSessionsDeleted: sessions.count,
      ranAt: now.toISOString(),
    };

    await this.prisma.auditLog.create({
      data: {
        shopId: null,
        userId: null,
        section: 'system',
        action: 'gdpr.retention_pass',
        summary: 'Automated GDPR retention pass',
        meta: JSON.stringify(summary),
        actorRole: null,
        actorName: 'system',
        actorEmail: null,
      },
    });

    return summary;
  }
}
