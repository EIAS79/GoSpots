import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildFeatureCatalog,
  buildMarketingCatalog,
  resolveEffectiveTier,
  resolveSubscriptionAccess,
  staffSeatLimit,
} from "../../common/subscription-tier";
import { requireShopId } from "../../common/tenant";
import type { JwtAccessPayload } from "../auth/auth.service";
import { buildFinanceAnalytics } from "../finance/finance-analytics.util";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { subscription: true },
    });

    const [
      salesToday,
      salesWeek,
      orderSalesToday,
      orderSalesWeek,
      lossesWeek,
      ordersToday,
      customersWeek,
      reservationsToday,
      reservationsPending,
      staffCount,
      menuItems,
      venueViews7d,
      menuViews7d,
      reservationClicks7d,
      recentReservations,
      recentAudit,
      financeWeek,
    ] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          shopId,
          kind: "SALE",
          createdAt: { gte: startOfDay },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          shopId,
          kind: "SALE",
          createdAt: { gte: weekAgo },
        },
        _sum: { amount: true },
      }),
      this.prisma.shopOrder.aggregate({
        where: {
          shopId,
          status: "COMPLETED",
          archivedAt: null,
          completedAt: { gte: startOfDay },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.shopOrder.aggregate({
        where: {
          shopId,
          status: "COMPLETED",
          archivedAt: null,
          completedAt: { gte: weekAgo },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.shopLoss.aggregate({
        where: { shopId, occurredAt: { gte: weekAgo } },
        _sum: { amount: true },
      }),
      this.prisma.shopOrder.count({
        where: { shopId, createdAt: { gte: startOfDay }, archivedAt: null },
      }),
      this.prisma.shopOrder.aggregate({
        where: {
          shopId,
          status: "COMPLETED",
          archivedAt: null,
          completedAt: { gte: weekAgo },
        },
        _sum: { guestCount: true },
      }),
      this.prisma.reservation.count({
        where: { shopId, startsAt: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 86400000) } },
      }),
      this.prisma.reservation.count({
        where: { shopId, status: { in: ["PENDING", "CONFIRMED"] } },
      }),
      this.prisma.membership.count({
        where: {
          shopId,
          role: { in: ["STAFF", "MANAGER"] },
          isActive: true,
          user: { accountType: "VENUE_STAFF" },
        },
      }),
      this.prisma.menuItem.count({ where: { shopId } }),
      this.prisma.analyticsEvent.count({
        where: { shopId, type: "VENUE_VIEW", createdAt: { gte: weekAgo } },
      }),
      this.prisma.analyticsEvent.count({
        where: { shopId, type: "MENU_VIEW", createdAt: { gte: weekAgo } },
      }),
      this.prisma.analyticsEvent.count({
        where: { shopId, type: "RESERVATION_CLICK", createdAt: { gte: weekAgo } },
      }),
      this.prisma.reservation.findMany({
        where: { shopId },
        orderBy: { startsAt: "desc" },
        take: 5,
        include: { resource: { select: { name: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: { shopId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      buildFinanceAnalytics(this.prisma, shopId, 7),
    ]);

    const topItems = financeWeek.topItems;

    const effectiveTier = resolveEffectiveTier(shop?.subscription ?? null);
    const features = buildFeatureCatalog(effectiveTier);

    const viewEvents = await this.prisma.analyticsEvent.findMany({
      where: { shopId, type: "VENUE_VIEW", createdAt: { gte: weekAgo } },
      select: { createdAt: true },
    });
    const viewsByDay: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      viewsByDay[d.toISOString().slice(0, 10)] = 0;
    }
    for (const e of viewEvents) {
      const key = e.createdAt.toISOString().slice(0, 10);
      if (key in viewsByDay) viewsByDay[key]++;
    }

    const revenueToday =
      (salesToday._sum?.amount ?? 0) + (orderSalesToday._sum?.total ?? 0);
    const revenueWeek =
      (salesWeek._sum?.amount ?? 0) + (orderSalesWeek._sum?.total ?? 0);
    const lossesWeekAmt = lossesWeek._sum.amount ?? 0;

    return {
      shop: {
        id: shop?.id,
        name: shop?.name,
        slug: shop?.slug,
        isPublished: shop?.isPublished,
        locale: shop?.locale ?? "en",
        currency: shop?.currency ?? "EUR",
      },
      subscription: shop?.subscription
        ? {
            tier: shop.subscription.tier,
            effectiveTier,
            status: shop.subscription.status,
            trialEndsAt: shop.subscription.trialEndsAt,
            staffLimit: staffSeatLimit(effectiveTier),
            staffUsed: staffCount,
            features,
          }
        : {
            tier: "FREE",
            effectiveTier,
            status: "ACTIVE",
            trialEndsAt: null,
            staffLimit: 0,
            staffUsed: staffCount,
            features,
          },
      kpis: {
        revenueToday,
        revenueWeek,
        lossesWeek: lossesWeekAmt,
        profitWeek: revenueWeek - lossesWeekAmt,
        ordersToday,
        completedOrdersWeek: orderSalesWeek._count,
        customersWeek: customersWeek._sum?.guestCount ?? 0,
        reservationsToday,
        reservationsPending,
        menuItems,
        venueViews7d,
        menuViews7d,
        reservationClicks7d,
      },
      charts: {
        venueViewsByDay: Object.entries(viewsByDay).map(([day, count]) => ({
          day,
          count,
        })),
        revenueByDay: financeWeek.revenueByDay.map((d) => ({
          day: d.day,
          total: d.total,
        })),
        ordersByDay: financeWeek.ordersByDay.map((d) => ({
          day: d.day,
          count: d.count,
          customers: d.customers,
        })),
        lossesByDay: financeWeek.lossesByDay,
      },
      topMenuItems: topItems.map((r) => ({
        menuItemId: r.menuItemId,
        name: r.name,
        quantity: r.quantity,
        revenue: r.revenue,
      })),
      recentReservations: recentReservations.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        resource: r.resource?.name,
        startsAt: r.startsAt,
        status: r.status,
      })),
      recentAudit: recentAudit.map((a) => ({
        id: a.id,
        section: a.section,
        action: a.action,
        summary: a.summary,
        createdAt: a.createdAt,
        meta: a.meta,
      })),
    };
  }

  async subscription(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { subscription: true },
    });
    const staffUsed = await this.prisma.membership.count({
      where: {
        shopId,
        role: { in: ["STAFF", "MANAGER"] },
        isActive: true,
        user: { accountType: "VENUE_STAFF" },
      },
    });
    const access = resolveSubscriptionAccess(shop?.subscription ?? null);
    const { effectiveTier } = access;
    return {
      subscription: shop?.subscription,
      effectiveTier,
      billedTier: access.billedTier,
      trialActive: access.trialActive,
      trialExpired: access.trialExpired,
      trialDaysRemaining: access.trialDaysRemaining,
      staffUsed,
      staffLimit: staffSeatLimit(effectiveTier),
      features: buildFeatureCatalog(effectiveTier),
      marketingFeatures: buildMarketingCatalog(effectiveTier),
    };
  }

}
