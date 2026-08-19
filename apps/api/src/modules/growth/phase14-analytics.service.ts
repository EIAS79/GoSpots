import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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

function decimalToMinor(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  const numeric = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function avg(total: number, count: number) {
  return count > 0 ? total / count : null;
}

function round(value: number | null, places = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function nextAction(type: string) {
  if (type.includes('PAYMENT') || type.includes('PROVIDER')) return 'Query the provider/reference, then reconcile the payment exactly once before allowing a retry.';
  if (type.includes('CASH')) return 'Open the affected cash shift, recount evidence and resolve or approve the variance.';
  if (type.includes('FISCAL') || type.includes('KSEF')) return 'Open the compliance request, verify provider state and retry only through the idempotent compliance workflow.';
  if (type.includes('STORED_VALUE')) return 'Inspect the stored-value ledger for the affected account; do not edit a balance directly.';
  if (type.includes('INVENTORY')) return 'Inspect movement history and stocktake boundary before posting an audited correction.';
  if (type.includes('OFFLINE')) return 'Inspect the Edge/outbox correlation and resolve the conflict or dead-letter before replay.';
  if (type.includes('GUEST_CHECK') || type.includes('SETTLEMENT')) return 'Inspect the GuestCheck, immutable settlement and payment allocation lineage before changing state.';
  return 'Inspect the linked canonical facts and resolve the underlying source discrepancy.';
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
    const context = await this.resolveContext(actor, fromDate, toDate);
    const { shopId, from, to } = context;
    const [financeBase, operationsBase, guestsBase] = await Promise.all([
      this.baseAnalytics.finance(actor, from, to),
      this.baseAnalytics.operations(actor, from, to),
      this.baseAnalytics.guests(actor, from, to),
    ]);

    const [financial, resources, restaurant, inventory, reservations, customers, workforce] =
      await Promise.all([
        this.financial(shopId, context, financeBase),
        this.resources(shopId, context, operationsBase),
        this.restaurant(shopId, context, operationsBase),
        this.inventory(shopId, context, financeBase),
        this.reservations(shopId, context),
        this.customers(shopId, context, guestsBase),
        this.workforce(shopId, context, financeBase),
      ]);

    const reconciliation = await this.reconciliationCenter(
      shopId,
      context,
      financeBase,
      inventory,
    );
    const attention = this.attentionCenter(reconciliation, inventory, reservations, operationsBase);

    return {
      sourceVersion: SOURCE_VERSION,
      canonicalFinancialAuthority: 'LedgerEntry -> settlement/payment/refund/cash/compliance projections',
      context: {
        shopId,
        slug: context.slug,
        branchCode: context.branchCode,
        currency: context.currency,
        timezone: context.timezone,
        businessDayStartMinutes: context.businessDayStartMinutes,
        fromDate,
        toDate,
        from,
        to,
        elapsedHours: round((to.getTime() - from.getTime()) / 3_600_000, 4),
      },
      financial,
      resources,
      restaurant,
      inventory,
      reservations,
      customers,
      workforce,
      reconciliation,
      attention,
    };
  }

  async reconciliationOnly(actor: JwtAccessPayload, fromDate: string, toDate: string) {
    const context = await this.resolveContext(actor, fromDate, toDate);
    const financeBase = await this.baseAnalytics.finance(actor, context.from, context.to);
    const inventory = await this.inventory(context.shopId, context, financeBase);
    return this.reconciliationCenter(context.shopId, context, financeBase, inventory);
  }

  private async resolveContext(actor: JwtAccessPayload, fromDate: string, toDate: string) {
    const shopId = requireShopId(actor);
    if (!DATE_KEY.test(fromDate) || !DATE_KEY.test(toDate) || fromDate > toDate) {
      throw new BadRequestException('fromDate/toDate must be valid ordered YYYY-MM-DD venue business dates');
    }
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        slug: true,
        branchCode: true,
        currency: true,
        timezone: true,
        businessDayStartMinutes: true,
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    const first = businessDayBounds({
      dateKey: fromDate,
      timeZone: shop.timezone,
      startMinutes: shop.businessDayStartMinutes,
    });
    const last = businessDayBounds({
      dateKey: toDate,
      timeZone: shop.timezone,
      startMinutes: shop.businessDayStartMinutes,
    });
    const from = first.start;
    const to = last.end;
    const dayCount = Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000) + 1;
    if (!Number.isFinite(dayCount) || dayCount < 1 || dayCount > 370) {
      throw new BadRequestException('Analytics range must contain between 1 and 370 business dates');
    }
    return { ...shop, shopId, from, to, dayCount };
  }

  private async financial(shopId: string, context: any, base: any) {
    const { from, to } = context;
    const [settlements, adjustments, serviceLines, payments, cashSessions] = await Promise.all([
      this.prisma.checkSettlement.findMany({
        where: { shopId, state: { in: ['PAID', 'CLOSED'] }, createdAt: { gte: from, lt: to } },
        select: { id: true, guestCheckId: true, subtotal: true, adjustments: true, taxAmount: true, total: true, currency: true },
      }),
      this.prisma.commercialAdjustment.findMany({
        where: { shopId, createdAt: { gte: from, lt: to }, voidedAt: null },
        select: { type: true, beforeTotalMinor: true, afterTotalMinor: true, createdById: true, guestCheckId: true },
      }),
      this.prisma.chargeSnapshot.findMany({
        where: {
          shopId,
          settlement: { state: { in: ['PAID', 'CLOSED'] }, createdAt: { gte: from, lt: to } },
          sourceType: { contains: 'SERVICE', mode: 'insensitive' },
        },
        select: { finalAmount: true, currency: true },
      }),
      this.prisma.payment.findMany({
        where: { shopId, status: 'SUCCESS', succeededAt: { gte: from, lt: to } },
        select: { amount: true, currency: true, method: true },
      }),
      this.prisma.cashSession.findMany({
        where: { shopId, status: 'CLOSED', closedAt: { gte: from, lt: to } },
        select: { closedExpectedCash: true, countedCash: true, variance: true, currency: true },
      }),
    ]);

    const currencyRows = base.currencies.map((row: any) => {
      const currency = row.currency;
      const scopedSettlements = settlements.filter((item) => item.currency === currency);
      const grossSalesMinor = scopedSettlements.reduce((sum, item) => sum + decimalToMinor(item.subtotal), 0);
      const taxMinor = scopedSettlements.reduce((sum, item) => sum + decimalToMinor(item.taxAmount), 0);
      const paymentMethod = new Map<string, { count: number; amountMinor: number }>();
      for (const payment of payments.filter((item) => item.currency === currency)) {
        const bucket = paymentMethod.get(payment.method) ?? { count: 0, amountMinor: 0 };
        bucket.count += 1;
        bucket.amountMinor += decimalToMinor(payment.amount);
        paymentMethod.set(payment.method, bucket);
      }
      const scopedCash = cashSessions.filter((item) => item.currency === currency);
      const elapsedHours = (to.getTime() - from.getTime()) / 3_600_000;
      return {
        currency,
        grossSalesMinor,
        netSalesMinor: row.netSettledRevenueMinor,
        taxMinor,
        refundsMinor: row.ledgerRefundMinor,
        discountsMinor: adjustments.reduce((sum, item) => {
          if (item.type === 'MANAGER_COMP') return sum;
          return sum + Math.max(0, item.beforeTotalMinor - item.afterTotalMinor);
        }, 0),
        compsMinor: adjustments
          .filter((item) => item.type === 'MANAGER_COMP')
          .reduce((sum, item) => sum + Math.max(0, item.beforeTotalMinor - item.afterTotalMinor), 0),
        tipsMinor: row.tipMinor,
        serviceChargesMinor: serviceLines
          .filter((item) => item.currency === currency)
          .reduce((sum, item) => sum + decimalToMinor(item.finalAmount), 0),
        averageCheckMinor: round(avg(scopedSettlements.reduce((sum, item) => sum + decimalToMinor(item.total), 0), scopedSettlements.length)),
        revenuePerElapsedHourMinor: round(elapsedHours > 0 ? row.netSettledRevenueMinor / elapsedHours : null),
        paymentMethod: Object.fromEntries(paymentMethod),
        cash: {
          shiftCount: scopedCash.length,
          expectedMinor: scopedCash.reduce((sum, item) => sum + decimalToMinor(item.closedExpectedCash), 0),
          countedMinor: scopedCash.reduce((sum, item) => sum + decimalToMinor(item.countedCash), 0),
          varianceMinor: scopedCash.reduce((sum, item) => sum + decimalToMinor(item.variance), 0),
        },
        reconciliationVarianceMinor: row.reconciliationVarianceMinor,
        cogsMinor: row.cogsMinor,
        laborCostMinor: row.laborCostMinor,
      };
    });

    return {
      sourceOfTruth: 'LedgerEntry + immutable CheckSettlement/ChargeSnapshot projections',
      currencies: currencyRows,
      revenueByBranch: currencyRows.map((row: any) => ({
        shopId,
        branchCode: context.branchCode,
        currency: row.currency,
        netSalesMinor: row.netSalesMinor,
      })),
    };
  }

  private async resources(shopId: string, context: any, base: any) {
    const { from, to, timezone } = context;
    const [sessions, maintenance, windows] = await Promise.all([
      this.prisma.operationsSession.findMany({
        where: { shopId, startedAt: { lt: to }, OR: [{ finishedAt: null }, { finishedAt: { gt: from } }] },
        select: { id: true, resourceId: true, guestCheckId: true, startedAt: true, finishedAt: true, accruedMinor: true },
      }),
      this.prisma.resourceMaintenancePeriod.findMany({
        where: { shopId, startsAt: { lt: to }, OR: [{ endsAt: null }, { endsAt: { gt: from } }] },
        select: { resourceId: true, startsAt: true, endsAt: true },
      }),
      listOpeningWindows(this.prisma, shopId, from, to),
    ]);
    const sessionIds = sessions.map((row) => row.id);
    const checkIds = sessions.flatMap((row) => (row.guestCheckId ? [row.guestCheckId] : []));
    const orders = sessionIds.length || checkIds.length
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
    const attachedSessionIds = new Set<string>();
    for (const order of orders) {
      if (order.operationsSessionId) attachedSessionIds.add(order.operationsSessionId);
      if (order.guestCheckId) {
        sessions.filter((row) => row.guestCheckId === order.guestCheckId).forEach((row) => attachedSessionIds.add(row.id));
      }
    }
    const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' });
    const peaks = new Map<string, number>();
    for (const session of sessions.filter((row) => row.startedAt >= from && row.startedAt < to)) {
      const hour = hourFmt.format(session.startedAt);
      peaks.set(hour, (peaks.get(hour) ?? 0) + 1);
    }
    const openMinutesPerResource = windows.reduce((sum, window) => sum + clipSeconds(window.opensAt, window.closesAt, from, to) / 60, 0);
    const maintenanceDowntimeMinutes = maintenance.reduce((sum, period) => {
      return sum + windows.reduce((inside, window) => inside + clipSeconds(
        period.startsAt > window.opensAt ? period.startsAt : window.opensAt,
        (period.endsAt ?? to) < window.closesAt ? (period.endsAt ?? to) : window.closesAt,
        from,
        to,
      ) / 60, 0);
    }, 0);
    const rows = base.resources.rows.map((row: any) => ({
      ...row,
      averageSessionDurationMinutes: round(avg(row.occupiedMinutes, row.sessionCount)),
      revenuePerSessionMinor: round(avg(row.accruedResourceRevenueMinor, row.sessionCount)),
      revenuePerOccupiedHourMinor: round(row.occupiedMinutes > 0 ? row.accruedResourceRevenueMinor / (row.occupiedMinutes / 60) : null),
      revenuePerAvailableHourMinor: round(row.availableMinutes > 0 ? row.accruedResourceRevenueMinor / (row.availableMinutes / 60) : null),
    }));
    return {
      ...base.resources,
      openingMinutesPerResource: round(openMinutesPerResource),
      maintenanceDowntimeMinutes: round(maintenanceDowntimeMinutes),
      averageSessionDurationMinutes: round(avg(base.resources.occupiedMinutes, sessions.length)),
      revenuePerSessionMinor: round(avg(base.resources.accruedResourceRevenueMinor, sessions.length)),
      revenuePerOccupiedResourceHourMinor: round(base.resources.occupiedMinutes > 0 ? base.resources.accruedResourceRevenueMinor / (base.resources.occupiedMinutes / 60) : null),
      revenuePerAvailableResourceHourMinor: round(base.resources.availableMinutes > 0 ? base.resources.accruedResourceRevenueMinor / (base.resources.availableMinutes / 60) : null),
      fbAttachRatePct: round(pct(attachedSessionIds.size, sessions.length)),
      peakHours: [...peaks.entries()].map(([hour, sessionStarts]) => ({ hour: Number(hour), sessionStarts })).sort((a, b) => b.sessionStarts - a.sessionStarts || a.hour - b.hour),
      profitability: rows.sort((a: any, b: any) => (b.revenuePerAvailableHourMinor ?? -1) - (a.revenuePerAvailableHourMinor ?? -1)),
    };
  }

  private async restaurant(shopId: string, context: any, operationsBase: any) {
    const { from, to } = context;
    const [completed, cancelled, profiles, comps] = await Promise.all([
      this.prisma.venueOrder.findMany({
        where: { shopId, status: 'COMPLETED', completedAt: { gte: from, lt: to } },
        select: { id: true, guestCheckId: true, totalMinor: true, serviceMode: true, createdById: true },
      }),
      this.prisma.venueOrder.count({ where: { shopId, status: 'CANCELLED', canceledAt: { gte: from, lt: to } } }),
      this.prisma.guestCheckCommercialProfile.findMany({
        where: { shopId, checkType: 'RESTAURANT_TABLE', guestCheck: undefined as never },
        select: { guestCheckId: true, resourceId: true },
      }).catch(async () => this.prisma.guestCheckCommercialProfile.findMany({
        where: { shopId, checkType: 'RESTAURANT_TABLE' },
        select: { guestCheckId: true, resourceId: true },
      })),
      this.prisma.commercialAdjustment.findMany({
        where: { shopId, type: 'MANAGER_COMP', voidedAt: null, createdAt: { gte: from, lt: to } },
        select: { guestCheckId: true, beforeTotalMinor: true, afterTotalMinor: true },
      }),
    ]);
    const orderIds = completed.map((row) => row.id);
    const checkIds = [...new Set(completed.flatMap((row) => (row.guestCheckId ? [row.guestCheckId] : [])))];
    const [lines, checks] = await Promise.all([
      orderIds.length ? this.prisma.venueOrderLine.findMany({
        where: { shopId, orderId: { in: orderIds }, canceledAt: null },
        select: { menuItemId: true, nameSnapshot: true, quantity: true, totalMinor: true },
      }) : Promise.resolve([]),
      checkIds.length ? this.prisma.guestCheck.findMany({ where: { shopId, id: { in: checkIds } }, select: { id: true, partySize: true } }) : Promise.resolve([]),
    ]);
    const menuItemIds = [...new Set(lines.map((row) => row.menuItemId))];
    const menuItems = menuItemIds.length ? await this.prisma.menuItem.findMany({
      where: { shopId, id: { in: menuItemIds } },
      select: { id: true, section: { select: { name: true } } },
    }) : [];
    const sectionByItem = new Map(menuItems.map((row) => [row.id, row.section?.name ?? 'Uncategorised']));
    const itemMix = new Map<string, { quantity: number; salesMinor: number }>();
    const categoryMix = new Map<string, { quantity: number; salesMinor: number }>();
    for (const line of lines) {
      const item = itemMix.get(line.nameSnapshot) ?? { quantity: 0, salesMinor: 0 };
      item.quantity += line.quantity; item.salesMinor += line.totalMinor; itemMix.set(line.nameSnapshot, item);
      const category = sectionByItem.get(line.menuItemId) ?? 'Uncategorised';
      const cat = categoryMix.get(category) ?? { quantity: 0, salesMinor: 0 };
      cat.quantity += line.quantity; cat.salesMinor += line.totalMinor; categoryMix.set(category, cat);
    }
    const covers = checks.reduce((sum, check) => sum + Math.max(1, check.partySize), 0);
    const profileCheckIds = profiles.map((row) => row.guestCheckId);
    const settledTableChecks = profileCheckIds.length ? await this.prisma.guestCheck.count({
      where: { shopId, id: { in: profileCheckIds }, status: 'SETTLED', settledAt: { gte: from, lt: to } },
    }) : 0;
    const tableCount = new Set(profiles.flatMap((row) => (row.resourceId ? [row.resourceId] : []))).size;
    const serviceMode = new Map<string, { orders: number; salesMinor: number }>();
    const serverSales = new Map<string, number>();
    for (const order of completed) {
      const mode = serviceMode.get(order.serviceMode) ?? { orders: 0, salesMinor: 0 };
      mode.orders += 1; mode.salesMinor += order.totalMinor; serviceMode.set(order.serviceMode, mode);
      serverSales.set(order.createdById, (serverSales.get(order.createdById) ?? 0) + order.totalMinor);
    }
    return {
      covers,
      tableTurns: round(avg(settledTableChecks, tableCount)),
      averageSpendPerCoverMinor: round(avg(completed.reduce((sum, row) => sum + row.totalMinor, 0), covers)),
      itemMix: [...itemMix.entries()].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.salesMinor - a.salesMinor),
      categoryMix: [...categoryMix.entries()].map(([category, values]) => ({ category, ...values })).sort((a, b) => b.salesMinor - a.salesMinor),
      kds: { ...operationsBase.kds, lateTicketCount: Math.max(0, operationsBase.kds.completedTicketCount - operationsBase.kds.slaMetCount) },
      voidRatePct: round(pct(cancelled, completed.length + cancelled)),
      compRatePct: round(pct(new Set(comps.map((row) => row.guestCheckId)).size, completed.length)),
      compMinor: comps.reduce((sum, row) => sum + Math.max(0, row.beforeTotalMinor - row.afterTotalMinor), 0),
      serverSales: [...serverSales.entries()].map(([operatorId, salesMinor]) => ({ operatorId, salesMinor })).sort((a, b) => b.salesMinor - a.salesMinor),
      serviceModeMix: Object.fromEntries(serviceMode),
    };
  }

  private async inventory(shopId: string, context: any, financeBase: any) {
    const { from, to, dayCount, currency } = context;
    const [windowMovements, allMovements, items] = await Promise.all([
      this.prisma.stockMovement.findMany({ where: { shopId, occurredAt: { gte: from, lt: to } }, orderBy: { occurredAt: 'asc' } }),
      this.prisma.stockMovement.findMany({ where: { shopId, occurredAt: { lt: to } }, select: { stockItemId: true, quantityMilli: true, totalCostMinor: true, unitCostMinor: true, kind: true, occurredAt: true } }),
      this.prisma.stockItem.findMany({ where: { shopId, active: true }, select: { id: true, name: true, reorderLevelMilli: true, weightedAverageCostMinor: true } }),
    ]);
    const isWaste = (kind: string) => /WASTE|SPOIL|LOSS/i.test(kind);
    const isAdjustment = (kind: string) => /STOCKTAKE|ADJUST/i.test(kind);
    const theoretical = windowMovements.filter((row) => row.kind === 'SALE_CONSUMPTION');
    const actual = windowMovements.filter((row) => row.kind === 'SALE_CONSUMPTION' || isWaste(row.kind));
    const cogsMinor = theoretical.reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0) - windowMovements.filter((row) => row.kind === 'SALE_REVERSAL').reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0);
    const stockByItem = new Map<string, number>();
    for (const row of allMovements) stockByItem.set(row.stockItemId, (stockByItem.get(row.stockItemId) ?? 0) + row.quantityMilli);
    const lowStock = items.filter((item) => (stockByItem.get(item.id) ?? 0) <= item.reorderLevelMilli).map((item) => ({
      stockItemId: item.id,
      name: item.name,
      quantityMilli: stockByItem.get(item.id) ?? 0,
      reorderLevelMilli: item.reorderLevelMilli,
    }));
    const inventoryValueMinor = items.reduce((sum, item) => sum + Math.round(((stockByItem.get(item.id) ?? 0) / 1000) * item.weightedAverageCostMinor), 0);
    const financeCurrency = financeBase.currencies.find((row: any) => row.currency === currency) ?? financeBase.currencies[0];
    const netSalesMinor = financeCurrency?.netSettledRevenueMinor ?? 0;
    const purchaseTrend = items.flatMap((item) => {
      const purchases = windowMovements.filter((row) => row.stockItemId === item.id && /PURCHASE|RECEIPT/i.test(row.kind));
      if (!purchases.length) return [];
      return [{ stockItemId: item.id, name: item.name, firstUnitCostMinor: purchases[0]!.unitCostMinor, latestUnitCostMinor: purchases[purchases.length - 1]!.unitCostMinor, deltaMinor: purchases[purchases.length - 1]!.unitCostMinor - purchases[0]!.unitCostMinor }];
    });
    return {
      theoreticalConsumption: {
        quantityMilli: theoretical.reduce((sum, row) => sum + Math.abs(row.quantityMilli), 0),
        costMinor: theoretical.reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0),
      },
      actualConsumption: {
        quantityMilli: actual.reduce((sum, row) => sum + Math.abs(row.quantityMilli), 0),
        costMinor: actual.reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0),
      },
      variance: {
        quantityMilli: windowMovements.filter((row) => isAdjustment(row.kind)).reduce((sum, row) => sum + row.quantityMilli, 0),
        costMinor: windowMovements.filter((row) => isAdjustment(row.kind)).reduce((sum, row) => sum + row.totalCostMinor, 0),
      },
      wasteMinor: windowMovements.filter((row) => isWaste(row.kind)).reduce((sum, row) => sum + Math.abs(row.totalCostMinor), 0),
      cogsMinor,
      grossMarginMinor: netSalesMinor - cogsMinor,
      grossMarginPct: round(pct(netSalesMinor - cogsMinor, netSalesMinor)),
      currentInventoryValueMinor: inventoryValueMinor,
      daysOnHand: round(cogsMinor > 0 ? inventoryValueMinor / (cogsMinor / dayCount) : null),
      lowStockRisk: lowStock,
      negativeStockCount: lowStock.filter((row) => row.quantityMilli < 0).length,
      purchasePriceTrend: purchaseTrend,
    };
  }

  private async reservations(shopId: string, context: any) {
    const { from, to } = context;
    const reservations = await this.prisma.reservation.findMany({
      where: { shopId, startsAt: { gte: from, lt: to } },
      select: { id: true, status: true, startsAt: true },
    });
    const ids = reservations.map((row) => row.id);
    const [extensions, depositEntries, applications, waitlist, sessions] = await Promise.all([
      ids.length ? this.prisma.reservationExtension.findMany({ where: { shopId, reservationId: { in: ids } }, select: { reservationId: true, convertedSessionId: true } }) : Promise.resolve([]),
      ids.length ? this.prisma.reservationDepositLedgerEntry.findMany({ where: { shopId, reservationId: { in: ids } }, select: { reservationId: true } }) : Promise.resolve([]),
      ids.length ? this.prisma.reservationDepositApplication.findMany({ where: { shopId, reservationId: { in: ids } }, select: { reservationId: true, amountMinor: true } }) : Promise.resolve([]),
      this.prisma.reservationWaitlistEntry.findMany({ where: { shopId, offeredAt: { gte: from, lt: to } }, select: { createdAt: true, offeredAt: true } }),
      this.prisma.operationsSession.findMany({ where: { shopId, startedAt: { gte: from, lt: to } }, select: { reservationId: true } }),
    ]);
    const converted = new Set(extensions.filter((row) => row.convertedSessionId).map((row) => row.reservationId));
    const depositBearing = new Set(depositEntries.map((row) => row.reservationId));
    const applied = new Set(applications.map((row) => row.reservationId));
    const finalized = reservations.filter((row) => ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'CANCELED'].includes(String(row.status)));
    const reservationLinked = sessions.filter((row) => row.reservationId).length;
    const waits = waitlist.flatMap((row) => row.offeredAt ? [Math.max(0, (row.offeredAt.getTime() - row.createdAt.getTime()) / 60_000)] : []);
    return {
      bookingVolume: reservations.length,
      conversionToSessionPct: round(pct(converted.size, reservations.length)),
      noShowRatePct: round(pct(reservations.filter((row) => row.status === 'NO_SHOW').length, finalized.length)),
      cancellationRatePct: round(pct(reservations.filter((row) => ['CANCELLED', 'CANCELED'].includes(String(row.status))).length, reservations.length)),
      depositConversionPct: round(pct(applied.size, depositBearing.size)),
      depositAppliedMinor: applications.reduce((sum, row) => sum + row.amountMinor, 0),
      occupancySource: { bookingSessions: reservationLinked, walkInSessions: sessions.length - reservationLinked, bookingPct: round(pct(reservationLinked, sessions.length)) },
      averageWaitMinutes: round(avg(waits.reduce((sum, value) => sum + value, 0), waits.length)),
    };
  }

  private async customers(shopId: string, context: any, base: any) {
    const { from, to } = context;
    const [visits, memberships, loyalty, historical] = await Promise.all([
      this.prisma.customerVisit.findMany({ where: { shopId, completedAt: { gte: from, lt: to } }, select: { customerId: true, settledAmountMinor: true } }),
      this.prisma.customerMembership.findMany({ where: { shopId, status: 'ACTIVE' }, select: { customerId: true, joinedAt: true, expiresAt: true } }),
      this.prisma.loyaltyLedgerEntry.findMany({ where: { shopId, createdAt: { gte: from, lt: to } }, select: { points: true, type: true } }),
      this.prisma.customerVisit.findMany({ where: { shopId, completedAt: { lt: to } }, select: { customerId: true, settledAmountMinor: true } }),
    ]);
    const members = new Set(memberships.filter((row) => row.joinedAt < to && (!row.expiresAt || row.expiresAt >= from)).map((row) => row.customerId));
    const memberRevenueMinor = visits.filter((row) => members.has(row.customerId)).reduce((sum, row) => sum + (row.settledAmountMinor ?? 0), 0);
    const historicalCustomers = new Set(historical.map((row) => row.customerId));
    const historicalRevenue = historical.reduce((sum, row) => sum + (row.settledAmountMinor ?? 0), 0);
    const returning = base.repeatVisits.repeatCustomerCount;
    const eligible = base.repeatVisits.eligibleCustomerCount;
    return {
      newCustomers: Math.max(0, eligible - returning),
      returningCustomers: returning,
      visitFrequency: round(avg(base.visits.completedVisitCount, base.visits.identifiedCustomerCount)),
      retentionPct: round(base.repeatVisits.ratePct),
      memberRevenueMinor,
      loyaltyRedeemedPoints: loyalty.filter((row) => row.points < 0 || /REDEEM|SPEND/i.test(row.type)).reduce((sum, row) => sum + Math.abs(row.points), 0),
      storedValueLiabilityByCurrency: base.storedValue.liabilityByCurrency,
      observedLtvMinor: round(avg(historicalRevenue, historicalCustomers.size)),
      ltvMethodology: 'Descriptive settled CustomerVisit value observed up to the report end divided by distinct identified customers; not a predictive lifetime model.',
    };
  }

  private async workforce(shopId: string, context: any, financeBase: any) {
    const { from, to, currency } = context;
    const [orders, evidence, cash, punches, memberships] = await Promise.all([
      this.prisma.venueOrder.findMany({ where: { shopId, status: 'COMPLETED', completedAt: { gte: from, lt: to } }, select: { createdById: true, totalMinor: true } }),
      this.prisma.staffActionEvidence.findMany({ where: { shopId, occurredAt: { gte: from, lt: to }, actionKind: { in: ['DISCOUNT', 'REFUND', 'VOID', 'PRICE_OVERRIDE', 'COMP'] } }, select: { actorMembershipId: true, actionKind: true, amountMinor: true } }),
      this.prisma.cashSession.findMany({ where: { shopId, status: 'CLOSED', closedAt: { gte: from, lt: to } }, select: { closedById: true, variance: true } }),
      this.prisma.timePunch.findMany({ where: { shopId, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] }, select: { membershipId: true, startedAt: true, endedAt: true } }),
      this.prisma.membership.findMany({ where: { shopId }, select: { id: true, userId: true } }),
    ]);
    const finance = financeBase.currencies.find((row: any) => row.currency === currency) ?? financeBase.currencies[0];
    const salesByUser = new Map<string, number>();
    for (const order of orders) salesByUser.set(order.createdById, (salesByUser.get(order.createdById) ?? 0) + order.totalMinor);
    const workedByMembership = new Map<string, number>();
    for (const punch of punches) workedByMembership.set(punch.membershipId, (workedByMembership.get(punch.membershipId) ?? 0) + clipSeconds(punch.startedAt, punch.endedAt ?? to, from, to));
    const actionGroups = new Map<string, { count: number; amountMinor: number }>();
    for (const row of evidence) {
      const key = `${row.actorMembershipId}:${row.actionKind}`;
      const bucket = actionGroups.get(key) ?? { count: 0, amountMinor: 0 };
      bucket.count += 1; bucket.amountMinor += Math.abs(row.amountMinor ?? 0); actionGroups.set(key, bucket);
    }
    const cashByCloser = new Map<string, number>();
    for (const row of cash) if (row.closedById) cashByCloser.set(row.closedById, (cashByCloser.get(row.closedById) ?? 0) + decimalToMinor(row.variance));
    return {
      laborHours: round(financeBase.workedSeconds / 3600),
      laborToSalesPct: round(finance?.laborPct ?? null),
      laborCostMinor: finance?.laborCostMinor ?? 0,
      salesByOperator: [...salesByUser.entries()].map(([userId, salesMinor]) => ({ userId, salesMinor })).sort((a, b) => b.salesMinor - a.salesMinor),
      riskActionsByOperator: [...actionGroups.entries()].map(([key, values]) => { const [membershipId, actionKind] = key.split(':'); return { membershipId, actionKind, ...values }; }),
      cashVarianceByCloser: [...cashByCloser.entries()].map(([userId, varianceMinor]) => ({ userId, varianceMinor })),
      shiftProductivity: memberships.flatMap((membership) => {
        const workedSeconds = workedByMembership.get(membership.id) ?? 0;
        if (workedSeconds <= 0) return [];
        const salesMinor = salesByUser.get(membership.userId) ?? 0;
        return [{ membershipId: membership.id, userId: membership.userId, workedHours: round(workedSeconds / 3600), salesMinor, salesPerWorkedHourMinor: round(salesMinor / (workedSeconds / 3600)) }];
      }),
    };
  }

  private async reconciliationCenter(shopId: string, context: any, financeBase: any, inventory: any) {
    const { from, to, currency, slug } = context;
    const [persisted, settledChecks, offlineEvents] = await Promise.all([
      this.prisma.financialReconciliationIssue.findMany({
        where: { shopId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        orderBy: [{ severity: 'desc' }, { firstSeenAt: 'asc' }],
        take: 250,
      }),
      this.prisma.guestCheck.findMany({
        where: { shopId, status: 'SETTLED', settledAt: { gte: from, lt: to } },
        select: { id: true, currentSettlementId: true, currentSettlement: { select: { id: true, state: true, total: true, amountDue: true } } },
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
            { aggregateType: { contains: 'edge', mode: 'insensitive' } },
          ],
        },
        select: { id: true, eventType: true, aggregateType: true, aggregateId: true, status: true, lastError: true, createdAt: true, updatedAt: true },
      }),
    ]);
    const now = new Date();
    const issues: any[] = persisted.map((issue) => ({
      id: issue.id,
      type: issue.type,
      severity: issue.severity,
      amountMinor: issue.amount == null ? null : decimalToMinor(issue.amount),
      currency: issue.currency,
      affectedEntities: issue.entityType ? [{ type: issue.entityType, id: issue.entityId }] : [],
      firstSeenAt: issue.firstSeenAt,
      lastCheckedAt: issue.lastSeenAt,
      message: issue.message,
      suggestedNextAction: nextAction(issue.type),
      evidenceLinks: issue.entityType && issue.entityId ? [`/dashboard/${slug}/analytics?evidence=${encodeURIComponent(`${issue.entityType}:${issue.entityId}`)}`] : [],
      source: 'FinancialReconciliationIssue',
    }));
    for (const check of settledChecks.filter((row) => !row.currentSettlement || !['PAID', 'CLOSED'].includes(row.currentSettlement.state))) {
      issues.push({
        id: `check:${check.id}`,
        type: 'GUEST_CHECK_SETTLEMENT_MISMATCH',
        severity: 'HIGH',
        amountMinor: check.currentSettlement ? decimalToMinor(check.currentSettlement.amountDue) : null,
        currency,
        affectedEntities: [{ type: 'GUEST_CHECK', id: check.id }, ...(check.currentSettlementId ? [{ type: 'SETTLEMENT', id: check.currentSettlementId }] : [])],
        firstSeenAt: now,
        lastCheckedAt: now,
        message: 'Settled GuestCheck does not point to a PAID/CLOSED immutable current settlement.',
        suggestedNextAction: nextAction('GUEST_CHECK_SETTLEMENT_MISMATCH'),
        evidenceLinks: [`/dashboard/${slug}/analytics?evidence=GUEST_CHECK:${encodeURIComponent(check.id)}`],
        source: 'Phase14 live invariant',
      });
    }
    for (const row of financeBase.currencies.filter((item: any) => item.reconciliationVarianceMinor !== 0)) {
      issues.push({ id: `provider:${row.currency}`, type: 'PAYMENT_PROVIDER_MISMATCH', severity: 'HIGH', amountMinor: Math.abs(row.reconciliationVarianceMinor), currency: row.currency, affectedEntities: [], firstSeenAt: now, lastCheckedAt: now, message: 'Canonical ledger net does not equal successful provider payment/refund net for the report window.', suggestedNextAction: nextAction('PAYMENT_PROVIDER_MISMATCH'), evidenceLinks: [`/dashboard/${slug}/analytics?view=finance`], source: 'GrowthAnalyticsService finance reconciliation' });
    }
    for (const [liabilityCurrency, liability] of Object.entries((await this.baseAnalytics.guests({ shopId } as JwtAccessPayload, from, to)).storedValue.liabilityByCurrency)) {
      if (Number(liability) < 0) issues.push({ id: `stored:${liabilityCurrency}`, type: 'STORED_VALUE_LIABILITY_MISMATCH', severity: 'CRITICAL', amountMinor: Math.abs(Number(liability)), currency: liabilityCurrency, affectedEntities: [], firstSeenAt: now, lastCheckedAt: now, message: 'Stored-value ledger liability is negative, which requires ledger investigation.', suggestedNextAction: nextAction('STORED_VALUE_LIABILITY_MISMATCH'), evidenceLinks: [`/dashboard/${slug}/analytics?view=guests`], source: 'StoredValueLedgerEntry' });
    }
    for (const row of inventory.lowStockRisk.filter((item: any) => item.quantityMilli < 0)) {
      issues.push({ id: `inventory:${row.stockItemId}`, type: 'INVENTORY_ANOMALY', severity: 'MEDIUM', amountMinor: null, currency, affectedEntities: [{ type: 'STOCK_ITEM', id: row.stockItemId }], firstSeenAt: now, lastCheckedAt: now, message: `${row.name} has negative stock (${row.quantityMilli}/1000 units).`, suggestedNextAction: nextAction('INVENTORY_ANOMALY'), evidenceLinks: [`/dashboard/${slug}/analytics?evidence=STOCK_ITEM:${encodeURIComponent(row.stockItemId)}`], source: 'StockMovement ledger' });
    }
    for (const row of offlineEvents) {
      issues.push({ id: `offline:${row.id}`, type: 'OFFLINE_SYNC_UNRESOLVED', severity: row.status === 'DEAD' ? 'HIGH' : 'MEDIUM', amountMinor: null, currency, affectedEntities: [{ type: row.aggregateType, id: row.aggregateId }], firstSeenAt: row.createdAt, lastCheckedAt: row.updatedAt, message: `${row.eventType} is ${row.status}${row.lastError ? `: ${row.lastError}` : ''}`, suggestedNextAction: nextAction('OFFLINE_SYNC_UNRESOLVED'), evidenceLinks: [`/dashboard/${slug}/analytics?evidence=DOMAIN_EVENT:${encodeURIComponent(row.id)}`], source: 'DomainEventOutbox' });
    }
    const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    issues.sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0) || new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime());
    return { checkedAt: now, issueCount: issues.length, clear: issues.length === 0, issues };
  }

  private attentionCenter(reconciliation: any, inventory: any, reservations: any, operationsBase: any) {
    const items = reconciliation.issues.map((issue: any) => ({
      id: `reconciliation:${issue.id}`,
      domain: 'RECONCILIATION',
      severity: issue.severity,
      title: issue.type,
      detail: issue.message,
      suggestedNextAction: issue.suggestedNextAction,
      evidenceLinks: issue.evidenceLinks,
    }));
    for (const row of inventory.lowStockRisk.slice(0, 25)) {
      items.push({ id: `stock:${row.stockItemId}`, domain: 'INVENTORY', severity: row.quantityMilli < 0 ? 'HIGH' : 'MEDIUM', title: 'LOW_STOCK', detail: `${row.name}: ${row.quantityMilli}/1000 on hand; reorder level ${row.reorderLevelMilli}/1000.`, suggestedNextAction: 'Review stock movements and create/receive purchasing work if replenishment is required.', evidenceLinks: [] });
    }
    if ((reservations.noShowRatePct ?? 0) > 20) items.push({ id: 'reservation:no-show-rate', domain: 'RESERVATION', severity: 'MEDIUM', title: 'HIGH_NO_SHOW_RATE', detail: `No-show rate is ${reservations.noShowRatePct}% in the selected window.`, suggestedNextAction: 'Review no-show cohorts, reminder coverage and deposit policy before changing booking rules.', evidenceLinks: [] });
    if ((operationsBase.kds.slaPct ?? 100) < 80) items.push({ id: 'restaurant:kds-sla', domain: 'RESTAURANT', severity: 'MEDIUM', title: 'KDS_SLA_BELOW_TARGET', detail: `KDS SLA attainment is ${round(operationsBase.kds.slaPct)}%.`, suggestedNextAction: 'Inspect station-level late tickets and measured prep bottlenecks.', evidenceLinks: [] });
    return { generatedAt: new Date(), itemCount: items.length, items };
  }
}
