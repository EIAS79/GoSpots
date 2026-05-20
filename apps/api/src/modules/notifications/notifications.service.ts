import { Injectable, NotFoundException } from "@nestjs/common";
import {
  NotificationType,
  SubscriptionStatus,
  UserAccountType,
  type Prisma,
} from "@prisma/client";
import type { NotificationSection } from "../../common/notification.constants";
import {
  resolveSubscriptionAccess,
  TRIAL_DURATION_DAYS,
} from "../../common/subscription-tier";
import { requireShopId } from "../../common/tenant";
import type { JwtAccessPayload } from "../auth/auth.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { ArchiveNotificationsDto } from "./dto/archive-notifications.dto";
import type { NotificationQueryDto } from "./dto/notification-query.dto";

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
  ) {}

  async list(actor: JwtAccessPayload, q: NotificationQuery = {}) {
    const shopId = requireShopId(actor);
    await this.syncTrialNotifications(shopId, actor.sub);

    const take = Math.min(q.take ?? 50, 200);
    const skip = q.skip ?? 0;
    const where = this.buildWhere(actor, q);

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: this.buildWhere(actor, { status: "unread" }),
      }),
    ]);

    return {
      items: items.map((row) => this.serialize(row)),
      total,
      unreadCount,
      take,
      skip,
      sections: await this.sectionCounts(actor, q),
    };
  }

  async recent(actor: JwtAccessPayload, since?: string) {
    const shopId = requireShopId(actor);
    const sinceDate =
      since ? new Date(since) : new Date(Date.now() - 60_000);

    const items = await this.prisma.notification.findMany({
      where: {
        shopId,
        archivedAt: null,
        createdAt: { gt: sinceDate },
        OR: [{ userId: null }, { userId: actor.sub }],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const unreadCount = await this.prisma.notification.count({
      where: this.buildWhere(actor, { status: "unread" }),
    });

    return {
      items: items.map((row) => this.serialize(row)),
      unreadCount,
    };
  }

  async unreadCount(actor: JwtAccessPayload) {
    const count = await this.prisma.notification.count({
      where: this.buildWhere(actor, { status: "unread" }),
    });
    return { unreadCount: count };
  }

  async markRead(actor: JwtAccessPayload, id: string) {
    const row = await this.findAccessible(actor, id);
    const updated = await this.prisma.notification.update({
      where: { id: row.id },
      data: { readAt: new Date() },
    });
    return this.serialize(updated);
  }

  async markUnread(actor: JwtAccessPayload, id: string) {
    const row = await this.findAccessible(actor, id);
    const updated = await this.prisma.notification.update({
      where: { id: row.id },
      data: { readAt: null },
    });
    return this.serialize(updated);
  }

  async markAllRead(actor: JwtAccessPayload) {
    const result = await this.prisma.notification.updateMany({
      where: this.buildWhere(actor, { status: "unread" }),
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
          status: dto.status ?? "all",
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
          status: "archived",
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
      sysRole: "USER",
      email: input.email,
      shopId: input.shopId,
      shopRole: input.shopRole,
    };

    if (input.accountType === UserAccountType.VENUE_STAFF) {
      await this.create({
        shopId: input.shopId,
        userId: null,
        section: "team",
        type: NotificationType.STAFF,
        title: "Employee signed in",
        body: `${display} signed in to the venue dashboard.`,
        href: "/staff",
      });
      await this.audit.record(actor, {
        section: "team",
        action: "staff.sign_in",
        summary: `${display} signed in`,
        meta: { email: input.email },
        ipAddress: input.ip,
      });
      return;
    }

    if (input.shopRole === "OWNER" || input.shopRole === "MANAGER") {
      await this.create({
        shopId: input.shopId,
        userId: null,
        section: "team",
        type: NotificationType.STAFF,
        title: "Admin signed in",
        body: `${display} (${input.shopRole}) opened the dashboard.`,
        href: "/audit",
      });
      await this.audit.record(actor, {
        section: "team",
        action: "admin.sign_in",
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
      section: "team",
      type: NotificationType.STAFF,
      ...input,
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
      section: "reservation",
      type: NotificationType.RESERVATION,
      href: input.href ?? "/sessions",
      ...input,
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
      section: "operations",
      type: NotificationType.OPERATIONS,
      href: input.href ?? "/resources",
      ...input,
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
      dedupeKey: "welcome",
      section: "system",
      type: NotificationType.SYSTEM,
      title: `Welcome to VenueFlow, ${shopName}`,
      body: "Your venue dashboard is ready. Set up your menu, tables, and hours to go live.",
      href: "/settings",
    });
    await this.upsert({
      shopId,
      userId,
      dedupeKey: "trial_started",
      section: "subscription",
      type: NotificationType.TRIAL,
      title: `${TRIAL_DURATION_DAYS}-day Starter trial started`,
      body: `Explore Starter features free for ${TRIAL_DURATION_DAYS} days. Employee accounts unlock on Standard and Pro.`,
      href: "/subscription",
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
        dedupeKey: "trial_ending_soon",
        section: "subscription",
        type: NotificationType.TRIAL,
        title: "Trial ending soon",
        body: `${access.trialDaysRemaining} day${access.trialDaysRemaining === 1 ? "" : "s"} left on your Starter trial. Subscribe to keep features unlocked.`,
        href: "/subscription",
      });
    }

    if (access.trialExpired && sub.status === SubscriptionStatus.TRIAL) {
      await this.upsert({
        shopId,
        userId,
        dedupeKey: "trial_ended",
        section: "subscription",
        type: NotificationType.SUBSCRIPTION,
        title: "Your free trial has ended",
        body: "Dashboard features are locked until you choose a paid plan. Compare pricing on your subscription page.",
        href: "/subscription",
      });
    }

    if (sub.status === SubscriptionStatus.PAST_DUE) {
      await this.upsert({
        shopId,
        userId: null,
        dedupeKey: "subscription_past_due",
        section: "billing",
        type: NotificationType.BILLING,
        title: "Payment past due",
        body: "Update your billing details to avoid losing access to paid features.",
        href: "/subscription",
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

    const status = q.status ?? "all";
    if (status === "archived") {
      where.archivedAt = { not: null };
    } else {
      where.archivedAt = null;
      if (status === "unread") where.readAt = null;
      if (status === "read") where.readAt = { not: null };
    }

    if (q.section && q.section !== "all") {
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
      where.createdAt = { ...(where.createdAt as object), gt: new Date(q.since) };
    }

    return where;
  }

  private async sectionCounts(
    actor: JwtAccessPayload,
    q: NotificationQuery,
  ) {
    const shopId = requireShopId(actor);
    const base: Prisma.NotificationWhereInput = {
      shopId,
      archivedAt: q.status === "archived" ? { not: null } : null,
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
      by: ["section"],
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
    if (!row) throw new NotFoundException("Notification not found.");
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
    if (data.dedupeKey) {
      return this.upsert(data as Parameters<typeof this.upsert>[0]);
    }
    return this.prisma.notification.create({ data });
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
    const existing = await this.prisma.notification.findFirst({
      where: {
        shopId: data.shopId,
        userId: data.userId,
        dedupeKey: data.dedupeKey,
      },
    });
    if (existing) {
      return this.prisma.notification.update({
        where: { id: existing.id },
        data: {
          title: data.title,
          body: data.body,
          href: data.href,
          section: data.section,
          type: data.type,
          archivedAt: null,
        },
      });
    }
    return this.prisma.notification.create({ data });
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
      href: row.href,
      readAt: row.readAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
