import type { PrismaService } from '../../prisma/prisma.service';
import { effectiveMoneyCurrency } from '../../common/currency-stamp.util';
import { venueDayKey } from '../../common/menu-stock.util';
import {
  serializeMoney,
  toMoneyNumber,
  type MoneyInput,
  type MoneyWire,
} from '../../common/money.util';
import { loadShopVenueTimeContext } from '../../common/shop-venue-time.util';

export type DayKey = string;

export type PaymentMethodBreakdownRow = {
  method: string;
  amount: MoneyWire;
  count: number;
};

export type DailyCloseSummary = {
  day: string;
  menuOrders: MoneyWire;
  playSessions: MoneyWire;
  reservations: MoneyWire;
  quickSales: MoneyWire;
  total: MoneyWire;
};

/** Four mutually exclusive revenue channels — see docs/audit/GO_SPOTS_FINANCE_CONTRACT.md */
export type RevenueChannels = {
  menuOrders: number;
  quickSales: number;
  playSessions: number;
  reservations: number;
  total: number;
};

export type RevenueOrderRow = {
  total: MoneyInput;
  completedAt: Date | null;
  guestCount?: number;
  paymentMethod?: string | null;
};

export type RevenueTxRow = {
  amount: MoneyInput;
  createdAt: Date;
  method?: string | null;
};

export type RevenueReservationRow = {
  billedAmount: MoneyInput;
  billedAt: Date | null;
  resourceId: string | null;
  partySize?: number;
  billingPaymentMethod?: string | null;
};

export type RevenuePlayRow = {
  amount: MoneyInput;
  completedAt: Date | null;
  updatedAt?: Date;
  status?: string;
  playerCount?: number;
  paymentMethod?: string | null;
  /** Must be null for walk-in revenue; linked sessions are excluded by query. */
  reservationId?: string | null;
};

/**
 * Paid walk-in recognition (matches play-billing UI):
 * COMPLETED, or completedAt stamped by markPlaySessionPaid while still ACTIVE.
 */
export function isPaidWalkInPlaySession(row: {
  status?: string;
  completedAt?: Date | null;
}): boolean {
  if (row.status === 'CANCELED') return false;
  return row.status === 'COMPLETED' || row.completedAt != null;
}

/** Pure channel sum — never includes PlaySession rows with reservationId set. */
export function sumRevenueChannels(input: {
  orders: Array<{ total: MoneyInput }>;
  transactions: Array<{ amount: MoneyInput }>;
  billedReservations: Array<{
    billedAmount: MoneyInput;
    resourceId: string | null;
  }>;
  /** Caller must pass only walk-ins (reservationId == null). */
  walkInPlaySessions: Array<{
    amount: MoneyInput;
    reservationId?: string | null;
    status?: string;
    completedAt?: Date | null;
  }>;
}): RevenueChannels {
  const menuOrders = input.orders.reduce(
    (s, o) => s + toMoneyNumber(o.total),
    0,
  );
  const quickSales = input.transactions.reduce(
    (s, t) => s + toMoneyNumber(t.amount),
    0,
  );

  let playFromReservations = 0;
  let reservations = 0;
  for (const r of input.billedReservations) {
    const amt = toMoneyNumber(r.billedAmount);
    if (r.resourceId) playFromReservations += amt;
    else reservations += amt;
  }

  const walkInPlay = input.walkInPlaySessions.reduce((s, p) => {
    // Hard guard: linked sessions must never enter this sum.
    if (p.reservationId != null) return s;
    if (!isPaidWalkInPlaySession(p)) return s;
    return s + toMoneyNumber(p.amount);
  }, 0);

  const playSessions = playFromReservations + walkInPlay;
  return {
    menuOrders,
    quickSales,
    playSessions,
    reservations,
    total: menuOrders + quickSales + playSessions + reservations,
  };
}

/** @param timezoneOrLocale IANA zone preferred; BCP-47 locale still accepted. */
export function dayKeysForRange(
  days: number,
  timezoneOrLocale = 'UTC',
  now = new Date(),
): DayKey[] {
  const keys: DayKey[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(venueDayKey(timezoneOrLocale, d));
  }
  return keys;
}

export function emptyDayMap(keys: DayKey[]): Record<DayKey, number> {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

function dayBucket(timezoneOrLocale: string, at: Date): DayKey {
  return venueDayKey(timezoneOrLocale, at);
}

function addPaymentBreakdown(
  map: Map<string, { method: string; amount: number; count: number }>,
  method: string | null | undefined,
  amount: number,
) {
  if (amount <= 0) return;
  const key = method?.trim() || 'UNKNOWN';
  const cur = map.get(key);
  if (cur) {
    cur.amount += amount;
    cur.count += 1;
  } else {
    map.set(key, { method: key, amount, count: 1 });
  }
}

/** Prisma where: walk-in play counted as paid in the revenue window. */
export function paidWalkInPlayWhere(shopId: string, since: Date) {
  return {
    shopId,
    reservationId: null as null,
    archivedAt: null as null,
    status: { not: 'CANCELED' as const },
    OR: [
      { completedAt: { gte: since } },
      {
        status: 'COMPLETED' as const,
        completedAt: null,
        updatedAt: { gte: since },
      },
    ],
  };
}

async function loadRevenueSourceRows(
  prisma: PrismaService,
  shopId: string,
  since: Date,
) {
  const [shop, transactions, completedOrders, billedReservations, walkInPlaySessions] =
    await Promise.all([
      prisma.shop.findUnique({
        where: { id: shopId },
        select: { currency: true },
      }),
      prisma.transaction.findMany({
        where: { shopId, kind: 'SALE', createdAt: { gte: since } },
        select: { amount: true, createdAt: true, method: true, currency: true },
      }),
      prisma.shopOrder.findMany({
        where: {
          shopId,
          status: 'COMPLETED',
          archivedAt: null,
          completedAt: { gte: since },
        },
        select: {
          total: true,
          guestCount: true,
          completedAt: true,
          paymentMethod: true,
          currency: true,
        },
      }),
      prisma.reservation.findMany({
        where: {
          shopId,
          billedAt: { gte: since },
          billedAmount: { not: null },
        },
        select: {
          billedAmount: true,
          billedAt: true,
          resourceId: true,
          partySize: true,
          billingPaymentMethod: true,
          currency: true,
        },
      }),
      prisma.playSession.findMany({
        where: paidWalkInPlayWhere(shopId, since),
        select: {
          amount: true,
          completedAt: true,
          updatedAt: true,
          status: true,
          playerCount: true,
          paymentMethod: true,
          reservationId: true,
          currency: true,
        },
      }),
    ]);

  const shopCurrency = (shop?.currency ?? 'EUR').toUpperCase();
  return {
    shopCurrency,
    transactions,
    completedOrders,
    billedReservations,
    walkInPlaySessions,
  };
}

/** Bucket revenue channels by effective row currency (stamp ?? shop). */
export function sumRevenueChannelsByCurrency(input: {
  shopCurrency: string;
  orders: Array<{ total: MoneyInput; currency?: string | null }>;
  transactions: Array<{ amount: MoneyInput; currency?: string | null }>;
  billedReservations: Array<{
    billedAmount: MoneyInput;
    resourceId: string | null;
    currency?: string | null;
  }>;
  walkInPlaySessions: Array<{
    amount: MoneyInput;
    reservationId?: string | null;
    status?: string;
    completedAt?: Date | null;
    currency?: string | null;
  }>;
}): {
  shopCurrency: string;
  byCurrency: Record<string, RevenueChannels>;
  /** Channels in current shop currency only (never mixes FX eras). */
  shopChannels: RevenueChannels;
  mixedCurrencies: boolean;
} {
  const codes = new Set<string>();
  for (const o of input.orders) {
    codes.add(effectiveMoneyCurrency(o.currency, input.shopCurrency));
  }
  for (const t of input.transactions) {
    codes.add(effectiveMoneyCurrency(t.currency, input.shopCurrency));
  }
  for (const r of input.billedReservations) {
    codes.add(effectiveMoneyCurrency(r.currency, input.shopCurrency));
  }
  for (const p of input.walkInPlaySessions) {
    if (p.reservationId != null) continue;
    if (!isPaidWalkInPlaySession(p)) continue;
    codes.add(effectiveMoneyCurrency(p.currency, input.shopCurrency));
  }
  if (codes.size === 0) codes.add(input.shopCurrency);

  const byCurrency: Record<string, RevenueChannels> = {};
  for (const code of codes) {
    byCurrency[code] = sumRevenueChannels({
      orders: input.orders.filter(
        (o) => effectiveMoneyCurrency(o.currency, input.shopCurrency) === code,
      ),
      transactions: input.transactions.filter(
        (t) => effectiveMoneyCurrency(t.currency, input.shopCurrency) === code,
      ),
      billedReservations: input.billedReservations.filter(
        (r) => effectiveMoneyCurrency(r.currency, input.shopCurrency) === code,
      ),
      walkInPlaySessions: input.walkInPlaySessions.filter(
        (p) => effectiveMoneyCurrency(p.currency, input.shopCurrency) === code,
      ),
    });
  }

  const shopChannels =
    byCurrency[input.shopCurrency] ??
    sumRevenueChannels({
      orders: [],
      transactions: [],
      billedReservations: [],
      walkInPlaySessions: [],
    });

  return {
    shopCurrency: input.shopCurrency,
    byCurrency,
    shopChannels,
    mixedCurrencies: Object.keys(byCurrency).length > 1,
  };
}

export async function computeRevenueSince(
  prisma: PrismaService,
  shopId: string,
  since: Date,
) {
  const rows = await loadRevenueSourceRows(prisma, shopId, since);
  return sumRevenueChannelsByCurrency({
    shopCurrency: rows.shopCurrency,
    orders: rows.completedOrders,
    transactions: rows.transactions,
    billedReservations: rows.billedReservations,
    walkInPlaySessions: rows.walkInPlaySessions,
  }).shopChannels.total;
}

/** Merge transaction SALES + completed shop orders into top items (menu channels only). */
export async function aggregateTopItems(
  prisma: PrismaService,
  shopId: string,
  since: Date,
  limit: number,
) {
  const [txRows, orderLines] = await Promise.all([
    prisma.transactionLineItem.groupBy({
      by: ['menuItemId', 'name'],
      where: {
        transaction: { shopId, kind: 'SALE', createdAt: { gte: since } },
      },
      _sum: { quantity: true, total: true },
    }),
    prisma.shopOrderLine.findMany({
      where: {
        lineStatus: 'ACTIVE',
        shopOrder: {
          shopId,
          status: 'COMPLETED',
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
    `${menuItemId ?? '__'}|${name}`;
  const map = new Map<string, Agg>();

  for (const r of txRows) {
    const k = key(r.menuItemId, r.name);
    map.set(k, {
      menuItemId: r.menuItemId,
      name: r.name,
      quantity: r._sum.quantity ?? 0,
      revenue: toMoneyNumber(r._sum.total),
    });
  }
  for (const l of orderLines) {
    const k = key(l.menuItemId, l.name);
    const addQ = l.quantity;
    const addR = l.quantity * toMoneyNumber(l.unitPrice);
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
  // Day buckets use Shop.timezone (IANA); keep local name `locale` stable for aggregate loops.
  const { resolvedTimeZone: locale } = await loadShopVenueTimeContext(
    prisma,
    shopId,
  );
  const keys = dayKeysForRange(days, locale, now);

  const [
    revenueRows,
    lossesByDayRows,
    allOrdersInRange,
    topItems,
    marketingEvents,
    completedReservationsInRange,
    txForPaymentBreakdown,
    txSalesCount,
  ] = await Promise.all([
    loadRevenueSourceRows(prisma, shopId, since),
    prisma.shopLoss.findMany({
      where: { shopId, occurredAt: { gte: since } },
      select: { amount: true, occurredAt: true, currency: true },
    }),
    prisma.shopOrder.findMany({
      where: { shopId, createdAt: { gte: since }, archivedAt: null },
      select: { status: true, createdAt: true, guestCount: true },
    }),
    aggregateTopItems(prisma, shopId, since, 10),
    prisma.analyticsEvent.findMany({
      where: { shopId, createdAt: { gte: since } },
      select: { type: true, createdAt: true },
    }),
    prisma.reservation.findMany({
      where: {
        shopId,
        status: { in: ['COMPLETED', 'CHECKED_IN'] },
        startsAt: { gte: since },
      },
      select: { partySize: true, startsAt: true },
    }),
    prisma.transaction.findMany({
      where: {
        shopId,
        kind: { in: ['SALE', 'REFUND'] },
        createdAt: { gte: since },
      },
      select: { amount: true, method: true, kind: true, currency: true },
    }),
    prisma.transaction.count({
      where: { shopId, kind: 'SALE', createdAt: { gte: since } },
    }),
  ]);

  const {
    shopCurrency,
    transactions: txByDay,
    completedOrders,
    billedReservations,
    walkInPlaySessions: completedPlaySessions,
  } = revenueRows;

  const currencyBuckets = sumRevenueChannelsByCurrency({
    shopCurrency,
    orders: completedOrders,
    transactions: txByDay,
    billedReservations,
    walkInPlaySessions: completedPlaySessions,
  });
  const channels = currencyBuckets.shopChannels;
  const orderRevenue = channels.menuOrders;
  const txRevenue = channels.quickSales;
  const playRevenue = channels.playSessions;
  const reservationRevenue = channels.reservations;
  const totalRevenue = channels.total;
  const totalLosses = lossesByDayRows.reduce((s, l) => {
    if (effectiveMoneyCurrency(l.currency, shopCurrency) !== shopCurrency) {
      return s;
    }
    return s + toMoneyNumber(l.amount);
  }, 0);

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
    if (effectiveMoneyCurrency(t.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    const day = dayBucket(locale, t.createdAt);
    if (!revMap[day]) continue;
    const amt = toMoneyNumber(t.amount);
    revMap[day].quickSales += amt;
    revMap[day].total += amt;
  }
  for (const o of completedOrders) {
    if (!o.completedAt) continue;
    if (effectiveMoneyCurrency(o.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    const day = dayBucket(locale, o.completedAt);
    if (!revMap[day]) continue;
    const amt = toMoneyNumber(o.total);
    revMap[day].menuOrders += amt;
    revMap[day].total += amt;
  }
  for (const r of billedReservations) {
    if (!r.billedAt) continue;
    if (effectiveMoneyCurrency(r.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    const day = dayBucket(locale, r.billedAt);
    if (!revMap[day]) continue;
    const amt = toMoneyNumber(r.billedAmount);
    if (r.resourceId) {
      revMap[day].playSessions += amt;
    } else {
      revMap[day].reservations += amt;
    }
    revMap[day].total += amt;
  }
  for (const p of completedPlaySessions) {
    if (p.reservationId != null) continue;
    if (!isPaidWalkInPlaySession(p)) continue;
    if (effectiveMoneyCurrency(p.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    const at = p.completedAt ?? p.updatedAt;
    if (!at) continue;
    const day = dayBucket(locale, at);
    if (!revMap[day]) continue;
    const amt = toMoneyNumber(p.amount);
    revMap[day].playSessions += amt;
    revMap[day].total += amt;
  }

  const lossesByDay = emptyDayMap(keys);
  for (const l of lossesByDayRows) {
    if (effectiveMoneyCurrency(l.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    const day = dayBucket(locale, l.occurredAt);
    if (day in lossesByDay) lossesByDay[day] += toMoneyNumber(l.amount);
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
    const day = dayBucket(locale, o.createdAt);
    if (!ordMap[day]) continue;
    ordMap[day].count += 1;
    if (o.status === 'COMPLETED') {
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
    (s, p) => s + (p.playerCount ?? 0),
    0,
  );

  let marketingViews = 0;
  let menuViews = 0;
  let reservationClicks = 0;
  const viewsByDay = emptyDayMap(keys);
  for (const e of marketingEvents) {
    const day = dayBucket(locale, e.createdAt);
    if (e.type === 'VENUE_VIEW' || e.type === 'GALLERY_VIEW') {
      marketingViews += 1;
      if (day in viewsByDay) viewsByDay[day] += 1;
    }
    if (e.type === 'MENU_VIEW') menuViews += 1;
    if (e.type === 'RESERVATION_CLICK') reservationClicks += 1;
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

  for (const o of completedOrders) {
    if (!o.completedAt) continue;
    const day = dayBucket(locale, o.completedAt);
    if (audMap[day]) audMap[day].menuCovers += o.guestCount;
  }
  for (const r of completedReservationsInRange) {
    const day = dayBucket(locale, r.startsAt);
    if (audMap[day]) audMap[day].reservationGuests += r.partySize;
  }
  for (const p of completedPlaySessions) {
    const at = p.completedAt ?? p.updatedAt;
    if (!at) continue;
    const day = dayBucket(locale, at);
    if (audMap[day]) audMap[day].playPlayers += p.playerCount ?? 0;
  }

  const paymentMap = new Map<
    string,
    { method: string; amount: number; count: number }
  >();
  for (const t of txForPaymentBreakdown) {
    if (effectiveMoneyCurrency(t.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    const signed =
      t.kind === 'REFUND' ? -toMoneyNumber(t.amount) : toMoneyNumber(t.amount);
    addPaymentBreakdown(paymentMap, t.method, signed);
  }
  for (const o of completedOrders) {
    if (effectiveMoneyCurrency(o.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    addPaymentBreakdown(paymentMap, o.paymentMethod, toMoneyNumber(o.total));
  }
  for (const r of billedReservations) {
    if (effectiveMoneyCurrency(r.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    addPaymentBreakdown(
      paymentMap,
      r.billingPaymentMethod,
      toMoneyNumber(r.billedAmount),
    );
  }
  for (const p of completedPlaySessions) {
    if (p.reservationId != null) continue;
    if (!isPaidWalkInPlaySession(p)) continue;
    if (effectiveMoneyCurrency(p.currency, shopCurrency) !== shopCurrency) {
      continue;
    }
    addPaymentBreakdown(
      paymentMap,
      p.paymentMethod,
      toMoneyNumber(p.amount),
    );
  }
  const paymentMethodBreakdown: PaymentMethodBreakdownRow[] = [
    ...paymentMap.values(),
  ]
    .filter((row) => row.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
    .map((row) => ({
      method: row.method,
      amount: serializeMoney(row.amount),
      count: row.count,
    }));

  const closeDay = keys[keys.length - 1] ?? venueDayKey(locale, now);
  const closeRow = revMap[closeDay];
  const dailyClose: DailyCloseSummary = {
    day: closeDay,
    menuOrders: serializeMoney(closeRow?.menuOrders ?? 0),
    playSessions: serializeMoney(closeRow?.playSessions ?? 0),
    reservations: serializeMoney(closeRow?.reservations ?? 0),
    quickSales: serializeMoney(closeRow?.quickSales ?? 0),
    total: serializeMoney(closeRow?.total ?? 0),
  };

  return {
    days,
    summary: {
      currency: shopCurrency,
      mixedCurrencies: currencyBuckets.mixedCurrencies,
      revenueByCurrency: Object.fromEntries(
        Object.entries(currencyBuckets.byCurrency).map(([code, ch]) => [
          code,
          {
            revenue: serializeMoney(ch.total),
            revenueMenuOrders: serializeMoney(ch.menuOrders),
            revenueQuickSales: serializeMoney(ch.quickSales),
            revenuePlaySessions: serializeMoney(ch.playSessions),
            revenueReservations: serializeMoney(ch.reservations),
          },
        ]),
      ),
      revenue: serializeMoney(totalRevenue),
      revenueMenuOrders: serializeMoney(orderRevenue),
      revenueQuickSales: serializeMoney(txRevenue),
      revenueReservations: serializeMoney(reservationRevenue),
      revenuePlaySessions: serializeMoney(playRevenue),
      /** @deprecated use revenueMenuOrders */
      revenueOrders: serializeMoney(orderRevenue),
      /** @deprecated use revenueQuickSales */
      revenueTransactions: serializeMoney(txRevenue),
      losses: serializeMoney(totalLosses),
      profit: serializeMoney(totalRevenue - totalLosses),
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
      transactionCount: txSalesCount,
      playSessionCount: completedPlaySessions.length,
    },
    revenueByDay: revenueByDay.map((r) => ({
      day: r.day,
      menuOrders: serializeMoney(r.menuOrders),
      reservations: serializeMoney(r.reservations),
      playSessions: serializeMoney(r.playSessions),
      quickSales: serializeMoney(r.quickSales),
      total: serializeMoney(r.total),
    })),
    lossesByDay: keys.map((day) => ({
      day,
      amount: serializeMoney(lossesByDay[day]),
    })),
    ordersByDay,
    audienceByDay,
    topItems: topItems.map((item) => ({
      ...item,
      revenue: serializeMoney(item.revenue),
    })),
    paymentMethodBreakdown,
    dailyClose,
  };
}
