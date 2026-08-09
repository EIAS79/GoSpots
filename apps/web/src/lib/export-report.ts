import type { DashboardOverview } from "./dashboard-client";
import type { FinanceAnalytics, SalesByItem } from "./finance-client";
import { coerceMoney } from "./money";

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

type CsvRecord = {
  section?: string;
  date?: string;
  metric?: string;
  label?: string;
  item?: string;
  status?: string;
  count?: string | number;
  orders?: string | number;
  guests?: string | number;
  amount?: string | number;
  currency?: string;
  menuAmount?: string | number;
  playAmount?: string | number;
  bookingAmount?: string | number;
  quickAmount?: string | number;
  menuCovers?: string | number;
  bookingGuests?: string | number;
  playPlayers?: string | number;
  marketingViews?: string | number;
  details?: string;
};

const LABELS = {
  en: {
    meta: "Metadata",
    summary: "Summary",
    payments: "Payment methods",
    revenueByDay: "Revenue by day",
    lossesByDay: "Losses by day",
    audienceByDay: "Audience by day",
    ordersByDay: "Orders by day",
    salesByItem: "Sales by item",
    topItems: "Top items",
    reservationsList: "Recent reservations",
    activity: "Recent activity",
    venue: "Venue",
    period: "Period",
    generatedAt: "Generated at",
    reportType: "Report type",
    financeReport: "Finance report",
    overviewReport: "Overview report",
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
    orders: "Orders",
    ordersToday: "Orders today",
    completed: "Completed",
    completedOrders7d: "Completed orders - last 7 days",
    menuCovers: "Menu covers",
    bookingGuests: "Booking guests",
    playPlayers: "Play players",
    marketingViews: "Marketing views",
    guests7d: "Guests - last 7 days",
    reservationsToday: "Reservations today",
    pendingReservations: "Pending reservations",
    venueViews7d: "Venue views - last 7 days",
    menuViews7d: "Menu views - last 7 days",
    bookingClicks7d: "Booking clicks - last 7 days",
    section: "Section",
    date: "Date / timestamp",
    metric: "Metric",
    label: "Label / category",
    item: "Item / resource",
    status: "Status",
    count: "Count",
    ordersColumn: "Orders",
    guestsColumn: "Guests",
    amount: "Amount",
    currency: "Currency",
    menuAmount: "Menu amount",
    playAmount: "Play amount",
    bookingAmount: "Booking amount",
    quickAmount: "Quick-sale amount",
    menuCoversColumn: "Menu covers",
    bookingGuestsColumn: "Booking guests",
    playPlayersColumn: "Play players",
    marketingViewsColumn: "Marketing views",
    details: "Details",
  },
  pl: {
    meta: "Metadane",
    summary: "Podsumowanie",
    payments: "Metody płatności",
    revenueByDay: "Przychód dzienny",
    lossesByDay: "Straty dzienne",
    audienceByDay: "Goście dziennie",
    ordersByDay: "Zamówienia dzienne",
    salesByItem: "Sprzedaż wg pozycji",
    topItems: "Najlepsze pozycje",
    reservationsList: "Ostatnie rezerwacje",
    activity: "Ostatnia aktywność",
    venue: "Lokal",
    period: "Okres",
    generatedAt: "Wygenerowano",
    reportType: "Typ raportu",
    financeReport: "Raport finansowy",
    overviewReport: "Raport przeglądowy",
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
    orders: "Zamówienia",
    ordersToday: "Zamówienia dzisiaj",
    completed: "Zrealizowane",
    completedOrders7d: "Zrealizowane zamówienia - ostatnie 7 dni",
    menuCovers: "Goście menu",
    bookingGuests: "Goście rezerwacji",
    playPlayers: "Gracze",
    marketingViews: "Wyświetlenia marketingowe",
    guests7d: "Goście - ostatnie 7 dni",
    reservationsToday: "Rezerwacje dzisiaj",
    pendingReservations: "Oczekujące rezerwacje",
    venueViews7d: "Wyświetlenia lokalu - ostatnie 7 dni",
    menuViews7d: "Wyświetlenia menu - ostatnie 7 dni",
    bookingClicks7d: "Kliknięcia rezerwacji - ostatnie 7 dni",
    section: "Sekcja",
    date: "Data / czas",
    metric: "Wskaźnik",
    label: "Etykieta / kategoria",
    item: "Pozycja / zasób",
    status: "Status",
    count: "Liczba",
    ordersColumn: "Zamówienia",
    guestsColumn: "Goście",
    amount: "Kwota",
    currency: "Waluta",
    menuAmount: "Kwota menu",
    playAmount: "Kwota gry",
    bookingAmount: "Kwota rezerwacji",
    quickAmount: "Kwota szybkiej sprzedaży",
    menuCoversColumn: "Goście menu",
    bookingGuestsColumn: "Goście rezerwacji",
    playPlayersColumn: "Gracze",
    marketingViewsColumn: "Wyświetlenia marketingowe",
    details: "Szczegóły",
  },
} as const;

function getLabels(locale: string) {
  return locale.toLowerCase().startsWith("pl") ? LABELS.pl : LABELS.en;
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
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(coerceMoney(value));
}

function formatGeneratedAt(date: Date, locale: string): string {
  return date.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeCsvCell(value: string | number | null | undefined, delimiter: "," | ";") {
  if (value == null) return "";
  const text = String(value);
  if (text.includes(delimiter) || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeRecords(records: CsvRecord[], ctx: CsvContext): string {
  const labels = getLabels(ctx.locale);
  const columns: { key: keyof CsvRecord; label: string }[] = [
    { key: "section", label: labels.section },
    { key: "date", label: labels.date },
    { key: "metric", label: labels.metric },
    { key: "label", label: labels.label },
    { key: "item", label: labels.item },
    { key: "status", label: labels.status },
    { key: "count", label: labels.count },
    { key: "orders", label: labels.ordersColumn },
    { key: "guests", label: labels.guestsColumn },
    { key: "amount", label: labels.amount },
    { key: "currency", label: labels.currency },
    { key: "menuAmount", label: labels.menuAmount },
    { key: "playAmount", label: labels.playAmount },
    { key: "bookingAmount", label: labels.bookingAmount },
    { key: "quickAmount", label: labels.quickAmount },
    { key: "menuCovers", label: labels.menuCoversColumn },
    { key: "bookingGuests", label: labels.bookingGuestsColumn },
    { key: "playPlayers", label: labels.playPlayersColumn },
    { key: "marketingViews", label: labels.marketingViewsColumn },
    { key: "details", label: labels.details },
  ];
  const lines = [columns.map((column) => escapeCsvCell(column.label, ctx.delimiter)).join(ctx.delimiter)];
  for (const record of records) {
    lines.push(columns.map((column) => escapeCsvCell(record[column.key], ctx.delimiter)).join(ctx.delimiter));
  }
  return lines.join("\r\n");
}

function metaRecords(
  reportType: string,
  venueName: string,
  period: string,
  generatedAt: Date,
  ctx: CsvContext,
): CsvRecord[] {
  const labels = getLabels(ctx.locale);
  return [
    { section: labels.meta, metric: labels.reportType, details: reportType },
    { section: labels.meta, metric: labels.venue, details: venueName },
    { section: labels.meta, metric: labels.period, details: period },
    { section: labels.meta, metric: labels.currency, details: ctx.currency },
    { section: labels.meta, metric: labels.generatedAt, date: generatedAt.toISOString(), details: formatGeneratedAt(generatedAt, ctx.locale) },
  ];
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
  const records: CsvRecord[] = metaRecords(
    labels.financeReport,
    venueName,
    options.periodLabel ?? `${data.days} days`,
    generatedAt,
    ctx,
  );

  const moneySummary: [string, unknown][] = [
    [labels.totalRevenue, summary.revenue],
    [labels.menuOrders, summary.revenueMenuOrders ?? summary.revenueOrders],
    [labels.tablesGames, summary.revenuePlaySessions ?? 0],
    [labels.reservations, summary.revenueReservations ?? 0],
    [labels.quickSales, summary.revenueQuickSales ?? summary.revenueTransactions],
    [labels.losses, summary.losses],
    [labels.profit, summary.profit],
  ];
  for (const [metric, value] of moneySummary) {
    records.push({ section: labels.summary, metric, amount: moneyCell(value, ctx.locale), currency: ctx.currency });
  }
  const countSummary: [string, number][] = [
    [labels.orders, summary.orderCount],
    [labels.completed, summary.completedOrderCount],
    [labels.menuCovers, summary.menuCovers ?? summary.customerCount],
    [labels.bookingGuests, summary.reservationGuests ?? 0],
    [labels.playPlayers, summary.playPlayers ?? 0],
    [labels.marketingViews, summary.marketingViews ?? 0],
  ];
  for (const [metric, count] of countSummary) records.push({ section: labels.summary, metric, count });

  for (const row of data.paymentMethodBreakdown ?? []) {
    records.push({
      section: labels.payments,
      label: options.paymentMethodLabel?.(row.method) ?? row.method,
      count: row.count,
      amount: moneyCell(row.amount, ctx.locale),
      currency: ctx.currency,
    });
  }

  for (const row of data.revenueByDay) {
    records.push({
      section: labels.revenueByDay,
      date: row.day,
      amount: moneyCell(row.total, ctx.locale),
      currency: ctx.currency,
      menuAmount: moneyCell(row.menuOrders, ctx.locale),
      playAmount: moneyCell(row.playSessions, ctx.locale),
      bookingAmount: moneyCell(row.reservations, ctx.locale),
      quickAmount: moneyCell(row.quickSales, ctx.locale),
    });
  }

  for (const row of data.lossesByDay) {
    records.push({ section: labels.lossesByDay, date: row.day, amount: moneyCell(row.amount, ctx.locale), currency: ctx.currency });
  }

  for (const row of data.audienceByDay ?? []) {
    records.push({
      section: labels.audienceByDay,
      date: row.day,
      count: row.menuCovers + row.reservationGuests + row.playPlayers,
      menuCovers: row.menuCovers,
      bookingGuests: row.reservationGuests,
      playPlayers: row.playPlayers,
      marketingViews: row.marketingViews,
    });
  }

  const items = salesByItem.length > 0 ? salesByItem : data.topItems;
  for (const row of items) {
    records.push({
      section: labels.salesByItem,
      item: row.name,
      count: row.quantity,
      amount: moneyCell(row.revenue, ctx.locale),
      currency: ctx.currency,
    });
  }

  return serializeRecords(records, ctx);
}

export function overviewReportToCsv(
  data: DashboardOverview,
  options: ReportCsvOptions = {},
): string {
  const ctx = csvContext(options);
  const labels = getLabels(ctx.locale);
  const generatedAt = options.generatedAt ?? new Date();
  const venueName = data.shop.name?.trim() || "GoSpots";
  const { kpis, charts } = data;
  const records: CsvRecord[] = metaRecords(
    labels.overviewReport,
    venueName,
    options.periodLabel ?? "7 days",
    generatedAt,
    ctx,
  );

  const moneySummary: [string, unknown][] = [
    [labels.revenueToday, kpis.revenueToday],
    [labels.revenue7d, kpis.revenueWeek],
    [labels.profit7d, kpis.profitWeek],
    [labels.losses7d, kpis.lossesWeek],
  ];
  for (const [metric, value] of moneySummary) {
    records.push({ section: labels.summary, metric, amount: moneyCell(value, ctx.locale), currency: ctx.currency });
  }
  const countSummary: [string, number][] = [
    [labels.ordersToday, kpis.ordersToday],
    [labels.completedOrders7d, kpis.completedOrdersWeek],
    [labels.guests7d, kpis.customersWeek],
    [labels.reservationsToday, kpis.reservationsToday],
    [labels.pendingReservations, kpis.reservationsPending],
    [labels.venueViews7d, kpis.venueViews7d],
    [labels.menuViews7d, kpis.menuViews7d],
    [labels.bookingClicks7d, kpis.reservationClicks7d],
  ];
  for (const [metric, count] of countSummary) records.push({ section: labels.summary, metric, count });

  for (const row of charts.revenueByDay ?? []) {
    records.push({ section: labels.revenueByDay, date: row.day, amount: moneyCell(row.total, ctx.locale), currency: ctx.currency });
  }
  for (const row of charts.ordersByDay ?? []) {
    records.push({ section: labels.ordersByDay, date: row.day, orders: row.count, guests: row.customers });
  }
  for (const row of charts.lossesByDay ?? []) {
    records.push({ section: labels.lossesByDay, date: row.day, amount: moneyCell(row.amount, ctx.locale), currency: ctx.currency });
  }
  for (const row of charts.venueViewsByDay ?? []) {
    records.push({ section: labels.audienceByDay, date: row.day, metric: labels.venueViews7d, count: row.count });
  }

  for (const row of data.topMenuItems) {
    records.push({
      section: labels.topItems,
      item: row.name,
      count: row.quantity,
      amount: moneyCell(row.revenue, ctx.locale),
      currency: ctx.currency,
    });
  }
  for (const row of data.recentReservations) {
    records.push({
      section: labels.reservationsList,
      date: row.startsAt,
      label: row.guestName,
      item: row.resource ?? "",
      status: row.status,
    });
  }
  for (const row of data.recentAudit) {
    records.push({
      section: labels.activity,
      date: row.createdAt,
      metric: row.action,
      details: row.meta ?? "",
    });
  }

  return serializeRecords(records, ctx);
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
  const body = mime.startsWith("text/csv") && !content.startsWith("\uFEFF") ? `\uFEFF${content}` : content;
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
