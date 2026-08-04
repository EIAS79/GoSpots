import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservationStatus, ResourceStatus } from '@prisma/client';
import { ACTIVE_RESERVATION } from '../../common/booking-floor-status';
import {
  holdEndsAt,
  isDiningResourceType,
  parseNoShowMinutes,
} from '../../common/dining-reservation.util';
import { guestTokenRevokeFields } from '../../common/guest-token.util';
import { withReservationRemindersCronLock } from '../../common/pg-advisory-lock.util';
import { reservationSessionsHref } from '../../common/reservation-notification-href';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Only these statuses may auto-transition to NO_SHOW (double-run safe). */
export const AUTO_NO_SHOW_FROM_STATUSES = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.PENDING,
] as const;

/**
 * Background lifecycle work for reservations:
 *   - 5 minutes before the start time → notification
 *   - at (or just after) the start time → notification
 *   - after hold window ends without check-in → NO_SHOW and free the unit
 *   - after session endsAt (end of day) while still checked in → COMPLETED cleanup
 *
 * Multi-instance: `tick` takes a Postgres transaction advisory lock so only one
 * API process runs reminder + NO_SHOW + auto-complete side effects per minute.
 */
@Injectable()
export class ReservationRemindersService {
  private readonly logger = new Logger(ReservationRemindersService.name);
  private schemaOutOfDateLogged = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      const outcome = await withReservationRemindersCronLock(
        this.prisma,
        async () => {
          await Promise.all([
            this.upcomingIn5Min(),
            this.startsNow(),
            this.autoNoShowSessions(),
            this.autoCompleteCheckedInSessions(),
          ]);
        },
      );
      if (!outcome.acquired) {
        this.logger.debug(
          'Reservation reminder tick skipped (another instance holds cron lock)',
        );
      }
    } catch (err) {
      // Schema/transient DB errors — avoid flooding the console every minute.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('does not exist')) {
        if (!this.schemaOutOfDateLogged) {
          this.schemaOutOfDateLogged = true;
          this.logger.warn(
            `Reservation reminders skipped (DB schema out of date — run prisma migrate). Further skips are silent. ${message.split('\n')[0]}`,
          );
        }
        return;
      }
      this.logger.warn(`Reservation reminder tick failed: ${message.split('\n')[0]}`);
    }
  }



  /**
   * Guest did not arrive within the grace window after reservation time.
   *
   * Idempotent / multi-instance safe: status flips only via conditional
   * `updateMany` (CONFIRMED|PENDING → NO_SHOW) with guest-token revoke in the
   * same write. Side effects run only when `count === 1`.
   */
  private async autoNoShowSessions() {
    const now = new Date();
    const revokeAt = now;
    const rows = await this.prisma.reservation.findMany({
      where: {
        status: { in: [...AUTO_NO_SHOW_FROM_STATUSES] },
        startsAt: { lte: now },
        resourceId: { not: null },
      },
      select: {
        id: true,
        shopId: true,
        resourceId: true,
        guestName: true,
        startsAt: true,
        endsAt: true,
        resource: {
          select: {
            type: true,
            name: true,
            category: { select: { offeringConfig: true } },
          },
        },
      },
      take: 500,
    });

    if (rows.length === 0) return;

    let marked = 0;
    for (const r of rows) {
      const noShowMinutes = parseNoShowMinutes(
        r.resource?.category?.offeringConfig,
      );
      const graceEnds = holdEndsAt(r.startsAt, noShowMinutes);
      // Dining hold window OR gaming: no-show after arrival grace, not full play end.
      if (graceEnds > now) continue;

      const result = await this.prisma.reservation.updateMany({
        where: {
          id: r.id,
          status: { in: [...AUTO_NO_SHOW_FROM_STATUSES] },
        },
        data: {
          status: ReservationStatus.NO_SHOW,
          ...guestTokenRevokeFields(revokeAt),
        },
      });

      // Lost the race / already transitioned — skip free-unit + notify.
      if (result.count === 0 || !r.resourceId) continue;
      marked += result.count;

      const stillBusy = await this.prisma.reservation.findFirst({
        where: {
          shopId: r.shopId,
          resourceId: r.resourceId,
          status: { in: ACTIVE_RESERVATION },
        },
        select: { id: true },
      });
      if (stillBusy) continue;

      await this.prisma.resource.updateMany({
        where: {
          id: r.resourceId,
          status: { not: ResourceStatus.MAINTENANCE },
        },
        data: { status: ResourceStatus.AVAILABLE },
      });

      const unitLabel = r.resource?.name ?? 'unit';
      const tab = isDiningResourceType(r.resource?.type)
        ? 'dining'
        : 'schedule';
      await this.audit.recordForShop(r.shopId, {
        section: 'reservation',
        action: 'reservation.no_show_auto',
        summary: `${r.guestName} no-show — ${unitLabel} freed`,
        meta: { reservationId: r.id, resourceId: r.resourceId },
      });
      await this.notifications.recordReservationEvent(r.shopId, {
        title: tab === 'dining' ? 'Table no-show' : 'Guest no-show',
        body: `${r.guestName} · ${unitLabel}`,
        href: reservationSessionsHref(r.startsAt, tab),
        dedupeKey: `auto_no_show:${r.id}`,
      });
    }

    this.logger.debug(`Marked ${marked} reservation(s) as no-show`);
  }



  /** Bookings starting in ~5 min (window: 4–6 min from now). */

  private async upcomingIn5Min() {

    const now = Date.now();

    const winStart = new Date(now + 4 * 60_000);

    const winEnd = new Date(now + 6 * 60_000);



    const rows = await this.prisma.reservation.findMany({

      where: {

        status: { in: ACTIVE_RESERVATION },

        startsAt: { gte: winStart, lte: winEnd },

      },

      include: { resource: { include: { category: true } } },

      take: 200,

    });



    for (const r of rows) {

      const dedupeKey = `res_rem5_${r.id}`;

      const unit = r.resource?.name ?? 'Unassigned unit';

      const startsIn = Math.max(

        1,

        Math.round((r.startsAt.getTime() - now) / 60_000),

      );

      await this.notifications.recordReservationEvent(r.shopId, {

        dedupeKey,

        title: `Booking starts in ${startsIn} min`,

        body: `${r.guestName} · ${unit} · ${this.fmtTime(r.startsAt)}`,

        href: reservationSessionsHref(
          r.startsAt,
          isDiningResourceType(r.resource?.type) ? 'dining' : 'schedule',
        ),

      });

    }

  }



  /** Bookings whose start time is within the last 60s. */

  private async startsNow() {

    const now = Date.now();

    const winStart = new Date(now - 60_000);

    const winEnd = new Date(now + 30_000);



    const rows = await this.prisma.reservation.findMany({

      where: {

        status: { in: ACTIVE_RESERVATION },

        startsAt: { gte: winStart, lte: winEnd },

      },

      include: { resource: { include: { category: true } } },

      take: 200,

    });



    for (const r of rows) {

      const dedupeKey = `res_start_${r.id}`;

      const unit = r.resource?.name ?? 'Unassigned unit';

      await this.notifications.recordReservationEvent(r.shopId, {

        dedupeKey,

        title: 'Booking is starting now',

        body: `${r.guestName} · ${unit} · ${this.fmtTime(r.startsAt)}`,

        href: reservationSessionsHref(
          r.startsAt,
          isDiningResourceType(r.resource?.type) ? 'dining' : 'schedule',
        ),

      });

    }

  }



  /**

   * End-of-day safety net: checked-in sessions whose session end has passed.

   * Normal flow is staff marking "Guest left".

   */

  private async autoCompleteCheckedInSessions() {

    const now = new Date();

    const passed = await this.prisma.reservation.findMany({

      where: {

        status: ReservationStatus.CHECKED_IN,

        endsAt: { lte: now },

        resourceId: { not: null },

      },

      select: {
        id: true,
        shopId: true,
        resourceId: true,
        guestName: true,
        startsAt: true,
        resource: { select: { type: true, name: true } },
      },

      take: 500,

    });

    if (passed.length === 0) return;



    for (const r of passed) {

      const result = await this.prisma.reservation.updateMany({

        where: {

          id: r.id,

          status: ReservationStatus.CHECKED_IN,

        },

        data: { status: ReservationStatus.COMPLETED },

      });

      if (result.count === 0) continue;



      if (!r.resourceId) continue;



      const stillBusy = await this.prisma.reservation.findFirst({

        where: {

          shopId: r.shopId,

          resourceId: r.resourceId,

          status: { in: ACTIVE_RESERVATION },

        },

        select: { id: true },

      });

      if (stillBusy) continue;



      await this.prisma.resource.updateMany({

        where: {

          id: r.resourceId,

          status: { not: ResourceStatus.MAINTENANCE },

        },

        data: { status: ResourceStatus.AVAILABLE },

      });

      const unitLabel = r.resource?.name ?? 'unit';
      const tab = isDiningResourceType(r.resource?.type)
        ? 'dining'
        : 'schedule';
      await this.audit.recordForShop(r.shopId, {
        section: 'reservation',
        action: 'reservation.complete_auto',
        summary: `End-of-day auto-complete for ${r.guestName} (${unitLabel})`,
        meta: { reservationId: r.id, resourceId: r.resourceId },
      });
      await this.notifications.recordReservationEvent(r.shopId, {
        title: 'Session auto-completed',
        body: `${r.guestName} · ${unitLabel} · end of day cleanup`,
        href: reservationSessionsHref(r.startsAt, tab),
        dedupeKey: `auto_complete:${r.id}`,
      });

    }



    this.logger.debug(`Auto-completed ${passed.length} checked-in session(s)`);

  }



  private fmtTime(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}



export { ReservationStatus };

