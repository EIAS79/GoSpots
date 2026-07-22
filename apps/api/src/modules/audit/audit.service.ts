import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditSection } from '../../common/audit.constants';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { resolveVenueShopId } from '../../common/resolve-venue-shop';
import { assertShopHasFeature } from '../../common/venue-entitlements';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';

export type AuditQuery = {
  from?: string;
  to?: string;
  section?: string;
  action?: string;
  search?: string;
  take?: number;
  skip?: number;
  venuePath?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private assertRead(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER') return;
    if (!hasPermission(actor.perms ?? '', PERMISSIONS.AUDIT_READ)) {
      throw new ForbiddenException('Missing audit.read permission.');
    }
  }

  async record(
    actor: JwtAccessPayload,
    input: {
      section: AuditSection;
      action: string;
      summary: string;
      meta?: Record<string, unknown>;
      ipAddress?: string;
    },
  ) {
    const shopId = actor.shopId;
    if (!shopId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { email: true, name: true },
    });

    return this.prisma.auditLog.create({
      data: {
        shopId,
        userId: actor.sub,
        section: input.section,
        action: input.action,
        summary: input.summary,
        meta: input.meta ? JSON.stringify(input.meta) : null,
        actorRole: actor.shopRole ?? null,
        actorName: user?.name ?? null,
        actorEmail: actor.email ?? user?.email ?? null,
        ipAddress: input.ipAddress?.slice(0, 64) ?? null,
      },
    });
  }

  async recordForShop(
    shopId: string,
    input: {
      section: AuditSection;
      action: string;
      summary: string;
      meta?: Record<string, unknown>;
      actorName?: string;
    },
  ) {
    return this.prisma.auditLog.create({
      data: {
        shopId,
        userId: null,
        section: input.section,
        action: input.action,
        summary: input.summary,
        meta: input.meta ? JSON.stringify(input.meta) : null,
        actorRole: null,
        actorName: input.actorName ?? 'Guest',
        actorEmail: null,
      },
    });
  }

  private buildWhere(shopId: string, q: AuditQuery): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = { shopId };

    if (q.section && q.section !== 'all') {
      where.section = q.section;
    }

    if (q.action && q.action !== 'all') {
      where.action = { startsWith: q.action };
    }

    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) {
        where.createdAt.gte = new Date(q.from);
      }
      if (q.to) {
        const end = new Date(q.to);
        if (q.to.length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    if (q.search?.trim()) {
      const term = q.search.trim();
      where.OR = [
        { summary: { contains: term, mode: 'insensitive' } },
        { action: { contains: term, mode: 'insensitive' } },
        { actorEmail: { contains: term, mode: 'insensitive' } },
        { actorName: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async list(actor: JwtAccessPayload, q: AuditQuery) {
    this.assertRead(actor);
    const shopId = await resolveVenueShopId(this.prisma, actor, q.venuePath);
    await assertShopHasFeature(this.prisma, shopId, 'audit');
    const take = Math.min(q.take ?? 100, 500);
    const skip = q.skip ?? 0;
    const where = this.buildWhere(shopId, q);

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((row) => this.serialize(row)),
      total,
      take,
      skip,
      canDelete:
        actor.shopRole === 'OWNER' || actor.sysRole === 'SUPER_ADMIN',
    };
  }

  async exportCsv(actor: JwtAccessPayload, q: AuditQuery) {
    this.assertRead(actor);
    const shopId = await resolveVenueShopId(this.prisma, actor, q.venuePath);
    await assertShopHasFeature(this.prisma, shopId, 'audit');
    const where = this.buildWhere(shopId, q);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });

    const header = [
      'id',
      'createdAt',
      'section',
      'action',
      'summary',
      'actorRole',
      'actorName',
      'actorEmail',
      'ipAddress',
      'meta',
    ];
    const lines = rows.map((r) => {
      const s = this.serialize(r);
      return [
        s.id,
        s.createdAt,
        s.section,
        s.action,
        csvEscape(s.summary),
        s.actorRole ?? '',
        csvEscape(s.actorName ?? ''),
        s.actorEmail ?? '',
        s.ipAddress ?? '',
        csvEscape(s.meta ?? ''),
      ].join(',');
    });

    return [header.join(','), ...lines].join('\n');
  }

  private assertOwnerDelete(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER' || actor.sysRole === 'SUPER_ADMIN') return;
    throw new ForbiddenException(
      'Only the venue owner can delete audit records.',
    );
  }

  async remove(actor: JwtAccessPayload, id: string) {
    this.assertOwnerDelete(actor);
    const shopId = await resolveVenueShopId(this.prisma, actor);
    const row = await this.prisma.auditLog.findFirst({
      where: { id, shopId },
    });
    if (!row) throw new NotFoundException('Audit entry not found.');
    await this.prisma.auditLog.delete({ where: { id, shopId } });
    return { ok: true };
  }

  async removeMany(
    actor: JwtAccessPayload,
    input: { ids?: string[]; allMatching?: boolean } & AuditQuery,
  ) {
    this.assertOwnerDelete(actor);
    const shopId = await resolveVenueShopId(this.prisma, actor, input.venuePath);

    let where: Prisma.AuditLogWhereInput;
    if (input.ids?.length) {
      where = { shopId, id: { in: input.ids } };
    } else if (input.allMatching) {
      where = this.buildWhere(shopId, input);
    } else {
      return { deleted: 0 };
    }

    const result = await this.prisma.auditLog.deleteMany({ where });

    if (result.count > 0) {
      await this.record(actor, {
        section: 'system',
        action: 'audit.delete',
        summary: `Deleted ${result.count} audit entr${result.count === 1 ? 'y' : 'ies'}`,
        meta: {
          deleted: result.count,
          ids: input.ids?.slice(0, 50),
          allMatching: input.allMatching ?? false,
        },
      });
    }

    return { deleted: result.count };
  }

  private serialize(row: {
    id: string;
    shopId: string | null;
    userId: string | null;
    section: string;
    action: string;
    summary: string;
    meta: string | null;
    actorRole: string | null;
    actorName: string | null;
    actorEmail: string | null;
    ipAddress: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      shopId: row.shopId,
      userId: row.userId,
      section: row.section,
      action: row.action,
      summary: row.summary,
      meta: row.meta,
      metaParsed: row.meta ? safeJson(row.meta) : null,
      actorRole: row.actorRole,
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
