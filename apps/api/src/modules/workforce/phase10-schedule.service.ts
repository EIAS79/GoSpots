import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import type {
  MarkScheduleAbsenceDto,
  PublishScheduleEntryDto,
} from './dto/phase10-accountability.dto';

@Injectable()
export class Phase10ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async assertNoConflict(input: {
    shopId: string;
    membershipId: string;
    startsAt: Date;
    endsAt: Date;
    excludeId?: string;
  }) {
    const conflict = await this.prisma.scheduleEntry.findFirst({
      where: {
        shopId: input.shopId,
        membershipId: input.membershipId,
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        status: { not: 'CANCELED' },
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (conflict) {
      throw new ConflictException(
        `Employee already has a planned shift from ${conflict.startsAt.toISOString()} to ${conflict.endsAt.toISOString()}.`,
      );
    }
  }

  async publish(
    actor: JwtAccessPayload,
    scheduleEntryId: string,
    dto: PublishScheduleEntryDto,
  ) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    const row = await this.prisma.scheduleEntry.findFirst({
      where: { id: scheduleEntryId, shopId },
    });
    if (!row) throw new NotFoundException('Schedule entry not found.');

    const updated = await this.prisma.scheduleEntry.update({
      where: { id: row.id },
      data: { publishedAt: dto.published ? new Date() : null },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: dto.published
        ? 'workforce.schedule.publish'
        : 'workforce.schedule.unpublish',
      summary: dto.published ? 'Published planned shift' : 'Unpublished planned shift',
      previousState: { publishedAt: row.publishedAt?.toISOString() ?? null },
      newState: { publishedAt: updated.publishedAt?.toISOString() ?? null },
      meta: { scheduleEntryId: row.id, membershipId: row.membershipId },
    });
    return updated;
  }

  async markAbsence(
    actor: JwtAccessPayload,
    scheduleEntryId: string,
    dto: MarkScheduleAbsenceDto,
  ) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    const row = await this.prisma.scheduleEntry.findFirst({
      where: { id: scheduleEntryId, shopId },
    });
    if (!row) throw new NotFoundException('Schedule entry not found.');

    const absenceStatus = dto.status ?? null;
    const absenceReason = absenceStatus ? dto.reason?.trim() || null : null;
    const updated = await this.prisma.scheduleEntry.update({
      where: { id: row.id },
      data: { absenceStatus, absenceReason },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: absenceStatus
        ? 'workforce.schedule.absence'
        : 'workforce.schedule.absence.clear',
      summary: absenceStatus
        ? `Marked planned shift ${absenceStatus.toLowerCase()}`
        : 'Cleared planned shift absence state',
      reason: absenceReason ?? undefined,
      previousState: {
        absenceStatus: row.absenceStatus,
        absenceReason: row.absenceReason,
      },
      newState: {
        absenceStatus: updated.absenceStatus,
        absenceReason: updated.absenceReason,
      },
      meta: { scheduleEntryId: row.id, membershipId: row.membershipId },
    });
    return updated;
  }

  private assertManage(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER') return;
    if (!hasPermission(actor.perms ?? '', PERMISSIONS.STAFF_WRITE)) {
      throw new ForbiddenException('Missing staff management permission.');
    }
  }
}