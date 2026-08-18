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

  async list(actor: JwtAccessPayload, days = 30) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    const boundedDays = Math.min(Math.max(1, Math.trunc(days)), 366);
    const from = new Date(Date.now() - 7 * 86_400_000);
    const to = new Date(Date.now() + boundedDays * 86_400_000);
    const rows = await this.prisma.scheduleEntry.findMany({
      where: {
        shopId,
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      orderBy: [{ startsAt: 'asc' }, { membershipId: 'asc' }],
      take: 1000,
    });
    const membershipIds = [...new Set(rows.map((row) => row.membershipId))];
    const roleIds = [...new Set(rows.map((row) => row.jobRoleId))];
    const [memberships, roles] = await Promise.all([
      this.prisma.membership.findMany({
        where: { shopId, id: { in: membershipIds } },
        include: { user: true },
      }),
      this.prisma.jobRole.findMany({
        where: { shopId, id: { in: roleIds } },
      }),
    ]);
    const names = new Map(
      memberships.map((membership) => [
        membership.id,
        membership.user.name ?? membership.user.email,
      ]),
    );
    const roleNames = new Map(roles.map((role) => [role.id, role.name]));
    return rows.map((row) => ({
      ...row,
      employeeName: names.get(row.membershipId) ?? row.membershipId,
      jobRoleName: roleNames.get(row.jobRoleId) ?? row.jobRoleId,
      published: row.publishedAt != null,
    }));
  }

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