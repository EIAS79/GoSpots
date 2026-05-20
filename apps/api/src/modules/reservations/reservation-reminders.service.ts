import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ReservationStatus, ResourceStatus } from "@prisma/client";
import { ACTIVE_RESERVATION } from "../../common/booking-floor-status";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Background lifecycle work for reservations:
 *   - 5 minutes before the start time → notification
 *   - at (or just after) the start time → notification
 *   - after endsAt has passed → mark COMPLETED and free the seat
 *
 * Idempotency for notifications comes from stable dedupeKeys; auto-completion
 * uses an indexed status+endsAt query so re-running the tick is safe.
 */
@Injectable()
export class ReservationRemindersService {
  private readonly logger = new Logger(ReservationRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      await Promise.all([
        this.upcomingIn5Min(),
        this.startsNow(),
        this.autoCompletePassed(),
      ]);
    } catch (err) {
      this.logger.error("Reservation reminder tick failed", err as Error);
    }
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
      const unit = r.resource?.name ?? "Unassigned unit";
      const startsIn = Math.max(
        1,
        Math.round((r.startsAt.getTime() - now) / 60_000),
      );
      await this.notifications.recordReservationEvent(r.shopId, {
        dedupeKey,
        title: `Booking starts in ${startsIn} min`,
        body: `${r.guestName} · ${unit} · ${this.fmtTime(r.startsAt)}`,
        href: this.bookingHref(r.startsAt),
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
      const unit = r.resource?.name ?? "Unassigned unit";
      await this.notifications.recordReservationEvent(r.shopId, {
        dedupeKey,
        title: "Booking is starting now",
        body: `${r.guestName} · ${unit} · ${this.fmtTime(r.startsAt)}–${this.fmtTime(r.endsAt)}`,
        href: this.bookingHref(r.startsAt),
      });
    }
  }

  /**
   * Mark every active booking whose endsAt is in the past as COMPLETED, and
   * release its resource back to AVAILABLE unless another booking is happening
   * on it right now (back-to-back sessions).
   */
  private async autoCompletePassed() {
    const now = new Date();
    const passed = await this.prisma.reservation.findMany({
      where: {
        status: { in: ACTIVE_RESERVATION },
        endsAt: { lte: now },
      },
      select: { id: true, shopId: true, resourceId: true, guestName: true },
      take: 500,
    });
    if (passed.length === 0) return;

    for (const r of passed) {
      // Defensive update so we never overwrite a row that has already moved on
      // (e.g. someone hit Cancel between the read and write).
      const result = await this.prisma.reservation.updateMany({
        where: { id: r.id, status: { in: ACTIVE_RESERVATION } },
        data: { status: ReservationStatus.COMPLETED },
      });
      if (result.count === 0) continue;

      if (!r.resourceId) continue;

      const stillBusy = await this.prisma.reservation.findFirst({
        where: {
          shopId: r.shopId,
          resourceId: r.resourceId,
          status: { in: ACTIVE_RESERVATION },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true },
      });
      if (stillBusy) continue;

      // Only free seats that aren't manually marked Out of service.
      await this.prisma.resource.updateMany({
        where: {
          id: r.resourceId,
          status: { not: ResourceStatus.MAINTENANCE },
        },
        data: { status: ResourceStatus.AVAILABLE },
      });
    }

    this.logger.log(`Auto-completed ${passed.length} expired reservation(s)`);
  }

  private fmtTime(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private bookingHref(startsAt: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${startsAt.getFullYear()}-${pad(startsAt.getMonth() + 1)}-${pad(startsAt.getDate())}`;
    return `/sessions?tab=schedule&date=${date}`;
  }
}

// Re-export for tooling that needs the enum reference
export { ReservationStatus };
