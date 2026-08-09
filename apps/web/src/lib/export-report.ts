import type { DashboardOverview } from "./dashboard-client";
import type { FinanceAnalytics, SalesByItem } from "./finance-client";
import { coerceMoney } from "./money";

type CsvCell = string | number | null | undefined;

export type ReportCsvOptions = {
  currency?: string;
  locale?: string;
  periodLabel?: string;
  generatedAt?: Date;
  paymentMethodLabel?: (method: string) => string;
};

type CsvContext = {
  delimiter: "," | ";";
  locale: string;
  currency: string;
};

const CSV_LABELS = {
  en: {
    financeReport: "Finance report",
    overviewReport: "Overview report",
    venue: "Venue",
    period: "Period",
    currency: "Currency",
    generatedAt: "Generated at",
    summary: "SUMMARY",
    metric: "Metric",
    value: "Value",
    totalRevenue: "Total revenue",
    revenueToday: "Revenue today",
    revenue7d: "Revenue - last 7 days",
    profit: "Profit",
    profit7d: "Profit - last 7 days",
    losses: "Losses",
    losses7d: "Losses - last 7 days",
    menuOrders: "Menu orders",
    tablesGames: "Tables & games",
    reservations: "Reservations",
    quickSales: "Quick sales",
    ordersToday: "Orders today",
    completedOrders7d: "Completed orders - last 7 days",
    guests7d: "Guests - last 7 days",
    reservationsToday: "Reservations today",
    pendingReservations: "Pending reservations",
    venueViews7d: "Venue views - last 7 days",
    menuViews7d: "Menu views - last 7 days",
    bookingClicks7d: "Booking clicks - last 7 days",
    paymentMethods: "PAYMENT METHODS",
    method: "Method",
    transactions: "Transactions",
    netAmount: "Net amount",
    revenueByDay: "REVENUE BY DAY",
    date: "Date",
    menu: "Menu",
    play: "Play",
    bookings: "Bookings",
    quick: "Quick",
    total: "Total",
    lossesByDay: "LOSSES BY DAY",
    amount: "Amount",
    audienceByDay: "AUDIENCE BY DAY",
    menuCovers: "Menu covers",
    bookingGuests: "Booking guests",
    playPlayers: "Play players",
    marketingViews: "Marketing views",
    ordersByDay: "ORDERS BY DAY",
    orders: "Orders",
    guests: "Guests",
    completed: "Completed",
    topItems: "TOP ITEMS",
    salesByItem: "SALES BY ITEM",
    item: "Item",
    quantity: "Quantity",
    revenue: "Revenue",
    recentReservations: "RECENT RESERVATIONS",
    guest: "Guest",
    resource: "Resource",
    startsAt: "Starts at",
    status: "Status",
    recentActivity: "RECENT ACTIVITY",
    action: "Action",
    details: "Details",
  },
  pl: {
    financeReport: "Raport finansowy",
    overviewReport: "Raport przeglądowy",
    venue: "Lokal",
    period: "Okres",
    currency: "Waluta",
    generatedAt: "Wygenerowano",
    summary: "PODSUMOWANIE",
    metric: "Wskaźnik",
    value: "Wartość",
    totalRevenue: "Przychód łącznie",
    revenueToday: "Przychód dzisiaj",
    revenue7d: "Przychód - ostatnie 7 dni",
    profit: "Zysk",
    profit7d: "Zysk - ostatnie 7 dni",
    losses: "Straty",
    losses7d: "Straty - ostatnie 7 dni",
    menuOrders: "Zamówienia z menu",
    tablesGames: "Stoły i gry",
    reservations: "Rezerwacje",
    quickSales: "Szybka sprzedaż",
    ordersToday: "Zamówienia dzisiaj",
    completedOrders7d: "Zrealizowane zamówienia - ostatnie 7 dni",
    guests7d: "Goście - ostatnie 7 dni",
    reservationsToday: "Rezerwacje dzisiaj",
    pendingReservations: "Oczekujące rezerwacje",
    venueViews7d: "Wyświetlenia lokalu - ostatnie 7 dni",
    menuViews7d: "Wyświetlenia menu - ostatnie 7 dni",
    bookingClicks7d: "Kliknięcia rezerwacji - ostatnie 7 dni",
    paymentMethods: "METODY PŁATNOŚCI",
    method: "Metoda",
    transactions: "Transakcje",
    netAmount: "Kwota netto",
    revenueByDay: "PRZYCHÓD DZIENNY",
    date: "Data",
    menu: "Menu",
    play: "Gra",
    bookings: "Rezerwacje",
    quick: "Szybka sprzedaż",
    total: "Razem",
    lossesByDay: "STRATY DZIENNE",
    amount: "Kwota",
    audienceByDay: "GOŚCIE DZIENNIE",
    menuCovers: "Goście menu",
    bookingGuests: "Goście rezerwacji",
    playPlayers: "Gracze",
    marketingViews: "Wyświetlenia marketingowe",
    ordersByDay: "ZAMÓWIENIA DZIENNE",
    orders: "Zamówienia",
    guests: "Goście",
    completed: "Zrealizowane",
    topItems: "NAJLEPSZE POZYCJE",
    salesByItem: "SPRZEDAŻ WG POZYCJI",
    item: "Pozycja",
    quantity: "Ilość",
    revenue: "Przychód",
    recentReservations: "OSTATNIE REZERWACJE",
    guest: "Gość",
    resource: "Zasób",
    startsAt: "Początek",
    status: "Status",
    recentActivity: "OSTATNIA AKTYWNOŚĆ",
    action: "Akcja",
    details: "Szczegóły",
  },
} as const;

function getLabels(locale: string) {
  return locale.toLowerCase().startsWith("pl") ? CSV_LABELS.pl : CSV_LABELS.en;
}

function csvContext(options?: ReportCsvOptions): CsvContext {
  const locale = options?.locale?.trim() || "en";
  return {
    locale,
    currency: options?.currency?.trim() || "",
    delimiter: locale.toLowerCase().startsWith("pl") ? ";" : ",",
  };
}

function moneyCell(value: unknown, locale: string): string {
  const amount = coerceMoney(value);
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatGeneratedAt(date: Date, locale: string): string {
  return date.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function appendRow(lines: string[], ctx: CsvContext, cells: CsvCell[]) {
  lines.push(cells.map((cell) => escapeCsvCell(cell, ctx.delimiter)).join(ctx.delimiter));
}

function appendBlank(lines: string[]) {
  lines.push("");
}

function appendSection(lines: string[], ctx: CsvContext, title: string) {
  appendBlank(lines);
  appendRow(lines, ctx, [title]);
}

export function financeReportToCsv(
  data: FinanceAnalytics,
  venueName: string,
  salesByItem: SalesByItem[] = [],
  options: ReportCsvOptions = {},
): string {
  const ctx = csvContext(options);
  const labels = getLabels(ctx.locale);
  const generatedAt = options.generatedAt ?? new Date();
  const { summary } = data;
  const lines: string[] = [];

  appendRow(lines, ctx, [labels.financeReport]);
  appendRow(lines, ctx, [labels.venue, venueName]);
  appendRow(lines, ctx, [labels.period, options.periodLabel ?? `${data.days} days`]);
  appendRow(lines, ctx, [labels.currency, ctx.currency]);
  appendRow(lines, ctx, [labels.generatedAt, formatGeneratedAt(generatedAt, ctx.locale)]);

  appendSection(lines, ctx, labels.summary);
  appendRow(lines, ctx, [labels.metric, labels.value, labels.currency]);
  const summaryRows: [string, CsvCell, boolean][] = [
    [labels.totalRevenue, summary.revenue, true],
    [labels.menuOrders, summary.revenueMenuOrders ?? summary.revenueOrders, true],
    [labels.tablesGames, summary.revenuePlaySessions ?? 0, true],
    [labels.reservations, summary.revenueReservations ?? 0, true],
    [labels.quickSales, summary.revenueQuickSales ?? summary.revenueTransactions, true],
    [labels.losses, summary.losses, true],
    [labels.profit, summary.profit, true],
    [labels.orders, summary.orderCount, false],
    [labels.completed, summary.completedOrderCount, false],
    [labels.menuCovers, summary.menuCovers ?? summary.customerCount, false],
    [labels.bookingGuests, summary.reservationGuests ?? 0, false],
    [labels.playPlayers, summary.playPlayers ?? 0, false],
    [labels.marketingViews, summary.marketingViews ?? 0, false],
  ];
  for (const [metric, value, isMoney] of summaryRows) {
    appendRow(lines, ctx, [
      metric,
      isMoney ? moneyCell(value, ctx.locale) : value,
      isMoney ? ctx.currency : "",
    ]);
  }

  const paymentMethods = data.paymentMethodBreakdown ?? [];
  if (paymentMethods.length > 0) {
    appendSection(lines, ctx, labels.paymentMethods);
    appendRow(lines, ctx, [labels.method, labels.transactions, labels.netAmount, labels.currency]);
    for (const row of paymentMethods) {
      appendRow(lines, ctx, [
        options.paymentMethodLabel?.(row.method) ?? row.method,
        row.count,
        moneyCell(row.amount, ctx.locale),
        ctx.currency,
      ]);
    }
  }

  appendSection(lines, ctx, labels.revenueByDay);
  appendRow(lines, ctx, [
    labels.date,
    labels.menu,
    labels.play,
    labels.bookings,
    labels.quick,
    labels.total,
    labels.currency,
  ]);
  for (const row of data.revenueByDay) {
    appendRow(lines, ctx, [
      row.day,
      moneyCell(row.menuOrders, ctx.locale),
      moneyCell(row.playSessions, ctx.locale),
      moneyCell(row.reservations, ctx.locale),
      moneyCell(row.quickSales, ctx.locale),
      moneyCell(row.total, ctx.locale),
      ctx.currency,
    ]);
  }

  if (data.lossesByDay.length > 0) {
    appendSection(lines, ctx, labels.lossesByDay);
    appendRow(lines, ctx, [labels.date, labels.amount, labels.currency]);
    for (const row of data.lossesByDay) {
      appendRow(lines, ctx, [row.day, moneyCell(row.amount, ctx.locale), ctx.currency]);
    }
  }

  if ((data.audienceByDay ?? []).length > 0) {
    appendSection(lines, ctx, labels.audienceByDay);
    appendRow(lines, ctx, [
      labels.date,
      labels.menuCovers,
      labels.bookingGuests,
      labels.playPlayers,
      labels.marketingViews,
    ]);
    for (const row of data.audienceByDay ?? []) {
      appendRow(lines, ctx, [
        row.day,
        row.menuCovers,
        row.reservationGuests,
        row.playPlayers,
        row.marketingViews,
      ]);
    }
  }

  const items = salesByItem.length > 0 ? salesByItem : data.topItems;
  if (items.length > 0) {
    appendSection(lines, ctx, labels.salesByItem);
    appendRow(lines, ctx, [labels.item, labels.quantity, labels.revenue, labels.currency]);
    for (const row of items) {
      appendRow(lines, ctx, [
        row.name,
        row.quantity,
        moneyCell(row.revenue, ctx.locale),
        ctx.currency,
      ]);
    }
  }

  return lines.join("\r\n");
}

export function overviewReportToCsv(
  data: DashboardOverview,
  options: ReportCsvOptions = {},
): string {
  const ctx = csvContext(options);
  const labels = getLabels(ctx.locale);
  const generatedAt = options.generatedAt ?? new Date();
  const venueName = data.shop.name?.trim() || "GoSpots";
  const lines: string[] = [];
  const { kpis, charts } = data;

  appendRow(lines, ctx, [labels.overviewReport]);
  appendRow(lines, ctx, [labels.venue, venueName]);
  appendRow(lines, ctx, [labels.period, options.periodLabel ?? "7 days"]);
  appendRow(lines, ctx, [labels.currency, ctx.currency]);
  appendRow(lines, ctx, [labels.generatedAt, formatGeneratedAt(generatedAt, ctx.locale)]);

  appendSection(lines, ctx, labels.summary);
  appendRow(lines, ctx, [labels.metric, labels.value, labels.currency]);
  const summaryRows: [string, CsvCell, boolean][] = [
    [labels.revenueToday, kpis.revenueToday, true],
    [labels.revenue7d, kpis.revenueWeek, true],
    [labels.profit7d, kpis.profitWeek, true],
    [labels.losses7d, kpis.lossesWeek, true],
    [labels.ordersToday, kpis.ordersToday, false],
    [labels.completedOrders7d, kpis.completedOrdersWeek, false],
    [labels.guests7d, kpis.customersWeek, false],
    [labels.reservationsToday, kpis.reservationsToday, false],
    [labels.pendingReservations, kpis.reservationsPending, false],
    [labels.venueViews7d, kpis.venueViews7d, false],
    [labels.menuViews7d, kpis.menuViews7d, false],
    [labels.bookingClicks7d, kpis.reservationClicks7d, false],
  ];
  for (const [metric, value, isMoney] of summaryRows) {
    appendRow(lines, ctx, [
      metric,
      isMoney ? moneyCell(value, ctx.locale) : value,
      isMoney ? ctx.currency : "",
    ]);
  }

  appendSection(lines, ctx, labels.revenueByDay);
  appendRow(lines, ctx, [labels.date, labels.revenue, labels.currency]);
  for (const row of charts.revenueByDay ?? []) {
    appendRow(lines, ctx, [row.day, moneyCell(row.total, ctx.locale), ctx.currency]);
  }

  appendSection(lines, ctx, labels.ordersByDay);
  appendRow(lines, ctx, [labels.date, labels.orders, labels.guests]);
  for (const row of charts.ordersByDay ?? []) {
    appendRow(lines, ctx, [row.day, row.count, row.customers]);
  }

  if ((charts.lossesByDay ?? []).length > 0) {
    appendSection(lines, ctx, labels.lossesByDay);
    appendRow(lines, ctx, [labels.date, labels.amount, labels.currency]);
    for (const row of charts.lossesByDay ?? []) {
      appendRow(lines, ctx, [row.day, moneyCell(row.amount, ctx.locale), ctx.currency]);
    }
  }

  if ((charts.venueViewsByDay ?? []).length > 0) {
    appendSection(lines, ctx, labels.audienceByDay);
    appendRow(lines, ctx, [labels.date, labels.venueViews7d]);
    for (const row of charts.venueViewsByDay ?? []) {
      appendRow(lines, ctx, [row.day, row.count]);
    }
  }

  if (data.topMenuItems.length > 0) {
    appendSection(lines, ctx, labels.topItems);
    appendRow(lines, ctx, [labels.item, labels.quantity, labels.revenue, labels.currency]);
    for (const row of data.topMenuItems) {
      appendRow(lines, ctx, [
        row.name,
        row.quantity,
        moneyCell(row.revenue, ctx.locale),
        ctx.currency,
      ]);
    }
  }

  if (data.recentReservations.length > 0) {
    appendSection(lines, ctx, labels.recentReservations);
    appendRow(lines, ctx, [labels.guest, labels.resource, labels.startsAt, labels.status]);
    for (const row of data.recentReservations) {
      appendRow(lines, ctx, [row.guestName, row.resource ?? "", row.startsAt, row.status]);
    }
  }

  if (data.recentAudit.length > 0) {
    appendSection(lines, ctx, labels.recentActivity);
    appendRow(lines, ctx, [labels.generatedAt, labels.action, labels.details]);
    for (const row of data.recentAudit) {
      appendRow(lines, ctx, [row.createdAt, row.action, row.meta ?? ""]);
    }
  }

  return lines.join("\r\n");
}

function escapeCsvCell(value: CsvCell, delimiter: "," | ";") {
  if (value == null) return "";
  const text = String(value);
  if (
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function reportFilename(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized || "gospots-report";
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
) {
  const body = mime.startsWith("text/csv") && !content.startsWith("\uFEFF")
    ? `\uFEFF${content}`
    : content;
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
