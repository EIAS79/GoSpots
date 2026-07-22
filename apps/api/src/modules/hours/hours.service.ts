import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireShopId } from '../../common/tenant';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateScheduleExceptionDto,
  PutWeeklyHoursDto,
  UpdateScheduleExceptionDto,
} from './dto/hours.dto';

const DEFAULT_OPENS = '09:00';
const DEFAULT_CLOSES = '22:00';

@Injectable()
export class HoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertRead(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER') return;
    const csv = actor.perms ?? '';
    if (
      hasPermission(csv, PERMISSIONS.HOURS_READ) ||
      hasPermission(csv, PERMISSIONS.HOURS_WRITE)
    ) {
      return;
    }
    throw new ForbiddenException('Missing hours.read permission.');
  }

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.HOURS_WRITE)) return;
    throw new ForbiddenException('Missing hours.write');
  }

  private defaultWeekly() {
    return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      opensAt: DEFAULT_OPENS,
      closesAt: DEFAULT_CLOSES,
      isClosed: weekday === 0,
    }));
  }

  async getSchedule(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const [weekly, exceptions] = await Promise.all([
      this.prisma.openingHour.findMany({
        where: { shopId },
        orderBy: { weekday: 'asc' },
      }),
      this.prisma.scheduleException.findMany({
        where: { shopId },
        orderBy: { date: 'asc' },
      }),
    ]);

    const weeklyOut =
      weekly.length > 0
        ? weekly
        : this.defaultWeekly().map((d) => ({
            id: null as string | null,
            shopId,
            ...d,
          }));

    return { weekly: weeklyOut, exceptions };
  }

  async putWeekly(actor: JwtAccessPayload, dto: PutWeeklyHoursDto) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);

    if (dto.days.length !== 7) {
      throw new BadRequestException('Provide exactly 7 days (Sun–Sat).');
    }

    const weekdays = new Set<number>();
    for (const day of dto.days) {
      const weekday = day.weekday;
      if (weekdays.has(weekday)) {
        throw new BadRequestException('Duplicate weekday.');
      }
      weekdays.add(weekday);
      if (!day.isClosed && (!day.opensAt || !day.closesAt)) {
        throw new BadRequestException(
          'Open days need both opensAt and closesAt.',
        );
      }
    }

    await this.prisma.$transaction(
      dto.days.map((day) => {
        const weekday = day.weekday;
        return this.prisma.openingHour.upsert({
          where: { shopId_weekday: { shopId, weekday } },
          create: {
            shopId,
            weekday,
            isClosed: day.isClosed,
            opensAt: day.isClosed ? '00:00' : day.opensAt!,
            closesAt: day.isClosed ? '00:00' : day.closesAt!,
          },
          update: {
            isClosed: day.isClosed,
            opensAt: day.isClosed ? '00:00' : day.opensAt!,
            closesAt: day.isClosed ? '00:00' : day.closesAt!,
          },
        });
      }),
    );

    await this.audit.record(actor, {
      section: 'hours',
      action: 'hours.weekly.update',
      summary: 'Updated weekly opening hours',
      meta: { days: dto.days.length },
    });
    await this.notifications.recordVenueEvent(shopId, {
      title: 'Weekly hours updated',
      body: 'Opening hours were changed — bookings use the new schedule.',
      href: '/hours',
    });

    return this.getSchedule(actor);
  }

  async createException(
    actor: JwtAccessPayload,
    dto: CreateScheduleExceptionDto,
  ) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    this.validateExceptionTimes(dto.isClosed, dto.opensAt, dto.closesAt);

    const row = await this.prisma.scheduleException.create({
      data: {
        shopId,
        date: dto.date,
        label: dto.label?.trim() || null,
        isClosed: dto.isClosed,
        opensAt: dto.isClosed ? null : (dto.opensAt ?? null),
        closesAt: dto.isClosed ? null : (dto.closesAt ?? null),
      },
    });

    await this.audit.record(actor, {
      section: 'hours',
      action: 'hours.exception.create',
      summary: `Added schedule exception for ${dto.date}`,
      meta: { exceptionId: row.id, date: dto.date, isClosed: dto.isClosed },
    });
    await this.notifications.recordVenueEvent(shopId, {
      title: 'Special hours added',
      body: `${dto.date}${dto.label ? ` · ${dto.label}` : ''}${dto.isClosed ? ' — closed' : ''}`,
      href: '/hours',
    });

    return row;
  }

  async updateException(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateScheduleExceptionDto,
  ) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    const existing = await this.prisma.scheduleException.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException();

    const isClosed = dto.isClosed ?? existing.isClosed;
    const opensAt = dto.opensAt !== undefined ? dto.opensAt : existing.opensAt;
    const closesAt =
      dto.closesAt !== undefined ? dto.closesAt : existing.closesAt;
    this.validateExceptionTimes(
      isClosed,
      opensAt ?? undefined,
      closesAt ?? undefined,
    );

    const row = await this.prisma.scheduleException.update({
      where: { id, shopId },
      data: {
        date: dto.date,
        label: dto.label === undefined ? undefined : dto.label?.trim() || null,
        isClosed: dto.isClosed,
        opensAt: isClosed ? null : opensAt,
        closesAt: isClosed ? null : closesAt,
      },
    });

    await this.audit.record(actor, {
      section: 'hours',
      action: 'hours.exception.update',
      summary: `Updated schedule exception for ${row.date}`,
      meta: { exceptionId: row.id },
    });

    return row;
  }

  async deleteException(actor: JwtAccessPayload, id: string) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    const existing = await this.prisma.scheduleException.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.scheduleException.delete({ where: { id, shopId } });

    await this.audit.record(actor, {
      section: 'hours',
      action: 'hours.exception.delete',
      summary: `Removed schedule exception for ${existing.date}`,
      meta: { exceptionId: id, date: existing.date },
    });

    return { ok: true };
  }

  private validateExceptionTimes(
    isClosed: boolean,
    opensAt?: string,
    closesAt?: string,
  ) {
    if (!isClosed && (!opensAt || !closesAt)) {
      throw new BadRequestException(
        'Special open days need opensAt and closesAt.',
      );
    }
  }
}
