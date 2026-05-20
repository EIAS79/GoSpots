import type { PrismaService } from "../../prisma/prisma.service";

export type DayKey = string;

export function dayKeysForRange(days: number, now = new Date()): DayKey[] {
  const keys: DayKey[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

export function emptyDayMap(keys: DayKey[]): Record<DayKey, number> {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

/** Merge transaction SALES + completed shop orders into top items. */
export async function aggregateTopItems(
  prisma: PrismaService,
  shopId: string,
  since: Date,
  limit: number,
) {
  const [txRows, orderLines] = await Promise.all([
    prisma.transactionLineItem.groupBy({
      by: ["menuItemId", "name"],
      where: {
        transaction: { shopId, kind: "SALE", createdAt: { gte: since } },
      },
      _sum: { quantity: true, total: true },
    }),
    prisma.shopOrderLine.findMany({
      where: {
        lineStatus: "ACTIVE",
        shopOrder: {
          shopId,
          status: "COMPLETED",
          archivedAt: null,
          completedAt: { gte: since },
        },
      },
      select: {
        menuItemId: true,
        name: true,
        quantity: true,
        unitPrice: true,
      },
    }),
  ]);

  type Agg = {
    menuItemId: string | null;
    name: string;
    quantity: number;
    revenue: number;
  };
  const key = (menuItemId: string | null, name: string) =>
    `${menuItemId ?? "__"}|${name}`;
  const map = new Map<string, Agg>();

  for (const r of txRows) {
    const k = key(r.menuItemId, r.name);
    map.set(k, {
      menuItemId: r.menuItemId,
      name: r.name,
      quantity: r._sum.quantity ?? 0,
      revenue: r._sum.total ?? 0,
    });
  }
  for (const l of orderLines) {
    const k = key(l.menuItemId, l.name);
    const addQ = l.quantity;
    const addR = l.quantity * l.unitPrice;
    const cur = map.get(k);
    if (cur) {
      cur.quantity += addQ;
      cur.revenue += addR;
    } else {
      map.set(k, {
        menuItemId: l.menuItemId,
        name: l.name,
        quantity: addQ,
        revenue: addR,
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export async function buildFinanceAnalytics(
  prisma: PrismaService,
  shopId: string,
  days: number,
) {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86400000);
  const keys = dayKeysForRange(days, now);

  const [
    txSales,
    txByDay,
    losses,
    lossesByDayRows,
    completedOrders,
    allOrdersInRange,
    topItems,
    billedReservations,
    completedPlaySessions,
    marketingEvents,
    completedReservationsInRange,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: { shopId, kind: "SALE", createdAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.findMany({
      where: { shopId, kind: "SALE", createdAt: { gte: since } },
      select: { amount: true, createdAt: true },
    }),
    prisma.shopLoss.aggregate({
      where: { shopId, occurredAt: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.shopLoss.findMany({
      where: { shopId, occurredAt: { gte: since } },
      select: { amount: true, occurredAt: true },
    }),
    prisma.shopOrder.findMany({
      where: {
        shopId,
        status: "COMPLETED",
        archivedAt: null,
        completedAt: { gte: since },
      },
      select: {
        total: true,
        guestCount: true,
        completedAt: true,
      },
    }),
    prisma.shopOrder.findMany({
      where: { shopId, createdAt: { gte: since }, archivedAt: null },
      select: { status: true, createdAt: true, guestCount: true },
    }),
    aggregateTopItems(prisma, shopId, since, 10),
    prisma.reservation.findMany({
      where: {
        shopId,
        billedAt: { gte: since },
        billedAmount: { not: null },
        resourceId: { not: null },
      },
      select: {
        billedAmount: true,
        partySize: true,
        billedAt: true,
        resourceId: true,
      },
    }),
    prisma.playSession.findMany({
      where: {
        shopId,
        status: "COMPLETED",
        archivedAt: null,
        completedAt: { gte: since },
        reservationId: null,
      },
      select: { amount: true, playerCount: true, completedAt: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: { type: true, createdAt: true },
    }),
    prisma.reservation.findMany({
      where: {
        shopId,
        status: { in: ["COMPLETED", "CHECKED_IN"] },
        startsAt: { gte: since },
      },
      select: { partySize: true, startsAt: true },
    }),
  ]);

  const orderRevenue = completedOrders.reduce((s, o) => s + o.total, 0);
  const txRevenue = txSales._sum?.amount ?? 0;
  const gameBillingPaid = billedReservations.filter((r) => r.resourceId);
  const otherReservationRevenue = billedReservations
    .filter((r) => !r.resourceId)
    .reduce((s, r) => s + (r.billedAmount ?? 0), 0);
  const playRevenue =
    gameBillingPaid.reduce((s, r) => s + (r.billedAmount ?? 0), 0) +
    completedPlaySessions.reduce((s, p) => s + p.amount, 0);
  const reservationRevenue = otherReservationRevenue;
  const totalRevenue =
    txRevenue + orderRevenue + reservationRevenue + playRevenue;
  const totalLosses = losses._sum?.amount ?? 0;

  const revenueByDay = keys.map((day) => ({
    day,
    menuOrders: 0,
    reservations: 0,
    playSessions: 0,
    quickSales: 0,
    total: 0,
  }));
  const revMap = Object.fromEntries(
    revenueByDay.map((r) => [r.day, r]),
  ) as Record<string, (typeof revenueByDay)[0]>;

  for (const t of txByDay) {
    const day = t.createdAt.toISOString().slice(0, 10);
    if (!revMap[day]) continue;
    revMap[day].quickSales += t.amount;
    revMap[day].total += t.amount;
  }
  for (const o of completedOrders) {
    if (!o.completedAt) continue;
    const day = o.completedAt.toISOString().slice(0, 10);
    if (!revMap[day]) continue;
    revMap[day].menuOrders += o.total;
    revMap[day].total += o.total;
  }
  for (const r of billedReservations) {
    if (!r.billedAt) continue;
    const day = r.billedAt.toISOString().slice(0, 10);
    if (!revMap[day]) continue;
    const amt = r.billedAmount ?? 0;
    if (r.resourceId) {
      revMap[day].playSessions += amt;
    } else {
      revMap[day].reservations += amt;
    }
    revMap[day].total += amt;
  }
  for (const p of completedPlaySessions) {
    if (!p.completedAt) continue;
    const day = p.completedAt.toISOString().slice(0, 10);
    if (!revMap[day]) continue;
    revMap[day].playSessions += p.amount;
    revMap[day].total += p.amount;
  }

  const lossesByDay = emptyDayMap(keys);
  for (const l of lossesByDayRows) {
    const day = l.occurredAt.toISOString().slice(0, 10);
    if (day in lossesByDay) lossesByDay[day] += l.amount;
  }

  const ordersByDay = keys.map((day) => ({
    day,
    count: 0,
    customers: 0,
    completed: 0,
  }));
  const ordMap = Object.fromEntries(
    ordersByDay.map((r) => [r.day, r]),
  ) as Record<string, (typeof ordersByDay)[0]>;

  for (const o of allOrdersInRange) {
    const day = o.createdAt.toISOString().slice(0, 10);
    if (!ordMap[day]) continue;
    ordMap[day].count += 1;
    if (o.status === "COMPLETED") {
      ordMap[day].completed += 1;
      ordMap[day].customers += o.guestCount;
    }
  }

  const menuCovers = completedOrders.reduce((s, o) => s + o.guestCount, 0);
  const reservationGuests = completedReservationsInRange.reduce(
    (s, r) => s + r.partySize,
    0,
  );
  const playPlayers = completedPlaySessions.reduce(
    (s, p) => s + p.playerCount,
    0,
  );

  let marketingViews = 0;
  let menuViews = 0;
  let reservationClicks = 0;
  const viewsByDay = emptyDayMap(keys);
  for (const e of marketingEvents) {
    const day = e.createdAt.toISOString().slice(0, 10);
    if (e.type === "VENUE_VIEW" || e.type === "GALLERY_VIEW") {
      marketingViews += 1;
      if (day in viewsByDay) viewsByDay[day] += 1;
    }
    if (e.type === "MENU_VIEW") menuViews += 1;
    if (e.type === "RESERVATION_CLICK") reservationClicks += 1;
  }

  const audienceByDay = keys.map((day) => ({
    day,
    menuCovers: 0,
    reservationGuests: 0,
    playPlayers: 0,
    marketingViews: viewsByDay[day] ?? 0,
  }));
  const audMap = Object.fromEntries(
    audienceByDay.map((r) => [r.day, r]),
  ) as Record<string, (typeof audienceByDay)[0]>;

  for (const o of allOrdersInRange) {
    if (o.status !== "COMPLETED") continue;
    const day = o.createdAt.toISOString().slice(0, 10);
    if (audMap[day]) audMap[day].menuCovers += o.guestCount;
  }
  for (const r of completedReservationsInRange) {
    const day = r.startsAt.toISOString().slice(0, 10);
    if (audMap[day]) audMap[day].reservationGuests += r.partySize;
  }
  for (const p of completedPlaySessions) {
    if (!p.completedAt) continue;
    const day = p.completedAt.toISOString().slice(0, 10);
    if (audMap[day]) audMap[day].playPlayers += p.playerCount;
  }

  return {
    days,
    summary: {
      revenue: totalRevenue,
      revenueMenuOrders: orderRevenue,
      revenueQuickSales: txRevenue,
      revenueReservations: reservationRevenue,
      revenuePlaySessions: playRevenue,
      /** @deprecated use revenueMenuOrders */
      revenueOrders: orderRevenue,
      /** @deprecated use revenueQuickSales */
      revenueTransactions: txRevenue,
      losses: totalLosses,
      profit: totalRevenue - totalLosses,
      orderCount: allOrdersInRange.length,
      completedOrderCount: completedOrders.length,
      /** Menu order covers */
      customerCount: menuCovers,
      menuCovers,
      reservationGuests,
      playPlayers,
      marketingViews,
      menuViews,
      reservationClicks,
      transactionCount: txSales._count,
      playSessionCount: completedPlaySessions.length,
    },
    revenueByDay,
    lossesByDay: keys.map((day) => ({ day, amount: lossesByDay[day] })),
    ordersByDay,
    audienceByDay,
    topItems,
  };
}
