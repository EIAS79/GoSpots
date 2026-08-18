import {
  ForbiddenException,
  Injectable,
  MethodNotAllowedException,
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
      correlationId?: string;
      sourceDevice?: string;
      reason?: string;
      previousState?: Prisma.InputJsonValue;
      newState?: Prisma.InputJsonValue;
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
        correlationId: input.correlationId?.slice(0, 128) ?? null,
        sourceDevice: input.sourceDevice?.slice(0, 200) ?? null,
        reason: input.reason?.slice(0, 1000) ?? null,
        ...(input.previousState !== undefined && {
          previousState: input.previousState,
        }),
        ...(input.newState !== undefined && { newState: input.newState }),
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
      correlationId?: string;
      sourceDevice?: string;
      reason?: string;
      previousState?: Prisma.InputJsonValue;
      newState?: Prisma.InputJsonValue;
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
        correlationId: input.correlationId?.slice(0, 128) ?? null,
        sourceDevice: input.sourceDevice?.slice(0, 200) ?? null,
        reason: input.reason?.slice(0, 1000) ?? null,
        ...(input.previousState !== undefined && {
          previousState: input.previousState,
        }),
        ...(input.newState !== undefined && { newState: input.newState }),
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
      canDelete: false,
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

  remove(actor: JwtAccessPayload, id: string): Promise<never> {
    void actor;
    void id;
    return Promise.reject(
      new MethodNotAllowedException(
        'Audit evidence is immutable and cannot be deleted.',
      ),
    );
  }

  removeMany(
    actor: JwtAccessPayload,
    input: { ids?: string[]; allMatching?: boolean } & AuditQuery,
  ): Promise<never> {
    void actor;
    void input;
    return Promise.reject(
      new MethodNotAllowedException(
        'Audit evidence is immutable and cannot be deleted.',
      ),
    );
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
