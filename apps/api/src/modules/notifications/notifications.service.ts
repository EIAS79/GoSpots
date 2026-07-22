import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  type MessageEvent,
} from '@nestjs/common';
import {
  NotificationType,
  SubscriptionStatus,
  UserAccountType,
  type Prisma,
} from '@prisma/client';
import { interval, map, merge, Observable, of, startWith } from 'rxjs';
import type { NotificationSection } from '../../common/notification.constants';
import {
  reservationNotificationTabWhere,
  sanitizeAppRelativeHref,
} from '../../common/reservation-notification-href';
import {
  resolveSubscriptionAccess,
  TRIAL_DURATION_DAYS,
} from '../../common/subscription-tier';
import { requireShopId, shopScopedWhere } from '../../common/tenant';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { assertShopHasFeature } from '../../common/venue-entitlements';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { ArchiveNotificationsDto } from './dto/archive-notifications.dto';
import type { MarkReservationTabReadDto } from './dto/mark-reservation-tab-read.dto';
import { NotificationsSseHub } from './notifications-sse.hub';

/** Keep proxies / LBs from idle-closing the stream (~15–30s guidance). */
const SSE_HEARTBEAT_MS = 25_000;

export type NotificationQuery = {
  from?: string;
  to?: string;
  section?: string;
  status?: string;
  take?: number;
  skip?: number;
  since?: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sseHub: NotificationsSseHub,
  ) {}

  private assertRead(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER') return;
    if (!hasPermission(actor.perms ?? '', PERMISSIONS.NOTIFICATIONS_READ)) {
      throw new ForbiddenException('Missing notifications.read permission.');
    }
  }

  private assertReservationBadges(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER') return;
    const perms = actor.perms ?? '';
    if (perms === '*') return;
    if (
      hasPermission(perms, PERMISSIONS.NOTIFICATIONS_READ) ||
      hasPermission(perms, PERMISSIONS.RESERVATION_READ)
    ) {
      return;
    }
    throw new ForbiddenException(
      'Missing reservation.read or notifications.read permission.',
    );
  }

  async list(actor: JwtAccessPayload, q: NotificationQuery = {}) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    await assertShopHasFeature(this.prisma, shopId, 'notifications');
    await this.syncTrialNotifications(shopId, actor.sub);

    const take = Math.min(q.take ?? 50, 200);
    const skip = q.skip ?? 0;
    const where = this.buildWhere(actor, q);

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: this.buildWhere(actor, { status: 'unread' }),
      }),
    ]);

    return {
      items: items.map((row) => this.serialize(row)),
      total,
      unreadCount,
      take,
      skip,
      sections: await this.sectionCounts(actor, q),
      canDelete: actor.shopRole === 'OWNER' || actor.sysRole === 'SUPER_ADMIN',
    };
  }

  /**
   * EventSource-compatible SSE for the active shop.
   * Heartbeats always; in-process push on create/upsert when this API instance
   * handled the write. Multi-instance fan-out deferred (polling remains).
   */
  stream(actor: JwtAccessPayload): Observable<MessageEvent> {
    this.assertRead(actor);
    const shopId = requireShopId(actor);

    const ready$ = of({
      type: 'ready',
      data: {
        shopId,
        mode: 'heartbeat+in-process',
        multiInstancePush: false,
        note: 'Full cross-instance push needs Redis/PG NOTIFY; keep polling fallback.',
      },
    } as MessageEvent);

    const heartbeat$ = interval(SSE_HEARTBEAT_MS).pipe(
      startWith(0),
      map(
        () =>
          ({
            type: 'heartbeat',
            data: { ts: Date.now() },
          }) as MessageEvent,
      ),
    );

    const notifications$ = this.sseHub.forActor(shopId, actor.sub).pipe(
      map(
        (n) =>
          ({
            type: 'notification',
            data: {
              id: n.id,
              section: n.section,
              title: n.title,
              body: n.body,
              href: n.href,
              createdAt: n.createdAt,
            },
          }) as MessageEvent,
      ),
    );

    return merge(ready$, heartbeat$, notifications$);
  }

  async recent(actor: JwtAccessPayload, since?: string) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 60_000);

    const items = await this.prisma.notification.findMany({
      where: {
        shopId,
        archivedAt: null,
        createdAt: { gt: sinceDate },
        OR: [{ userId: null }, { userId: actor.sub }],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const unreadCount = await this.prisma.notification.count({
      where: this.buildWhere(actor, { status: 'unread' }),
    });

    return {
      items: items.map((row) => this.serialize(row)),
      unreadCount,
    };
  }

  async unreadCount(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const count = await this.prisma.notification.count({
      where: this.buildWhere(actor, { status: 'unread' }),
    });
    return { unreadCount: count };
  }

  async reservationBadges(actor: JwtAccessPayload) {
    this.assertReservationBadges(actor);
    const base: Prisma.NotificationWhereInput = {
      ...this.buildWhere(actor, { status: 'unread' }),
      section: 'reservation',
    };

    const [dining, gaming, events] = await Promise.all([
      this.prisma.notification.count({
        where: {
          AND: [base, reservationNotificationTabWhere('dining')],
        },
      }),
      this.prisma.notification.count({
        where: {
          AND: [base, reservationNotificationTabWhere('schedule')],
        },
      }),
      this.prisma.notification.count({
        where: {
          AND: [base, reservationNotificationTabWhere('events')],
        },
      }),
    ]);

    return {
      dining,
      gaming,
      events,
      total: dining + gaming + events,
    };
  }

  async markReservationTabRead(
    actor: JwtAccessPayload,
    dto: MarkReservationTabReadDto,
  ) {
    this.assertReservationBadges(actor);
    const shopId = requireShopId(actor);
    const result = await this.prisma.notification.updateMany({
      where: {
        shopId,
        section: 'reservation',
        readAt: null,
        archivedAt: null,
        AND: [
          { OR: [{ userId: null }, { userId: actor.sub }] },
          reservationNotificationTabWhere(dto.tab),
        ],
      },
      data: { readAt: new Date() },
    });

    return { updated: result.count };
  }

  async markRead(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const row = await this.findAccessible(actor, id);
    const updated = await this.prisma.notification.update({
      where: shopScopedWhere(row.id, shopId),
      data: { readAt: new Date() },
    });
    return this.serialize(updated);
  }

  async markUnread(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const row = await this.findAccessible(actor, id);
    const updated = await this.prisma.notification.update({
      where: shopScopedWhere(row.id, shopId),
      data: { readAt: null },
    });
    return this.serialize(updated);
  }

  async markAllRead(actor: JwtAccessPayload) {
    const result = await this.prisma.notification.updateMany({
      where: this.buildWhere(actor, { status: 'unread' }),
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async archive(actor: JwtAccessPayload, dto: ArchiveNotificationsDto) {
    const shopId = requireShopId(actor);
    const access: Prisma.NotificationWhereInput = {
      OR: [{ userId: null }, { userId: actor.sub }],
    };

    let where: Prisma.NotificationWhereInput;

    if (dto.ids?.length) {
      where = {
        shopId,
        id: { in: dto.ids },
        archivedAt: null,
        ...access,
      };
    } else if (dto.allMatching) {
      where = {
        ...this.buildWhere(actor, {
          from: dto.from,
          to: dto.to,
          section: dto.section,
          status: dto.status ?? 'all',
        }),
        archivedAt: null,
        ...access,
      };
    } else {
      return { updated: 0 };
    }

    const result = await this.prisma.notification.updateMany({
      where,
      data: { archivedAt: new Date(), readAt: new Date() },
    });
    return { updated: result.count };
  }

  async unarchive(actor: JwtAccessPayload, dto: ArchiveNotificationsDto) {
    const shopId = requireShopId(actor);
    const access: Prisma.NotificationWhereInput = {
      OR: [{ userId: null }, { userId: actor.sub }],
    };

    let where: Prisma.NotificationWhereInput;

    if (dto.ids?.length) {
      where = {
        shopId,
        id: { in: dto.ids },
        archivedAt: { not: null },
        ...access,
      };
    } else if (dto.allMatching) {
      where = {
        ...this.buildWhere(actor, {
          from: dto.from,
          to: dto.to,
          section: dto.section,
          status: 'archived',
        }),
        ...access,
      };
    } else {
      return { updated: 0 };
    }

    const result = await this.prisma.notification.updateMany({
      where,
      data: { archivedAt: null },
    });
    return { updated: result.count };
  }

  private assertOwnerDelete(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER' || actor.sysRole === 'SUPER_ADMIN') return;
    throw new ForbiddenException(
      'Only the venue owner can permanently delete notifications.',
    );
  }

  async exportCsv(actor: JwtAccessPayload, q: NotificationQuery = {}) {
    this.assertRead(actor);
    const where = this.buildWhere(actor, q);
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });

    const header = [
      'id',
      'createdAt',
      'section',
      'type',
      'title',
      'body',
      'href',
      'readAt',
      'archivedAt',
    ];
    const lines = rows.map((r) => {
      const s = this.serialize(r);
      return [
        s.id,
        s.createdAt,
        s.section,
        s.type,
        csvEscape(s.title),
        csvEscape(s.body),
        s.href ?? '',
        s.readAt ?? '',
        s.archivedAt ?? '',
      ].join(',');
    });

    return [header.join(','), ...lines].join('\n');
  }

  async removeMany(
    actor: JwtAccessPayload,
    dto: ArchiveNotificationsDto & { status?: string },
  ) {
    this.assertOwnerDelete(actor);
    const shopId = requireShopId(actor);
    const access: Prisma.NotificationWhereInput = {
      OR: [{ userId: null }, { userId: actor.sub }],
    };

    let where: Prisma.NotificationWhereInput;
    if (dto.ids?.length) {
      where = { shopId, id: { in: dto.ids }, ...access };
    } else if (dto.allMatching) {
      where = {
        ...this.buildWhere(actor, {
          from: dto.from,
          to: dto.to,
          section: dto.section,
          status: (dto.status as NotificationQuery['status']) ?? 'all',
        }),
        ...access,
      };
    } else {
      return { deleted: 0 };
    }

    const result = await this.prisma.notification.deleteMany({ where });

    await this.audit.record(actor, {
      section: 'system',
      action: 'notifications.delete',
      summary: `Deleted ${result.count} notification${result.count === 1 ? '' : 's'}`,
      meta: {
        deleted: result.count,
        ids: dto.ids?.slice(0, 50),
        allMatching: dto.allMatching ?? false,
      },
    });

    return { deleted: result.count };
  }

  /** Sign-in events → notify managers/owners + audit log */
  async recordSignIn(input: {
    userId: string;
    email: string;
    name: string | null;
    accountType: UserAccountType;
    shopId?: string;
    shopRole?: string;
    ip?: string;
  }) {
    if (!input.shopId) return;

    const display = input.name ?? input.email;
    const actor: JwtAccessPayload = {
      sub: input.userId,
      sysRole: 'USER',
      email: input.email,
      shopId: input.shopId,
      shopRole: input.shopRole,
    };

    if (input.accountType === UserAccountType.VENUE_STAFF) {
      await this.create({
        shopId: input.shopId,
        userId: null,
        section: 'team',
        type: NotificationType.STAFF,
        title: 'Employee signed in',
        body: `${display} signed in to the venue dashboard.`,
        href: '/staff',
      });
      await this.audit.record(actor, {
        section: 'team',
        action: 'staff.sign_in',
        summary: `${display} signed in`,
        meta: { email: input.email },
        ipAddress: input.ip,
      });
      return;
    }

    if (input.shopRole === 'OWNER' || input.shopRole === 'MANAGER') {
      await this.create({
        shopId: input.shopId,
        userId: null,
        section: 'team',
        type: NotificationType.STAFF,
        title: 'Admin signed in',
        body: `${display} (${input.shopRole}) opened the dashboard.`,
        href: '/audit',
      });
      await this.audit.record(actor, {
        section: 'team',
        action: 'admin.sign_in',
        summary: `${display} signed in as ${input.shopRole}`,
        meta: { email: input.email, role: input.shopRole },
        ipAddress: input.ip,
      });
    }
  }

  /** Team changes visible to whole venue */
  async recordTeamEvent(
    shopId: string,
    input: {
      title: string;
      body: string;
      href?: string;
      dedupeKey?: string;
    },
  ) {
    return this.create({
      shopId,
      userId: null,
      section: 'team',
      type: NotificationType.STAFF,
      title: input.title,
      body: input.body,
      href: input.href ?? '/staff',
      dedupeKey: input.dedupeKey,
    });
  }

  async recordReservationEvent(
    shopId: string,
    input: {
      title: string;
      body: string;
      href?: string;
      dedupeKey?: string;
    },
  ) {
    return this.create({
      shopId,
      userId: null,
      section: 'reservation',
      type: NotificationType.RESERVATION,
      title: input.title,
      body: input.body,
      href: input.href ?? '/sessions',
      dedupeKey: input.dedupeKey,
    });
  }

  async recordOperationsEvent(
    shopId: string,
    input: {
      title: string;
      body: string;
      href?: string;
      dedupeKey?: string;
    },
  ) {
    return this.create({
      shopId,
      userId: null,
      section: 'operations',
      type: NotificationType.OPERATIONS,
      title: input.title,
      body: input.body,
      href: input.href ?? '/resources',
      dedupeKey: input.dedupeKey,
    });
  }

  /** Venue profile, hours, gallery, and settings changes */
  async recordVenueEvent(
    shopId: string,
    input: {
      title: string;
      body: string;
      href?: string;
      dedupeKey?: string;
    },
  ) {
    return this.create({
      shopId,
      userId: null,
      section: 'operations',
      type: NotificationType.OPERATIONS,
      title: input.title,
      body: input.body,
      href: input.href ?? '/settings',
      dedupeKey: input.dedupeKey,
    });
  }

  /** In-venue finance events (awaiting payment, large loss, payment received). */
  async recordFinanceEvent(
    shopId: string,
    input: {
      title: string;
      body: string;
      href?: string;
      dedupeKey?: string;
    },
  ) {
    return this.create({
      shopId,
      userId: null,
      section: 'operations',
      type: NotificationType.OPERATIONS,
      title: input.title,
      body: input.body,
      href: input.href ?? '/finance',
      dedupeKey: input.dedupeKey,
    });
  }

  async seedWelcomeNotifications(
    shopId: string,
    userId: string,
    shopName: string,
  ) {
    await this.upsert({
      shopId,
      userId,
      dedupeKey: 'welcome',
      section: 'system',
      type: NotificationType.SYSTEM,
      title: `Welcome to Locora, ${shopName}`,
      body: 'Your venue dashboard is ready. Set up your menu, tables, and hours to go live.',
      href: '/settings',
    });
    await this.upsert({
      shopId,
      userId,
      dedupeKey: 'trial_started',
      section: 'subscription',
      type: NotificationType.TRIAL,
      title: `${TRIAL_DURATION_DAYS}-day free trial started`,
      body: `Your venue pack is free for ${TRIAL_DURATION_DAYS} days. Customize modules anytime from Subscription.`,
      href: '/subscription',
    });
  }

  private async syncTrialNotifications(shopId: string, userId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { subscription: true },
    });
    if (!shop?.subscription) return;

    const sub = shop.subscription;
    const access = resolveSubscriptionAccess(sub);

    if (access.trialActive && access.trialDaysRemaining <= 2) {
      await this.upsert({
        shopId,
        userId,
        dedupeKey: 'trial_ending_soon',
        section: 'subscription',
        type: NotificationType.TRIAL,
        title: 'Trial ending soon',
        body: `${access.trialDaysRemaining} day${access.trialDaysRemaining === 1 ? '' : 's'} left on your free trial. Keep your pack active to stay unlocked.`,
        href: '/subscription',
      });
    }

    if (access.trialExpired && sub.status === SubscriptionStatus.TRIAL) {
      await this.upsert({
        shopId,
        userId,
        dedupeKey: 'trial_ended',
        section: 'subscription',
        type: NotificationType.SUBSCRIPTION,
        title: 'Your free trial has ended',
        body: 'Dashboard features are locked until you choose a paid plan. Compare pricing on your subscription page.',
        href: '/subscription',
      });
      await this.audit.recordForShop(shopId, {
        section: 'subscription',
        action: 'subscription.trial_expired',
        summary: 'Free trial ended',
        meta: { tier: sub.tier, status: sub.status },
        actorName: 'System',
      });
    }

    if (sub.status === SubscriptionStatus.PAST_DUE) {
      await this.upsert({
        shopId,
        userId: null,
        dedupeKey: 'subscription_past_due',
        section: 'billing',
        type: NotificationType.BILLING,
        title: 'Payment past due',
        body: 'Update your billing details to avoid losing access to paid features.',
        href: '/subscription',
      });
      await this.audit.recordForShop(shopId, {
        section: 'subscription',
        action: 'subscription.past_due',
        summary: 'Subscription payment past due',
        meta: { tier: sub.tier, status: sub.status },
        actorName: 'System',
      });
    }
  }

  private buildWhere(
    actor: JwtAccessPayload,
    q: NotificationQuery,
  ): Prisma.NotificationWhereInput {
    const shopId = requireShopId(actor);
    const where: Prisma.NotificationWhereInput = {
      shopId,
      OR: [{ userId: null }, { userId: actor.sub }],
    };

    const status = q.status ?? 'all';
    if (status === 'archived') {
      where.archivedAt = { not: null };
    } else {
      where.archivedAt = null;
      if (status === 'unread') where.readAt = null;
      if (status === 'read') where.readAt = { not: null };
    }

    if (q.section && q.section !== 'all') {
      where.section = q.section;
    }

    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) {
        const end = new Date(q.to);
        if (q.to.length <= 10) end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (q.since) {
      where.createdAt = {
        ...(where.createdAt as object),
        gt: new Date(q.since),
      };
    }

    return where;
  }

  private async sectionCounts(actor: JwtAccessPayload, q: NotificationQuery) {
    const shopId = requireShopId(actor);
    const base: Prisma.NotificationWhereInput = {
      shopId,
      archivedAt: q.status === 'archived' ? { not: null } : null,
      OR: [{ userId: null }, { userId: actor.sub }],
    };
    if (q.from || q.to) {
      base.createdAt = {};
      if (q.from) base.createdAt.gte = new Date(q.from);
      if (q.to) {
        const end = new Date(q.to);
        if (q.to.length <= 10) end.setHours(23, 59, 59, 999);
        base.createdAt.lte = end;
      }
    }

    const counts = await this.prisma.notification.groupBy({
      by: ['section'],
      where: base,
      _count: { id: true },
    });

    return Object.fromEntries(
      counts.map((c) => [c.section, c._count.id]),
    ) as Record<string, number>;
  }

  private async findAccessible(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const row = await this.prisma.notification.findFirst({
      where: {
        id,
        shopId,
        OR: [{ userId: null }, { userId: actor.sub }],
      },
    });
    if (!row) throw new NotFoundException('Notification not found.');
    return row;
  }

  private async create(data: {
    shopId: string;
    userId: string | null;
    section: NotificationSection | string;
    type: NotificationType;
    title: string;
    body: string;
    href?: string;
    dedupeKey?: string;
  }) {
    const safeHref = sanitizeAppRelativeHref(data.href, '/sessions');
    const payload = { ...data, href: safeHref };
    if (payload.dedupeKey) {
      return this.upsert(payload as Parameters<typeof this.upsert>[0]);
    }
    const row = await this.prisma.notification.create({ data: payload });
    this.publishSse(row);
    return row;
  }

  private async upsert(data: {
    shopId: string;
    userId: string | null;
    dedupeKey: string;
    section: string;
    type: NotificationType;
    title: string;
    body: string;
    href?: string;
  }) {
    const safeHref = sanitizeAppRelativeHref(data.href, '/sessions');
    const existing = await this.prisma.notification.findFirst({
      where: {
        shopId: data.shopId,
        userId: data.userId,
        dedupeKey: data.dedupeKey,
      },
    });
    if (existing) {
      const row = await this.prisma.notification.update({
        where: shopScopedWhere(existing.id, data.shopId),
        data: {
          title: data.title,
          body: data.body,
          href: safeHref,
          section: data.section,
          type: data.type,
          archivedAt: null,
        },
      });
      this.publishSse(row);
      return row;
    }
    const row = await this.prisma.notification.create({
      data: { ...data, href: safeHref },
    });
    this.publishSse(row);
    return row;
  }

  private publishSse(row: {
    id: string;
    shopId: string;
    userId: string | null;
    section: string;
    title: string;
    body: string;
    href: string | null;
    createdAt: Date;
  }) {
    this.sseHub.publish({
      id: row.id,
      shopId: row.shopId,
      userId: row.userId,
      section: row.section,
      title: row.title,
      body: row.body,
      href: row.href ? sanitizeAppRelativeHref(row.href, '/sessions') : null,
      createdAt: row.createdAt.toISOString(),
    });
  }

  private serialize(row: {
    id: string;
    type: NotificationType;
    section: string;
    title: string;
    body: string;
    href: string | null;
    readAt: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      type: row.type,
      section: row.section,
      title: row.title,
      body: row.body,
      // Defense in depth: never emit absolute / protocol-relative hrefs to clients.
      href: row.href ? sanitizeAppRelativeHref(row.href, '/sessions') : null,
      readAt: row.readAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
