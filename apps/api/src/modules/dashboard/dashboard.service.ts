import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildFeatureCatalog,
  buildMarketingCatalog,
  resolveEffectiveTier,
  resolveStaffSeatLimit,
  resolveSubscriptionAccess,
  TRIAL_STAFF_SEAT_LIMIT,
  tierForPack,
} from '../../common/subscription-tier';
import {
  monthlyTotal,
  parseAddOns,
  resolveAddOnsCsv,
  resolvePackId,
  serializeAddOns,
  syncSubscriptionAddOnRows,
  VENUE_ADD_ON_LIST,
  VENUE_PACK_LIST,
  type AddOnId,
} from '../../common/venue-packs';
import { requireShopId } from '../../common/tenant';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import type { UpdateVenuePackDto } from '../auth/dto/auth.dto';
import { toMoneyNumber, serializeMoney } from '../../common/money.util';
import {
  buildFinanceAnalytics,
  computeRevenueSince,
} from '../finance/finance-analytics.util';

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
      include: {
        subscription: { include: { addOnRows: true } },
      },
    });

    const [
      revenueToday,
      revenueWeek,
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
      computeRevenueSince(this.prisma, shopId, startOfDay),
      computeRevenueSince(this.prisma, shopId, weekAgo),
      this.prisma.shopOrder.aggregate({
        where: {
          shopId,
          status: 'COMPLETED',
          archivedAt: null,
          completedAt: { gte: weekAgo },
        },
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
          status: 'COMPLETED',
          archivedAt: null,
          completedAt: { gte: weekAgo },
        },
        _sum: { guestCount: true },
      }),
      this.prisma.reservation.count({
        where: {
          shopId,
          startsAt: {
            gte: startOfDay,
            lt: new Date(startOfDay.getTime() + 86400000),
          },
        },
      }),
      this.prisma.reservation.count({
        where: { shopId, status: { in: ['PENDING', 'CONFIRMED'] } },
      }),
      this.prisma.membership.count({
        where: {
          shopId,
          role: { in: ['STAFF', 'MANAGER'] },
          isActive: true,
          user: { accountType: 'VENUE_STAFF' },
        },
      }),
      this.prisma.menuItem.count({ where: { shopId } }),
      this.prisma.analyticsEvent.count({
        where: { shopId, type: 'VENUE_VIEW', createdAt: { gte: weekAgo } },
      }),
      this.prisma.analyticsEvent.count({
        where: { shopId, type: 'MENU_VIEW', createdAt: { gte: weekAgo } },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          shopId,
          type: 'RESERVATION_CLICK',
          createdAt: { gte: weekAgo },
        },
      }),
      this.prisma.reservation.findMany({
        where: { shopId },
        orderBy: { startsAt: 'desc' },
        take: 5,
        include: { resource: { select: { name: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      buildFinanceAnalytics(this.prisma, shopId, 7),
    ]);

    const topItems = financeWeek.topItems;

    const access = resolveSubscriptionAccess(shop?.subscription ?? null);
    const effectiveTier = access.effectiveTier;
    const features = buildFeatureCatalog(access.enabledModules);

    const viewEvents = await this.prisma.analyticsEvent.findMany({
      where: { shopId, type: 'VENUE_VIEW', createdAt: { gte: weekAgo } },
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

    const lossesWeekAmt = toMoneyNumber(lossesWeek._sum.amount);

    return {
      shop: {
        id: shop?.id,
        name: shop?.name,
        slug: shop?.slug,
        isPublished: shop?.isPublished,
        locale: shop?.locale ?? 'en',
        currency: shop?.currency ?? 'EUR',
      },
      subscription: shop?.subscription
        ? {
            tier: shop.subscription.tier,
            effectiveTier,
            status: shop.subscription.status,
            trialEndsAt: shop.subscription.trialEndsAt,
            staffLimit: resolveStaffSeatLimit(shop.subscription),
            staffSeatQuantity:
              (shop.subscription as { staffSeatQuantity?: number })
                .staffSeatQuantity ?? 0,
            staffUsed: staffCount,
            features,
            packId: access.packId,
            addOns: access.addOns,
          }
        : {
            tier: 'FREE',
            effectiveTier,
            status: 'ACTIVE',
            trialEndsAt: null,
            staffLimit: 0,
            staffSeatQuantity: 0,
            staffUsed: staffCount,
            features,
            packId: null,
            addOns: '',
          },
      kpis: {
        revenueToday: serializeMoney(revenueToday),
        revenueWeek: serializeMoney(revenueWeek),
        lossesWeek: serializeMoney(lossesWeekAmt),
        profitWeek: serializeMoney(revenueWeek - lossesWeekAmt),
        ordersToday,
        completedOrdersWeek: orderSalesWeek._count ?? 0,
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
    await this.applyDuePendingPlan(shopId);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        subscription: { include: { addOnRows: true } },
      },
    });
    const staffUsed = await this.prisma.membership.count({
      where: {
        shopId,
        role: { in: ['STAFF', 'MANAGER'] },
        isActive: true,
        user: { accountType: 'VENUE_STAFF' },
      },
    });
    const sub = shop?.subscription ?? null;
    const access = resolveSubscriptionAccess(sub);
    const { effectiveTier, enabledModules } = access;
    const staffSeatQuantity =
      (sub as { staffSeatQuantity?: number } | null)?.staffSeatQuantity ?? 0;
    const pendingPackId =
      (sub as { pendingPackId?: string | null } | null)?.pendingPackId ?? null;
    const pendingAddOns =
      (sub as { pendingAddOns?: string | null } | null)?.pendingAddOns ?? null;
    const pendingStaffSeatQuantity =
      (sub as { pendingStaffSeatQuantity?: number | null } | null)
        ?.pendingStaffSeatQuantity ?? null;
    const hasPendingChanges = pendingPackId != null;
    const pendingMonthlyTotal = hasPendingChanges
      ? monthlyTotal(
          pendingPackId,
          pendingAddOns ?? '',
          pendingStaffSeatQuantity ?? 0,
        )
      : null;

    return {
      subscription: sub
        ? {
            ...sub,
            packId: sub.packId,
            addOns: access.addOns,
          }
        : null,
      effectiveTier,
      billedTier: access.billedTier,
      trialActive: access.trialActive,
      trialExpired: access.trialExpired,
      trialDaysRemaining: access.trialDaysRemaining,
      packId: access.packId,
      addOns: access.addOns,
      staffSeatQuantity,
      pendingPackId,
      pendingAddOns,
      pendingStaffSeatQuantity,
      hasPendingChanges,
      pendingAppliesAt: hasPendingChanges
        ? ((sub as { currentPeriodEnd?: Date | null } | null)
            ?.currentPeriodEnd ?? null)
        : null,
      pendingMonthlyTotal,
      trialStaffSeatLimit: TRIAL_STAFF_SEAT_LIMIT,
      enabledModules: [...enabledModules],
      monthlyTotal: monthlyTotal(
        access.packId,
        access.addOns,
        staffSeatQuantity,
      ),
      billingConfigured: this.billingConfigured(),
      lemonSubscriptionId:
        (sub as { lemonSubscriptionId?: string | null } | null)
          ?.lemonSubscriptionId ?? null,
      staffUsed,
      staffLimit: resolveStaffSeatLimit(sub),
      features: buildFeatureCatalog(enabledModules),
      marketingFeatures: buildMarketingCatalog(effectiveTier),
      packs: VENUE_PACK_LIST,
      addOnCatalog: VENUE_ADD_ON_LIST,
      /** Data is never deleted when features turn off — only visibility. */
      dataRetentionNote:
        'Turning features off only hides them from the dashboard. Your data stays and returns when you turn the feature back on.',
    };
  }

  private billingConfigured() {
    return Boolean(
      process.env.LEMON_SQUEEZY_API_KEY &&
        process.env.LEMON_SQUEEZY_STORE_ID &&
        process.env.LEMON_SQUEEZY_VARIANT_ID,
    );
  }

  /**
   * If a paid period has ended and pending plan changes exist, promote them.
   * Safe to call often — no-op when nothing is due.
   */
  async applyDuePendingPlan(shopId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { shopId },
      include: { addOnRows: true },
    });
    if (!sub) return;
    const pendingPackId = (sub as { pendingPackId?: string | null })
      .pendingPackId;
    if (pendingPackId == null) return;
    if (sub.status !== 'ACTIVE') return;
    const periodEnd = sub.currentPeriodEnd;
    if (periodEnd && periodEnd.getTime() > Date.now()) return;

    const liveAddOns = resolveAddOnsCsv({ addOnRows: sub.addOnRows });
    const pendingAddOns =
      (sub as { pendingAddOns?: string | null }).pendingAddOns ?? liveAddOns;
    const pendingSeats =
      (sub as { pendingStaffSeatQuantity?: number | null })
        .pendingStaffSeatQuantity ??
      (sub as { staffSeatQuantity?: number }).staffSeatQuantity ??
      0;
    const packId = resolvePackId(pendingPackId);
    const tier = tierForPack(packId, pendingAddOns);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { shopId },
        data: {
          packId,
          tier,
          staffSeatQuantity: pendingSeats,
          pendingPackId: null,
          pendingAddOns: null,
          pendingStaffSeatQuantity: null,
        } as never,
      });
      await syncSubscriptionAddOnRows(tx, updated.id, pendingAddOns);
      await tx.shop.update({
        where: { id: shopId },
        data: { venueType: packId },
      });
    });
  }

  async updatePack(actor: JwtAccessPayload, dto: UpdateVenuePackDto) {
    if (
      actor.shopRole !== 'OWNER' &&
      !hasPermission(actor.perms ?? '', PERMISSIONS.SUBSCRIPTION_MANAGE)
    ) {
      throw new ForbiddenException(
        'Only the venue owner or a manager with billing access can change the pack.',
      );
    }
    const shopId = requireShopId(actor);
    await this.applyDuePendingPlan(shopId);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        subscription: { include: { addOnRows: true } },
      },
    });
    if (!shop?.subscription) {
      throw new NotFoundException('Subscription not found.');
    }

    const sub = shop.subscription;
    const packId = resolvePackId(dto.packId ?? sub.packId);
    const liveAddOns = resolveAddOnsCsv({ addOnRows: sub.addOnRows });
    const addOnsCsv =
      dto.addOns != null
        ? serializeAddOns(dto.addOns as AddOnId[])
        : liveAddOns;
    const hasTeam = parseAddOns(addOnsCsv).includes('team_accounts');
    const currentSeats =
      (sub as { staffSeatQuantity?: number }).staffSeatQuantity ?? 0;
    let staffSeatQuantity =
      dto.staffSeatQuantity != null
        ? Math.max(0, Math.min(100, Math.floor(dto.staffSeatQuantity)))
        : currentSeats;
    if (!hasTeam) {
      staffSeatQuantity = 0;
    }

    const access = resolveSubscriptionAccess(sub);
    const isPaidActive = sub.status === 'ACTIVE' && !access.trialActive;
    const waitingToPay =
      !isPaidActive &&
      !access.trialActive &&
      (access.trialExpired ||
        sub.status === 'CANCELED' ||
        sub.status === 'PAST_DUE' ||
        sub.status === 'TRIAL');

    if (access.trialActive && hasTeam) {
      staffSeatQuantity = Math.min(
        TRIAL_STAFF_SEAT_LIMIT,
        Math.max(1, staffSeatQuantity || TRIAL_STAFF_SEAT_LIMIT),
      );
    }

    const tier = tierForPack(packId, addOnsCsv);

    if (isPaidActive) {
      const liveSame =
        packId === sub.packId &&
        addOnsCsv === liveAddOns &&
        staffSeatQuantity === currentSeats;

      if (liveSame) {
        // Cancel any scheduled change that matches what is already live.
        await this.prisma.subscription.update({
          where: { shopId },
          data: {
            pendingPackId: null,
            pendingAddOns: null,
            pendingStaffSeatQuantity: null,
          } as never,
        });
      } else {
        // No mid-cycle refunds or access changes — schedule for next period.
        await this.prisma.subscription.update({
          where: { shopId },
          data: {
            pendingPackId: packId,
            pendingAddOns: addOnsCsv,
            pendingStaffSeatQuantity: staffSeatQuantity,
          } as never,
        });
      }
    } else if (waitingToPay) {
      // Trial ended / canceled / past due: save selection for checkout only.
      // Modules stay locked until Lemon marks the subscription ACTIVE.
      await this.prisma.subscription.update({
        where: { shopId },
        data: {
          pendingPackId: packId,
          pendingAddOns: addOnsCsv,
          pendingStaffSeatQuantity: staffSeatQuantity,
        } as never,
      });
    } else {
      // Active trial: apply immediately so selected modules appear in the dashboard.
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.subscription.update({
          where: { shopId },
          data: {
            packId,
            tier,
            staffSeatQuantity,
            pendingPackId: null,
            pendingAddOns: null,
            pendingStaffSeatQuantity: null,
          } as never,
        });
        await syncSubscriptionAddOnRows(tx, updated.id, addOnsCsv);
        await tx.shop.update({
          where: { id: shopId },
          data: { venueType: packId },
        });
      });
    }

    return this.subscription(actor);
  }
}
