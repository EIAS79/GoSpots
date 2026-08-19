import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { businessDayBounds } from '../../common/business-day.util';
import { listOpeningWindows } from '../../common/opening-hours.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { clipSeconds } from './growth.rules';
import { phase14MetricDictionary } from './phase14-metric-dictionary';

const SOURCE_VERSION = 'phase14-owner-intelligence-v1-2026-08-19';
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

type BaseFinance = Awaited<ReturnType<GrowthAnalyticsService['finance']>>;
type BaseOperations = Awaited<ReturnType<GrowthAnalyticsService['operations']>>;
type BaseGuests = Awaited<ReturnType<GrowthAnalyticsService['guests']>>;

type ReportContext = {
  shopId: string;
  slug: string;
  branchCode: string | null;
  currency: string;
  timezone: string;
  businessDayStartMinutes: number;
  from: Date;
  to: Date;
  dayCount: number;
};

type LowStockRisk = {
  stockItemId: string;
  name: string;
  quantityMilli: number;
  reorderLevelMilli: number;
};

type ReconciliationIssueView = {
  id: string;
  type: string;
  severity: string;
  amountMinor: number | null;
  currency: string | null;
  affectedEntities: Array<{ type: string; id: string | null }>;
  firstSeenAt: Date;
  lastCheckedAt: Date;
  message: string;
  suggestedNextAction: string;
  evidenceLinks: string[];
  source: string;
};

type AttentionItem = {
  id: string;
  domain: string;
  severity: string;
  title: string;
  detail: string;
  suggestedNextAction: string;
  evidenceLinks: string[];
};

function minor(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function average(total: number, count: number) {
  return count > 0 ? total / count : null;
}

function rounded(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function actionFor(type: string) {
  if (/PAYMENT|PROVIDER/.test(type)) return 'Query the provider result and reconcile the payment exactly once before allowing a retry.';
  if (/CASH/.test(type)) return 'Open the affected cash shift, inspect count evidence and resolve or approve the variance.';
  if (/FISCAL|KSEF/.test(type)) return 'Inspect the compliance request and retry only through the idempotent compliance workflow.';
  if (/STORED_VALUE/.test(type)) return 'Inspect the stored-value ledger; do not edit a mutable balance.';
  if (/INVENTORY/.test(type)) return 'Inspect stock movements and the stocktake boundary before posting an audited correction.';
  if (/OFFLINE/.test(type)) return 'Inspect the Edge/outbox correlation and resolve the conflict or dead-letter before replay.';
  return 'Inspect the linked canonical facts and correct the source discrepancy without rewriting history.';
}

@Injectable()
export class Phase14AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly baseAnalytics: GrowthAnalyticsService,
  ) {}

  metricDictionary() {
    return phase14MetricDictionary();
  }

  async workspace(actor: JwtAccessPayload, fromDate: string, toDate: string) {
    const context = await this.context(actor, fromDate, toDate);
    const [baseFinance, baseOperations, baseGuests] = await Promise.all([
      this.baseAnalytics.finance(actor, context.from, context.to),
      this.baseAnalytics.operations(actor, context.from, context.to),
      this.baseAnalytics.guests(actor, context.from, context.to),
    ]);
    const [financial, resources, restaurant, inventory, reservations, customers, workforce] = await Promise.all([
      this.financial(context, baseFinance),
      this.resources(context, baseOperations),
      this.restaurant(context, baseOperations),
      this.inventory(context, baseFinance),
      this.reservations(context),
      this.customers(context, baseGuests),
      this.workforce(context, baseFinance),
    ]);
    const reconciliation = await this.reconciliation(context, baseFinance, baseGuests, inventory);
    return {
      sourceVersion: SOURCE_VERSION,
      canonicalFinancialAuthority: 'GuestCheck/Settlement -> Payment/Refund -> Ledger; cash/fiscal/provider/analytics are reconciled projections',
      context: {
        shopId: context.shopId,
        slug: context.slug,
        branchCode: context.branchCode,
        currency: context.currency,
        timezone: context.timezone,
        businessDayStartMinutes: context.businessDayStartMinutes,
        fromDate,
        toDate,
        from: context.from,
        to: context.to,
        elapsedHours: rounded((context.to.getTime() - context.from.getTime()) / 3_600_000, 4),
      },
      financial,
      resources,
      restaurant,
      inventory,
      reservations,
      customers,
      workforce,
      reconciliation,
      attention: this.attention(reconciliation, inventory, reservations, baseOperations),
    };
  }

  async reconciliationOnly(actor: JwtAccessPayload, fromDate: string, toDate: string) {
    const context = await this.context(actor, fromDate, toDate);
    const [baseFinance, baseGuests] = await Promise.all([
      this.baseAnalytics.finance(actor, context.from, context.to),
      this.baseAnalytics.guests(actor, context.from, context.to),
    ]);
    const inventory = await this.inventory(context, baseFinance);
    return this.reconciliation(context, baseFinance, baseGuests, inventory);
  }

  private async context(actor: JwtAccessPayload, fromDate: string, toDate: string): Promise<ReportContext> {
    const shopId = requireShopId(actor);
    if (!DATE_KEY.test(fromDate) || !DATE_KEY.test(toDate) || fromDate > toDate) {
      throw new BadRequestException('fromDate/toDate must be ordered YYYY-MM-DD venue business dates');
    }
    const dayCount = Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000) + 1;
    if (!Number.isFinite(dayCount) || dayCount < 1 || dayCount > 370) {
      throw new BadRequestException('Analytics range must contain 1..370 venue business dates');
    }
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { slug: true, branchCode: true, currency: true, timezone: true, businessDayStartMinutes: true },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    const first = businessDayBounds({ dateKey: fromDate, timeZone: shop.timezone, startMinutes: shop.businessDayStartMinutes });
    const last = businessDayBounds({ dateKey: toDate, timeZone: shop.timezone, startMinutes: shop.businessDayStartMinutes });
    return { shopId, ...shop, from: first.start, to: last.end, dayCount };
  }

  private async financial(context: ReportContext, base: BaseFinance) {
    const { shopId, from, to } = context;
    const [settlements, adjustments, serviceLines, payments, shifts] = await Promise.all([
      this.prisma.checkSettlement.findMany({
        where: { shopId, state: { in: ['PAID', 'CLOSED'] }, createdAt: { gte: from, lt: to } },
        select: { subtotal: true, taxAmount: true, total: true, currency: true },
      }),
      this.prisma.commercialAdjustment.findMany({
        where: { shopId, voidedAt: null, createdAt: { gte: from, lt: to } },
        select: { type: true, beforeTotalMinor: true, afterTotalMinor: true },
      }),
      this.prisma.chargeSnapshot.findMany({
        where: {
          shopId,
          sourceType: { contains: 'SERVICE', mode: 'insensitive' },
          settlement: { state: { in: ['PAID', 'CLOSED'] }, createdAt: { gte: from, lt: to } },
        },
        select: { finalAmount: true, currency: true },
      }),
      this.prisma.payment.findMany({
        where: { shopId, status: 'SUCCESS', succeededAt: { gte: from, lt: to } },
        select: { method: true, amount: true, currency: true },
      }),
      this.prisma.cashSession.findMany({
        where: { shopId, status: 'CLOSED', closedAt: { gte: from, lt: to } },
        select: { currency: true, closedExpectedCash: true, countedCash: true, variance: true },
      }),
    ]);
    const elapsedHours = (to.getTime() - from.getTime()) / 3_600_000;
    const rows = base.currencies.map((baseRow) => {
      const currency = baseRow.currency;
      const paid = settlements.filter((row) => row.currency === currency);
      const tender = new Map<string, { count: number; amountMinor: number }>();
      for (const row of payments.filter((item) => item.currency === currency)) {
        const bucket = tender.get(row.method) ?? { count: 0, amountMinor: 0 };
        bucket.count += 1;
        bucket.amountMinor += minor(row.amount);
        tender.set(row.method, bucket);
      }
      const scopedShifts = shifts.filter((row) => row.currency === currency);
      return {
        currency,
        grossSalesMinor: paid.reduce((sum, row) => sum + minor(row.subtotal), 0),
        netSalesMinor: baseRow.netSettledRevenueMinor,
        taxMinor: paid.reduce((sum, row) => sum + minor(row.taxAmount), 0),
        discountsMinor: adjustments.filter((row) => row.type !== 'MANAGER_COMP').reduce((sum, row) => sum + Math.max(0, row.beforeTotalMinor - row.afterTotalMinor), 0),
        compsMinor: adjustments.filter((row) => row.type === 'MANAGER_COMP').reduce((sum, row) => sum + Math.max(0, row.beforeTotalMinor - row.afterTotalMinor), 0),
        refundsMinor: baseRow.ledgerRefundMinor,
        tipsMinor: baseRow.tipMinor,
        serviceChargesMinor: serviceLines.filter((row) => row.currency === currency).reduce((sum, row) => sum + minor(row.finalAmount), 0),
        paymentMethod: Object.fromEntries(tender),
        cash: {
          shiftCount: scopedShifts.length,
          expectedMinor: scopedShifts.reduce((sum, row) => sum + minor(row.closedExpectedCash), 0),
          countedMinor: scopedShifts.reduce((sum, row) => sum + minor(row.countedCash), 0),
          varianceMinor: scopedShifts.reduce((sum, row) => sum + minor(row.variance), 0),
        },
        averageCheckMinor: rounded(average(paid.reduce((sum, row) => sum + minor(row.total), 0), paid.length)),
        revenuePerElapsedHourMinor: rounded(elapsedHours > 0 ? baseRow.netSettledRevenueMinor / elapsedHours : null),
        providerVarianceMinor: baseRow.reconciliationVarianceMinor,
      };
    });
    return {
      sourceOfTruth: 'LedgerEntry with immutable settlement projections',
      currencies: rows,
      revenueByBranch: rows.map((row) => ({ shopId, branchCode: context.branchCode, currency: row.currency, netSalesMinor: row.netSalesMinor })),
    };
  }

  private async resources(context: ReportContext, base: BaseOperations) {
    const { shopId, from, to, timezone } = context;
    const [sessions, windows] = await Promise.all([
      this.prisma.operationsSession.findMany({
        where: { shopId, startedAt: { lt: to }, OR: [{ finishedAt: null }, { finishedAt: { gt: from } }] },
        select: { id: true, guestCheckId: true, startedAt: true },
      }),
      listOpeningWindows(this.prisma, shopId, from, to),
    ]);
    const sessionIds = sessions.map((row) => row.id);
    const checkIds = sessions.flatMap((row) => (row.guestCheckId ? [row.guestCheckId] : []));
    const attachedOrders: Array<{ operationsSessionId: string | null; guestCheckId: string | null }> =
      sessionIds.length || checkIds.length
        ? await this.prisma.venueOrder.findMany({
            where: {
              shopId,
              status: 'COMPLETED',
              OR: [
                ...(sessionIds.length ? [{ operationsSessionId: { in: sessionIds } }] : []),
                ...(checkIds.length ? [{ guestCheckId: { in: checkIds } }] : []),
              ],
            },
            select: { operationsSessionId: true, guestCheckId: true },
          })
        : [];
    const attached = new Set<string>();
    for (const order of attachedOrders) {
      if (order.operationsSessionId) attached.add(order.operationsSessionId);
      if (order.guestCheckId) sessions.filter((row) => row.guestCheckId === order.guestCheckId).forEach((row) => attached.add(row.id));
    }
    const peak = new Map<string, number>();
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' });
    for (const row of sessions.filter((item) => item.startedAt >= from && item.startedAt < to)) {
      const key = hour.format(row.startedAt);
      peak.set(key, (peak.get(key) ?? 0) + 1);
    }
    const openingMinutesPerResource = windows.reduce((sum, window) => sum + clipSeconds(window.opensAt, window.closesAt, from, to) / 60, 0);
    const theoreticalOpenMinutes = openingMinutesPerResource * base.resources.resourceCount;
    const enriched = base.resources.rows.map((row) => ({
      ...row,
      averageSessionDurationMinutes: rounded(average(row.occupiedMinutes, row.sessionCount)),
      revenuePerSessionMinor: rounded(average(row.accruedResourceRevenueMinor, row.sessionCount)),
      revenuePerOccupiedHourMinor: rounded(row.occupiedMinutes > 0 ? row.accruedResourceRevenueMinor / (row.occupiedMinutes / 60) : null),
      revenuePerAvailableHourMinor: rounded(row.availableMinutes > 0 ? row.accruedResourceRevenueMinor / (row.availableMinutes / 60) : null),
    }));
    return {
      ...base.resources,
      maintenanceDowntimeMinutes: rounded(Math.max(0, theoreticalOpenMinutes - base.resources.availableMinutes)),
      averageSessionDurationMinutes: rounded(average(base.resources.occupiedMinutes, sessions.length)),
      revenuePerSessionMinor: rounded(average(base.resources.accruedResourceRevenueMinor, sessions.length)),
      revenuePerOccupiedResourceHourMinor: rounded(base.resources.occupiedMinutes > 0 ? base.resources.accruedResourceRevenueMinor / (base.resources.occupiedMinutes / 60) : null),
      revenuePerAvailableResourceHourMinor: rounded(base.resources.availableMinutes > 0 ? base.resources.accruedResourceRevenueMinor / (base.resources.availableMinutes / 60) : null),
      fbAttachRatePct: rounded(ratio(attached.size, sessions.length)),
      peakHours: [...peak.entries()].map(([localHour, sessionStarts]) => ({ localHour: Number(localHour), sessionStarts })).sort((a, b) => b.sessionStarts - a.sessionStarts || a.localHour - b.localHour),
      profitability: enriched.sort((a, b) => (b.revenuePerAvailableHourMinor ?? -1) - (a.revenuePerAvailableHourMinor ?? -1)),
    };
  }

  private async restaurant(context: ReportContext, baseOperations: BaseOperations) {
    const { shopId, from, to } = context;
    const [completed, cancelled, profiles, comps] = await Promise.all([
      this.prisma.venueOrder.findMany({
        where: { shopId, status: 'COMPLETED', completedAt: { gte: from, lt: to } },
        select: { id: true, guestCheckId: true, totalMinor: true, serviceMode: true, createdById: true },
      }),
      this.prisma.venueOrder.count({ where: { shopId, status: 'CANCELLED', canceledAt: { gte: from, lt: to } } }),
      this.prisma.guestCheckCommercialProfile.findMany({ where: { shopId, checkType: 'RESTAURANT_TABLE' }, select: { guestCheckId: true, resourceId: true } }),
      this.prisma.commercialAdjustment.findMany({
        where: { shopId, type: 'MANAGER_COMP', voidedAt: null, createdAt: { gte: from, lt: to } },
        select: { guestCheckId: true, beforeTotalMinor: true, afterTotalMinor: true },
      }),
    ]);
    const orderIds = completed.map((row) => row.id);
    const checkIds = [...new Set(completed.flatMap((row) => (row.guestCheckId ? [row.guestCheckId] : [])))];
    const lines: Array<{ menuItemId: string; nameSnapshot: string; quantity: number; totalMinor: number }> = orderIds.length
      ? await this.prisma.venueOrderLine.findMany({
          where: { shopId, orderId: { in: orderIds }, canceledAt: null },
          select: { menuItemId: true, nameSnapshot: true, quantity: true, totalMinor: true },
        })
      : [];
    const checks: Array<{ id: string; partySize: number }> = checkIds.length
      ? await this.prisma.guestCheck.findMany({ where: { shopId, id: { in: checkIds } }, select: { id: true, partySize: true } })
      : [];
    const itemIds = [...new Set(lines.map((row) => row.menuItemId))];
    const items: Array<{ id: string; section: { name: string } | null }> = itemIds.length
      ? await this.prisma.menuItem.findMany({ where: { shopId, id: { in: itemIds } }, select: { id: true, section: { select: { name: true } } } })
      : [];
    const section = new Map(items.map((row) => [row.id, row.section?.name ?? 'Uncategorised']));
    const itemMix = new Map<string, { quantity: number; salesMinor: number }>();
    const categoryMix = new Map<string, { quantity: number; salesMinor: number }>();
    for (const row of lines) {
      const item = itemMix.get(row.nameSnapshot) ?? { quantity: 0, salesMinor: 0 };
      item.quantity += row.quantity;
      item.salesMinor += row.totalMinor;
      itemMix.set(row.nameSnapshot, item);
      const name = section.get(row.menuItemId) ?? 'Uncategorised';
      const category = categoryMix.get(name) ?? { quantity: 0, salesMinor: 0 };
      category.quantity += row.quantity;
      category.salesMinor += row.totalMinor;
      categoryMix.set(name, category);
    }
    const covers = checks.reduce((sum, row) => sum + Math.max(1, row.partySize), 0);
    const profileIds = profiles.map((row) => row.guestCheckId);
    const settledTables = profileIds.length
      ? await this.prisma.guestCheck.count({ where: { shopId, id: { in: profileIds }, status: 'SETTLED', settledAt: { gte: from, lt: to } } })
      : 0;
    const servicedTableCount = new Set(profiles.flatMap((row) => (row.resourceId ? [row.resourceId] : []))).size;
    const modes = new Map<string, { orders: number; salesMinor: number }>();
    const servers = new Map<string, number>();
    for (const row of completed) {
      const mode = modes.get(row.serviceMode) ?? { orders: 0, salesMinor: 0 };
      mode.orders += 1;
      mode.salesMinor += row.totalMinor;
      modes.set(row.serviceMode, mode);
      servers.set(row.createdById, (servers.get(row.createdById) ?? 0) + row.totalMinor);
    }
    return {
      covers,
      tableTurns: rounded(average(settledTables, servicedTableCount)),
      averageSpendPerCoverMinor: rounded(average(completed.reduce((sum, row) => sum + row.totalMinor, 0), covers)),
      itemMix: [...itemMix.entries()].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.salesMinor - a.salesMinor),
      categoryMix: [...categoryMix.entries()].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.salesMinor - a.salesMinor),
      kds: { ...baseOperations.kds, lateTicketCount: Math.max(0, baseOperations.kds.completedTicketCount - baseOperations.kds.slaMetCount) },
      voidRatePct: rounded(ratio(cancelled, completed.length + cancelled)),
      compRatePct: rounded(ratio(new Set(comps.map((row) => row.guestCheckId)).size, completed.length)),
      compMinor: comps.reduce((sum, row) => sum + Math.max(0, row.beforeTotalMinor - row.afterTotalMinor), 0),
      serverSales: [...servers.entries()].map(([operatorId, salesMinor]) => ({ operatorId, salesMinor })).sort((a, b) => b.salesMinor - a.salesMinor),
      serviceModeMix: Object.fromEntries(modes),
    };
  }

  private async inventory(context: ReportContext, baseFinance: BaseFinance) {
    const { shopId, from, to, dayCount, currency } = context;
    const [window, history, items] = await Promise.all([
      this.prisma.stockMovement.findMany({ where: { shopId, occurredAt: { gte: from, lt: to } }, orderBy: { occurredAt: 'asc' } }),
      this.prisma.stockMovement.findMany({ where: { shopId, occurredAt: { lt: to } }, select: { stockItemId: true, quantityMilli: true } }),
      this.prisma.stockItem.findMany({ where: { shopId, active: true }, select: { id: true, name: true, reorderLevelMilli: true, weightedAverageCostMinor: true } }),
    ]);
    const theoretical = window.filter((row) => row.kind === 'SALE_CONSUMPTION');
    const reversal = window.filter((row) => row.kind === 'SALE_REVERSAL');
    const waste = window.filter((row) => /WASTE|SPOIL|LOSS/i.test(row.kind));
    const adjustments = window.filter((row) => /STOCKTAKE|ADJUST/i.test(row.kind));
    const cogsMinor = theoretical.reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0) - reversal.reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0);
    const current = new Map<string, number>();
    for (const row of history) current.set(row.stockItemId, (current.get(row.stockItemId) ?? 0) + row.quantityMilli);
    const lowStockRisk: LowStockRisk[] = items.filter((item) => (current.get(item.id) ?? 0) <= item.reorderLevelMilli).map((item) => ({
      stockItemId: item.id,
      name: item.name,
      quantityMilli: current.get(item.id) ?? 0,
      reorderLevelMilli: item.reorderLevelMilli,
    }));
    const currentInventoryValueMinor = items.reduce((sum, item) => sum + Math.round(((current.get(item.id) ?? 0) / 1000) * item.weightedAverageCostMinor), 0);
    const finance = baseFinance.currencies.find((row) => row.currency === currency) ?? baseFinance.currencies[0];
    const netSalesMinor = finance?.netSettledRevenueMinor ?? 0;
    const purchasePriceTrend = items.flatMap((item) => {
      const purchases = window.filter((row) => row.stockItemId === item.id && /PURCHASE|RECEIPT/i.test(row.kind));
      if (!purchases.length) return [];
      const first = purchases[0]!;
      const last = purchases[purchases.length - 1]!;
      return [{ stockItemId: item.id, name: item.name, firstUnitCostMinor: first.unitCostMinor, latestUnitCostMinor: last.unitCostMinor, deltaMinor: last.unitCostMinor - first.unitCostMinor }];
    });
    return {
      theoreticalConsumption: { quantityMilli: theoretical.reduce((sum, row) => sum + Math.abs(row.quantityMilli), 0), costMinor: theoretical.reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0) },
      actualConsumption: { quantityMilli: [...theoretical, ...waste].reduce((sum, row) => sum + Math.abs(row.quantityMilli), 0), costMinor: [...theoretical, ...waste].reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0) },
      variance: { quantityMilli: adjustments.reduce((sum, row) => sum + row.quantityMilli, 0), costMinor: adjustments.reduce((sum, row) => sum + row.totalCostMinor, 0) },
      wasteMinor: waste.reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0),
      cogsMinor,
      grossMarginMinor: netSalesMinor - cogsMinor,
      grossMarginPct: rounded(ratio(netSalesMinor - cogsMinor, netSalesMinor)),
      currentInventoryValueMinor,
      daysOnHand: rounded(cogsMinor > 0 ? currentInventoryValueMinor / (cogsMinor / dayCount) : null),
      lowStockRisk,
      negativeStockCount: lowStockRisk.filter((row) => row.quantityMilli < 0).length,
      purchasePriceTrend,
    };
  }

  private async reservations(context: ReportContext) {
    const { shopId, from, to } = context;
    const bookings = await this.prisma.reservation.findMany({ where: { shopId, startsAt: { gte: from, lt: to } }, select: { id: true, status: true } });
    const ids = bookings.map((row) => row.id);
    const extensions: Array<{ reservationId: string; convertedSessionId: string | null }> = ids.length
      ? await this.prisma.reservationExtension.findMany({ where: { shopId, reservationId: { in: ids } }, select: { reservationId: true, convertedSessionId: true } })
      : [];
    const deposits: Array<{ reservationId: string }> = ids.length
      ? await this.prisma.reservationDepositLedgerEntry.findMany({ where: { shopId, reservationId: { in: ids } }, select: { reservationId: true } })
      : [];
    const applications: Array<{ reservationId: string; amountMinor: number }> = ids.length
      ? await this.prisma.reservationDepositApplication.findMany({ where: { shopId, reservationId: { in: ids } }, select: { reservationId: true, amountMinor: true } })
      : [];
    const [waitlist, sessions] = await Promise.all([
      this.prisma.reservationWaitlistEntry.findMany({ where: { shopId, offeredAt: { gte: from, lt: to } }, select: { createdAt: true, offeredAt: true } }),
      this.prisma.operationsSession.findMany({ where: { shopId, startedAt: { gte: from, lt: to } }, select: { reservationId: true } }),
    ]);
    const converted = new Set(extensions.filter((row) => row.convertedSessionId).map((row) => row.reservationId));
    const depositBearing = new Set(deposits.map((row) => row.reservationId));
    const applied = new Set(applications.map((row) => row.reservationId));
    const finalized = bookings.filter((row) => ['COMPLETED', 'NO_SHOW', 'CANCELED', 'CANCELLED'].includes(String(row.status)));
    const linked = sessions.filter((row) => row.reservationId).length;
    const waits = waitlist.flatMap((row) => row.offeredAt ? [Math.max(0, (row.offeredAt.getTime() - row.createdAt.getTime()) / 60_000)] : []);
    return {
      bookingVolume: bookings.length,
      conversionToSessionPct: rounded(ratio(converted.size, bookings.length)),
      noShowRatePct: rounded(ratio(bookings.filter((row) => String(row.status) === 'NO_SHOW').length, finalized.length)),
      cancellationRatePct: rounded(ratio(bookings.filter((row) => ['CANCELED', 'CANCELLED'].includes(String(row.status))).length, bookings.length)),
      depositConversionPct: rounded(ratio(applied.size, depositBearing.size)),
      depositAppliedMinor: applications.reduce((sum, row) => sum + row.amountMinor, 0),
      occupancySource: { bookingSessions: linked, walkInSessions: sessions.length - linked, bookingPct: rounded(ratio(linked, sessions.length)) },
      averageWaitMinutes: rounded(average(waits.reduce((sum, value) => sum + value, 0), waits.length)),
    };
  }

  private async customers(context: ReportContext, baseGuests: BaseGuests) {
    const { shopId, from, to } = context;
    const [visits, memberships, loyalty, history] = await Promise.all([
      this.prisma.customerVisit.findMany({ where: { shopId, completedAt: { gte: from, lt: to } }, select: { customerId: true, settledAmountMinor: true } }),
      this.prisma.customerMembership.findMany({ where: { shopId, status: 'ACTIVE' }, select: { customerId: true, joinedAt: true, expiresAt: true } }),
      this.prisma.loyaltyLedgerEntry.findMany({ where: { shopId, createdAt: { gte: from, lt: to } }, select: { points: true, type: true } }),
      this.prisma.customerVisit.findMany({ where: { shopId, completedAt: { lt: to } }, select: { customerId: true, settledAmountMinor: true } }),
    ]);
    const members = new Set(memberships.filter((row) => row.joinedAt < to && (!row.expiresAt || row.expiresAt >= from)).map((row) => row.customerId));
    const historyCustomers = new Set(history.map((row) => row.customerId));
    const repeat = baseGuests.repeatVisits.repeatCustomerCount;
    const eligible = baseGuests.repeatVisits.eligibleCustomerCount;
    return {
      newCustomers: Math.max(0, eligible - repeat),
      returningCustomers: repeat,
      visitFrequency: rounded(average(baseGuests.visits.completedVisitCount, baseGuests.visits.identifiedCustomerCount)),
      retentionPct: rounded(baseGuests.repeatVisits.ratePct),
      memberRevenueMinor: visits.filter((row) => members.has(row.customerId)).reduce((sum, row) => sum + (row.settledAmountMinor ?? 0), 0),
      loyaltyRedeemedPoints: loyalty.filter((row) => row.points < 0 || /REDEEM|SPEND/i.test(row.type)).reduce((sum, row) => sum + Math.abs(row.points), 0),
      storedValueLiabilityByCurrency: baseGuests.storedValue.liabilityByCurrency,
      observedLtvMinor: rounded(average(history.reduce((sum, row) => sum + (row.settledAmountMinor ?? 0), 0), historyCustomers.size)),
      ltvMethodology: 'Descriptive settled CustomerVisit value observed up to report end divided by distinct identified customers; not predictive.',
    };
  }

  private async workforce(context: ReportContext, baseFinance: BaseFinance) {
    const { shopId, from, to, currency } = context;
    const [orders, evidence, shifts, punches, memberships] = await Promise.all([
      this.prisma.venueOrder.findMany({ where: { shopId, status: 'COMPLETED', completedAt: { gte: from, lt: to } }, select: { createdById: true, totalMinor: true } }),
      this.prisma.staffActionEvidence.findMany({ where: { shopId, occurredAt: { gte: from, lt: to } }, select: { actorMembershipId: true, actionKind: true, amountMinor: true } }),
      this.prisma.cashSession.findMany({ where: { shopId, status: 'CLOSED', closedAt: { gte: from, lt: to } }, select: { closedById: true, variance: true } }),
      this.prisma.timePunch.findMany({ where: { shopId, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] }, select: { membershipId: true, startedAt: true, endedAt: true } }),
      this.prisma.membership.findMany({ where: { shopId }, select: { id: true, userId: true } }),
    ]);
    const finance = baseFinance.currencies.find((row) => row.currency === currency) ?? baseFinance.currencies[0];
    const sales = new Map<string, number>();
    for (const row of orders) sales.set(row.createdById, (sales.get(row.createdById) ?? 0) + row.totalMinor);
    const worked = new Map<string, number>();
    for (const row of punches) worked.set(row.membershipId, (worked.get(row.membershipId) ?? 0) + clipSeconds(row.startedAt, row.endedAt ?? to, from, to));
    const actions = new Map<string, { count: number; amountMinor: number }>();
    for (const row of evidence.filter((item) => /DISCOUNT|REFUND|VOID|PRICE_OVERRIDE|COMP/i.test(item.actionKind))) {
      const key = `${row.actorMembershipId}|${row.actionKind}`;
      const bucket = actions.get(key) ?? { count: 0, amountMinor: 0 };
      bucket.count += 1;
      bucket.amountMinor += Math.abs(row.amountMinor ?? 0);
      actions.set(key, bucket);
    }
    const cash = new Map<string, number>();
    for (const row of shifts) if (row.closedById) cash.set(row.closedById, (cash.get(row.closedById) ?? 0) + minor(row.variance));
    return {
      laborHours: rounded(baseFinance.workedSeconds / 3600),
      laborToSalesPct: rounded(finance?.laborPct ?? null),
      laborCostMinor: finance?.laborCostMinor ?? 0,
      salesByOperator: [...sales.entries()].map(([userId, salesMinor]) => ({ userId, salesMinor })).sort((a, b) => b.salesMinor - a.salesMinor),
      riskActionsByOperator: [...actions.entries()].map(([key, values]) => { const [membershipId, actionKind] = key.split('|'); return { membershipId, actionKind, ...values }; }),
      cashVarianceByCloser: [...cash.entries()].map(([userId, varianceMinor]) => ({ userId, varianceMinor })),
      shiftProductivity: memberships.flatMap((membership) => {
        const seconds = worked.get(membership.id) ?? 0;
        if (seconds <= 0) return [];
        const salesMinor = sales.get(membership.userId) ?? 0;
        return [{ membershipId: membership.id, userId: membership.userId, workedHours: rounded(seconds / 3600), salesMinor, salesPerWorkedHourMinor: rounded(salesMinor / (seconds / 3600)) }];
      }),
    };
  }

  private async reconciliation(
    context: ReportContext,
    baseFinance: BaseFinance,
    baseGuests: BaseGuests,
    inventory: { lowStockRisk: LowStockRisk[] },
  ) {
    const { shopId, from, to, slug, currency } = context;
    const [persisted, settledChecks, offline] = await Promise.all([
      this.prisma.financialReconciliationIssue.findMany({
        where: { shopId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        orderBy: [{ severity: 'desc' }, { firstSeenAt: 'asc' }],
        take: 250,
      }),
      this.prisma.guestCheck.findMany({
        where: { shopId, status: 'SETTLED', settledAt: { gte: from, lt: to } },
        select: { id: true, currentSettlementId: true, currentSettlement: { select: { state: true, amountDue: true } } },
      }),
      this.prisma.domainEventOutbox.findMany({
        where: {
          shopId,
          status: { in: ['FAILED', 'DEAD'] },
          createdAt: { gte: from, lt: to },
          OR: [
            { eventType: { contains: 'offline', mode: 'insensitive' } },
            { eventType: { contains: 'edge', mode: 'insensitive' } },
            { eventType: { contains: 'sync', mode: 'insensitive' } },
          ],
        },
        select: { id: true, aggregateType: true, aggregateId: true, eventType: true, status: true, lastError: true, createdAt: true, updatedAt: true },
      }),
    ]);
    const now = new Date();
    const issues: ReconciliationIssueView[] = persisted.map((row) => ({
      id: row.id,
      type: String(row.type),
      severity: row.severity,
      amountMinor: row.amount == null ? null : minor(row.amount),
      currency: row.currency,
      affectedEntities: row.entityType ? [{ type: row.entityType, id: row.entityId }] : [],
      firstSeenAt: row.firstSeenAt,
      lastCheckedAt: row.lastSeenAt,
      message: row.message,
      suggestedNextAction: actionFor(String(row.type)),
      evidenceLinks: row.entityType && row.entityId ? [`/dashboard/${slug}/analytics?evidence=${encodeURIComponent(`${row.entityType}:${row.entityId}`)}`] : [],
      source: 'FinancialReconciliationIssue',
    }));
    for (const row of settledChecks.filter((item) => !item.currentSettlement || !['PAID', 'CLOSED'].includes(String(item.currentSettlement.state)))) {
      issues.push({
        id: `check:${row.id}`,
        type: 'GUEST_CHECK_SETTLEMENT_MISMATCH',
        severity: 'HIGH',
        amountMinor: row.currentSettlement ? minor(row.currentSettlement.amountDue) : null,
        currency,
        affectedEntities: [{ type: 'GUEST_CHECK', id: row.id }],
        firstSeenAt: now,
        lastCheckedAt: now,
        message: 'Settled GuestCheck does not point to a PAID/CLOSED current settlement.',
        suggestedNextAction: actionFor('GUEST_CHECK_SETTLEMENT_MISMATCH'),
        evidenceLinks: [`/dashboard/${slug}/analytics?evidence=GUEST_CHECK:${encodeURIComponent(row.id)}`],
        source: 'Phase14 live invariant',
      });
    }
    for (const row of baseFinance.currencies.filter((item) => item.reconciliationVarianceMinor !== 0)) {
      issues.push({ id: `provider:${row.currency}`, type: 'PAYMENT_PROVIDER_MISMATCH', severity: 'HIGH', amountMinor: Math.abs(row.reconciliationVarianceMinor), currency: row.currency, affectedEntities: [], firstSeenAt: now, lastCheckedAt: now, message: 'Canonical ledger net does not equal successful payment/refund net.', suggestedNextAction: actionFor('PAYMENT_PROVIDER_MISMATCH'), evidenceLinks: [`/dashboard/${slug}/analytics?view=finance`], source: 'GrowthAnalyticsService reconciliation' });
    }
    for (const [liabilityCurrency, liability] of Object.entries(baseGuests.storedValue.liabilityByCurrency)) {
      if (liability < 0) issues.push({ id: `stored:${liabilityCurrency}`, type: 'STORED_VALUE_LIABILITY_MISMATCH', severity: 'CRITICAL', amountMinor: Math.abs(liability), currency: liabilityCurrency, affectedEntities: [], firstSeenAt: now, lastCheckedAt: now, message: 'Stored-value ledger liability is negative.', suggestedNextAction: actionFor('STORED_VALUE_LIABILITY_MISMATCH'), evidenceLinks: [`/dashboard/${slug}/analytics?view=guests`], source: 'StoredValueLedgerEntry' });
    }
    for (const row of inventory.lowStockRisk.filter((item) => item.quantityMilli < 0)) {
      issues.push({ id: `inventory:${row.stockItemId}`, type: 'INVENTORY_ANOMALY', severity: 'MEDIUM', amountMinor: null, currency, affectedEntities: [{ type: 'STOCK_ITEM', id: row.stockItemId }], firstSeenAt: now, lastCheckedAt: now, message: `${row.name} has negative stock (${row.quantityMilli}/1000).`, suggestedNextAction: actionFor('INVENTORY_ANOMALY'), evidenceLinks: [`/dashboard/${slug}/analytics?evidence=STOCK_ITEM:${encodeURIComponent(row.stockItemId)}`], source: 'StockMovement ledger' });
    }
    for (const row of offline) {
      issues.push({ id: `offline:${row.id}`, type: 'OFFLINE_SYNC_UNRESOLVED', severity: row.status === 'DEAD' ? 'HIGH' : 'MEDIUM', amountMinor: null, currency, affectedEntities: [{ type: row.aggregateType, id: row.aggregateId }], firstSeenAt: row.createdAt, lastCheckedAt: row.updatedAt, message: `${row.eventType} is ${row.status}${row.lastError ? `: ${row.lastError}` : ''}`, suggestedNextAction: actionFor('OFFLINE_SYNC_UNRESOLVED'), evidenceLinks: [`/dashboard/${slug}/analytics?evidence=DOMAIN_EVENT:${encodeURIComponent(row.id)}`], source: 'DomainEventOutbox' });
    }
    const severity: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    issues.sort((a, b) => (severity[b.severity] ?? 0) - (severity[a.severity] ?? 0) || a.firstSeenAt.getTime() - b.firstSeenAt.getTime());
    return { checkedAt: now, clear: issues.length === 0, issueCount: issues.length, issues };
  }

  private attention(
    reconciliation: { issues: ReconciliationIssueView[] },
    inventory: { lowStockRisk: LowStockRisk[] },
    reservations: { noShowRatePct: number | null },
    baseOperations: BaseOperations,
  ) {
    const items: AttentionItem[] = reconciliation.issues.map((issue) => ({
      id: `reconciliation:${issue.id}`,
      domain: 'RECONCILIATION',
      severity: issue.severity,
      title: issue.type,
      detail: issue.message,
      suggestedNextAction: issue.suggestedNextAction,
      evidenceLinks: issue.evidenceLinks,
    }));
    for (const row of inventory.lowStockRisk.slice(0, 25)) {
      items.push({ id: `stock:${row.stockItemId}`, domain: 'INVENTORY', severity: row.quantityMilli < 0 ? 'HIGH' : 'MEDIUM', title: 'LOW_STOCK', detail: `${row.name}: ${row.quantityMilli}/1000 on hand; reorder level ${row.reorderLevelMilli}/1000.`, suggestedNextAction: 'Inspect movements and replenishment before changing stock.', evidenceLinks: [] });
    }
    if ((reservations.noShowRatePct ?? 0) > 20) items.push({ id: 'reservation:no-show', domain: 'RESERVATION', severity: 'MEDIUM', title: 'HIGH_NO_SHOW_RATE', detail: `No-show rate is ${reservations.noShowRatePct}%.`, suggestedNextAction: 'Review reminders and deposit policy with the underlying booking cohort.', evidenceLinks: [] });
    if ((baseOperations.kds.slaPct ?? 100) < 80) items.push({ id: 'restaurant:kds', domain: 'RESTAURANT', severity: 'MEDIUM', title: 'KDS_SLA_BELOW_TARGET', detail: `KDS SLA attainment is ${rounded(baseOperations.kds.slaPct)}%.`, suggestedNextAction: 'Inspect station-level late tickets and measured prep bottlenecks.', evidenceLinks: [] });
    return { generatedAt: new Date(), itemCount: items.length, items };
  }
}
