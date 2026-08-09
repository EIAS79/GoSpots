import type { DashboardOverview } from "./dashboard-client";
import type { FinanceAnalytics, SalesByItem } from "./finance-client";
import { coerceMoney } from "./money";
import type { ReportCsvOptions } from "./export-report";

const encoder = new TextEncoder();

const STYLE = {
  default: 0,
  title: 1,
  subtitle: 2,
  metaLabel: 3,
  metaValue: 4,
  sectionEmerald: 5,
  sectionSky: 6,
  sectionRose: 7,
  sectionAmber: 8,
  headerEmerald: 9,
  headerSky: 10,
  headerRose: 11,
  headerAmber: 12,
  text: 13,
  textCenter: 14,
  integer: 15,
  number: 16,
  currency: 17,
  currencyPositive: 18,
  currencyNegative: 19,
  date: 20,
  note: 21,
} as const;

type CellValue = string | number | boolean | null | undefined;

type SheetCell = {
  value: CellValue;
  style?: number;
};

type SheetSpec = {
  name: string;
  cells: Map<string, SheetCell>;
  merges: string[];
  widths: number[];
  rowHeights?: Record<number, number>;
  freezeRows?: number;
  autoFilter?: string;
  landscape?: boolean;
};

type WorkbookLabels = {
  report: string;
  venue: string;
  period: string;
  generated: string;
  currency: string;
  summary: string;
  financialSummary: string;
  operationsSummary: string;
  paymentMethods: string;
  metric: string;
  amount: string;
  count: string;
  method: string;
  totalRevenue: string;
  menuOrders: string;
  tablesGames: string;
  reservations: string;
  quickSales: string;
  losses: string;
  profit: string;
  orders: string;
  completed: string;
  menuCovers: string;
  bookingGuests: string;
  playPlayers: string;
  marketingViews: string;
  menuViews: string;
  reservationClicks: string;
  transactions: string;
  playSessions: string;
  revenue: string;
  revenueByDay: string;
  audienceLosses: string;
  audienceByDay: string;
  lossesByDay: string;
  sales: string;
  salesByItem: string;
  date: string;
  total: string;
  item: string;
  quantity: string;
  noData: string;
  revenueToday: string;
  revenue7d: string;
  profit7d: string;
  losses7d: string;
  ordersToday: string;
  completedOrders7d: string;
  guests7d: string;
  reservationsToday: string;
  pendingReservations: string;
  venueViews7d: string;
  menuViews7d: string;
  bookingClicks7d: string;
  trends: string;
  ordersGuests: string;
  guests: string;
  views: string;
  topSellers: string;
  recentReservations: string;
  recentActivity: string;
  guest: string;
  resource: string;
  status: string;
  timestamp: string;
  action: string;
  details: string;
};

const LABELS: Record<"en" | "pl", WorkbookLabels> = {
  en: {
    report: "Report",
    venue: "Venue",
    period: "Period",
    generated: "Generated",
    currency: "Currency",
    summary: "Summary",
    financialSummary: "Financial summary",
    operationsSummary: "Operations summary",
    paymentMethods: "Payment methods",
    metric: "Metric",
    amount: "Amount",
    count: "Count",
    method: "Method",
    totalRevenue: "Total revenue",
    menuOrders: "Menu orders",
    tablesGames: "Tables & games",
    reservations: "Reservations",
    quickSales: "Quick sales",
    losses: "Losses",
    profit: "Profit",
    orders: "Orders",
    completed: "Completed",
    menuCovers: "Menu covers",
    bookingGuests: "Booking guests",
    playPlayers: "Play players",
    marketingViews: "Marketing views",
    menuViews: "Menu views",
    reservationClicks: "Booking clicks",
    transactions: "Transactions",
    playSessions: "Play sessions",
    revenue: "Revenue",
    revenueByDay: "Revenue by day",
    audienceLosses: "Audience & losses",
    audienceByDay: "Audience by day",
    lossesByDay: "Losses by day",
    sales: "Sales",
    salesByItem: "Sales by item",
    date: "Date",
    total: "Total",
    item: "Item",
    quantity: "Quantity",
    noData: "No data for this period",
    revenueToday: "Revenue today",
    revenue7d: "Revenue - last 7 days",
    profit7d: "Profit - last 7 days",
    losses7d: "Losses - last 7 days",
    ordersToday: "Orders today",
    completedOrders7d: "Completed orders - last 7 days",
    guests7d: "Guests - last 7 days",
    reservationsToday: "Reservations today",
    pendingReservations: "Pending reservations",
    venueViews7d: "Venue views - last 7 days",
    menuViews7d: "Menu views - last 7 days",
    bookingClicks7d: "Booking clicks - last 7 days",
    trends: "Trends",
    ordersGuests: "Orders vs guests",
    guests: "Guests",
    views: "Views",
    topSellers: "Top sellers",
    recentReservations: "Recent reservations",
    recentActivity: "Recent activity",
    guest: "Guest",
    resource: "Resource",
    status: "Status",
    timestamp: "Timestamp",
    action: "Action",
    details: "Details",
  },
  pl: {
    report: "Raport",
    venue: "Lokal",
    period: "Okres",
    generated: "Wygenerowano",
    currency: "Waluta",
    summary: "Podsumowanie",
    financialSummary: "Podsumowanie finansowe",
    operationsSummary: "Podsumowanie operacyjne",
    paymentMethods: "Metody płatności",
    metric: "Wskaźnik",
    amount: "Kwota",
    count: "Liczba",
    method: "Metoda",
    totalRevenue: "Przychód łącznie",
    menuOrders: "Zamówienia z menu",
    tablesGames: "Stoły i gry",
    reservations: "Rezerwacje",
    quickSales: "Szybka sprzedaż",
    losses: "Straty",
    profit: "Zysk",
    orders: "Zamówienia",
    completed: "Zrealizowane",
    menuCovers: "Goście menu",
    bookingGuests: "Goście rezerwacji",
    playPlayers: "Gracze",
    marketingViews: "Wyświetlenia marketingowe",
    menuViews: "Wyświetlenia menu",
    reservationClicks: "Kliknięcia rezerwacji",
    transactions: "Transakcje",
    playSessions: "Sesje gry",
    revenue: "Przychód",
    revenueByDay: "Przychód dzienny",
    audienceLosses: "Goście i straty",
    audienceByDay: "Goście dziennie",
    lossesByDay: "Straty dzienne",
    sales: "Sprzedaż",
    salesByItem: "Sprzedaż wg pozycji",
    date: "Data",
    total: "Razem",
    item: "Pozycja",
    quantity: "Ilość",
    noData: "Brak danych dla tego okresu",
    revenueToday: "Przychód dzisiaj",
    revenue7d: "Przychód - ostatnie 7 dni",
    profit7d: "Zysk - ostatnie 7 dni",
    losses7d: "Straty - ostatnie 7 dni",
    ordersToday: "Zamówienia dzisiaj",
    completedOrders7d: "Zrealizowane zamówienia - ostatnie 7 dni",
    guests7d: "Goście - ostatnie 7 dni",
    reservationsToday: "Rezerwacje dzisiaj",
    pendingReservations: "Oczekujące rezerwacje",
    venueViews7d: "Wyświetlenia lokalu - ostatnie 7 dni",
    menuViews7d: "Wyświetlenia menu - ostatnie 7 dni",
    bookingClicks7d: "Kliknięcia rezerwacji - ostatnie 7 dni",
    trends: "Trendy",
    ordersGuests: "Zamówienia i goście",
    guests: "Goście",
    views: "Wyświetlenia",
    topSellers: "Najlepsza sprzedaż",
    recentReservations: "Ostatnie rezerwacje",
    recentActivity: "Ostatnia aktywność",
    guest: "Gość",
    resource: "Zasób",
    status: "Status",
    timestamp: "Data i czas",
    action: "Akcja",
    details: "Szczegóły",
  },
};

function labelsFor(locale?: string) {
  return locale?.toLowerCase().startsWith("pl") ? LABELS.pl : LABELS.en;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cellRef(row: number, col: number) {
  return `${columnName(col)}${row}`;
}

function setCell(
  sheet: SheetSpec,
  row: number,
  col: number,
  value: CellValue,
  style = STYLE.text,
) {
  sheet.cells.set(cellRef(row, col), { value, style });
}

function setRow(
  sheet: SheetSpec,
  row: number,
  startCol: number,
  values: CellValue[],
  style = STYLE.text,
) {
  values.forEach((value, offset) =>
    setCell(sheet, row, startCol + offset, value, style),
  );
}

function mergeTitle(
  sheet: SheetSpec,
  title: string,
  subtitle: string,
  endCol: number,
) {
  setCell(sheet, 1, 0, title, STYLE.title);
  sheet.merges.push(`A1:${columnName(endCol)}2`);
  setCell(sheet, 3, 0, subtitle, STYLE.subtitle);
  sheet.merges.push(`A3:${columnName(endCol)}3`);
  sheet.rowHeights = { ...(sheet.rowHeights ?? {}), 1: 26, 2: 26, 3: 22 };
}

function addMetaBlock(
  sheet: SheetSpec,
  startRow: number,
  labels: WorkbookLabels,
  values: {
    venue: string;
    period: string;
    generated: string;
    currency: string;
  },
) {
  const rows: [string, string][] = [
    [labels.venue, values.venue],
    [labels.period, values.period],
    [labels.generated, values.generated],
    [labels.currency, values.currency],
  ];
  rows.forEach(([label, value], i) => {
    setCell(sheet, startRow + i, 0, label, STYLE.metaLabel);
    setCell(sheet, startRow + i, 1, value, STYLE.metaValue);
  });
}

function addSectionHeader(
  sheet: SheetSpec,
  row: number,
  startCol: number,
  endCol: number,
  title: string,
  style: number,
) {
  setCell(sheet, row, startCol, title, style);
  sheet.merges.push(
    `${cellRef(row, startCol)}:${cellRef(row, Math.max(startCol, endCol))}`,
  );
  sheet.rowHeights = { ...(sheet.rowHeights ?? {}), [row]: 22 };
}

function formatGenerated(date: Date, locale: string) {
  try {
    return date.toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return date.toISOString();
  }
}

function paymentMethodLabel(
  method: string,
  options: ReportCsvOptions,
): string {
  return options.paymentMethodLabel?.(method) ?? method;
}

function newSheet(
  name: string,
  widths: number[],
  opts: Pick<SheetSpec, "freezeRows" | "autoFilter" | "landscape"> = {},
): SheetSpec {
  return {
    name,
    cells: new Map(),
    merges: [],
    widths,
    ...opts,
  };
}

function money(value: unknown) {
  return Math.round(coerceMoney(value) * 100) / 100;
}

function financeSheets(
  data: FinanceAnalytics,
  venueName: string,
  salesByItem: SalesByItem[],
  options: ReportCsvOptions,
): SheetSpec[] {
  const locale = options.locale?.trim() || "en";
  const labels = labelsFor(locale);
  const currency = options.currency?.trim() || "";
  const generatedAt = options.generatedAt ?? new Date();
  const period = options.periodLabel ?? `${data.days} days`;
  const meta = {
    venue: venueName,
    period,
    generated: formatGenerated(generatedAt, locale),
    currency,
  };
  const { summary } = data;

  const summarySheet = newSheet(labels.summary, [24, 20, 4, 28, 15, 4, 22, 12, 18]);
  mergeTitle(summarySheet, `${venueName} · ${labels.report}`, `${labels.financialSummary} · ${period}`, 8);
  addMetaBlock(summarySheet, 5, labels, meta);

  addSectionHeader(summarySheet, 10, 0, 1, labels.financialSummary, STYLE.sectionEmerald);
  setRow(summarySheet, 11, 0, [labels.metric, `${labels.amount} (${currency})`], STYLE.headerEmerald);
  const financeMetrics: [string, number, number][] = [
    [labels.totalRevenue, money(summary.revenue), STYLE.currencyPositive],
    [labels.menuOrders, money(summary.revenueMenuOrders ?? summary.revenueOrders), STYLE.currency],
    [labels.tablesGames, money(summary.revenuePlaySessions ?? 0), STYLE.currency],
    [labels.reservations, money(summary.revenueReservations ?? 0), STYLE.currency],
    [labels.quickSales, money(summary.revenueQuickSales ?? summary.revenueTransactions), STYLE.currency],
    [labels.losses, money(summary.losses), STYLE.currencyNegative],
    [labels.profit, money(summary.profit), STYLE.currencyPositive],
  ];
  financeMetrics.forEach(([label, value, style], i) => {
    setCell(summarySheet, 12 + i, 0, label, STYLE.text);
    setCell(summarySheet, 12 + i, 1, value, style);
  });

  addSectionHeader(summarySheet, 10, 3, 4, labels.operationsSummary, STYLE.sectionSky);
  setRow(summarySheet, 11, 3, [labels.metric, labels.count], STYLE.headerSky);
  const operationMetrics: [string, number][] = [
    [labels.orders, summary.orderCount],
    [labels.completed, summary.completedOrderCount],
    [labels.menuCovers, summary.menuCovers ?? summary.customerCount],
    [labels.bookingGuests, summary.reservationGuests ?? 0],
    [labels.playPlayers, summary.playPlayers ?? 0],
    [labels.marketingViews, summary.marketingViews ?? 0],
    [labels.menuViews, summary.menuViews ?? 0],
    [labels.reservationClicks, summary.reservationClicks ?? 0],
    [labels.transactions, summary.transactionCount ?? 0],
    [labels.playSessions, summary.playSessionCount ?? 0],
  ];
  operationMetrics.forEach(([label, value], i) => {
    setCell(summarySheet, 12 + i, 3, label, STYLE.text);
    setCell(summarySheet, 12 + i, 4, value, STYLE.integer);
  });

  addSectionHeader(summarySheet, 10, 6, 8, labels.paymentMethods, STYLE.sectionAmber);
  setRow(summarySheet, 11, 6, [labels.method, labels.count, `${labels.amount} (${currency})`], STYLE.headerAmber);
  const payments = data.paymentMethodBreakdown ?? [];
  if (payments.length === 0) {
    setCell(summarySheet, 12, 6, labels.noData, STYLE.note);
    summarySheet.merges.push("G12:I12");
  } else {
    payments.forEach((row, i) => {
      setCell(summarySheet, 12 + i, 6, paymentMethodLabel(row.method, options), STYLE.text);
      setCell(summarySheet, 12 + i, 7, row.count, STYLE.integer);
      setCell(summarySheet, 12 + i, 8, money(row.amount), STYLE.currency);
    });
  }

  const revenueSheet = newSheet(labels.revenue, [15, 17, 17, 17, 17, 17, 4, 24, 18], {
    freezeRows: 4,
    autoFilter: `A4:F${Math.max(4, 4 + data.revenueByDay.length)}`,
    landscape: true,
  });
  mergeTitle(revenueSheet, `${venueName} · ${labels.revenueByDay}`, period, 8);
  setRow(
    revenueSheet,
    4,
    0,
    [labels.date, labels.menuOrders, labels.tablesGames, labels.reservations, labels.quickSales, labels.total],
    STYLE.headerEmerald,
  );
  data.revenueByDay.forEach((row, i) => {
    const r = 5 + i;
    setCell(revenueSheet, r, 0, row.day, STYLE.date);
    setCell(revenueSheet, r, 1, money(row.menuOrders), STYLE.currency);
    setCell(revenueSheet, r, 2, money(row.playSessions), STYLE.currency);
    setCell(revenueSheet, r, 3, money(row.reservations), STYLE.currency);
    setCell(revenueSheet, r, 4, money(row.quickSales), STYLE.currency);
    setCell(revenueSheet, r, 5, money(row.total), STYLE.currencyPositive);
  });
  if (data.dailyClose) {
    addSectionHeader(revenueSheet, 5, 7, 8, `${labels.summary} · ${data.dailyClose.day}`, STYLE.sectionAmber);
    setRow(revenueSheet, 6, 7, [labels.metric, `${labels.amount} (${currency})`], STYLE.headerAmber);
    const dailyRows: [string, unknown][] = [
      [labels.menuOrders, data.dailyClose.menuOrders],
      [labels.tablesGames, data.dailyClose.playSessions],
      [labels.reservations, data.dailyClose.reservations],
      [labels.quickSales, data.dailyClose.quickSales],
      [labels.total, data.dailyClose.total],
    ];
    dailyRows.forEach(([label, value], i) => {
      setCell(revenueSheet, 7 + i, 7, label, STYLE.text);
      setCell(revenueSheet, 7 + i, 8, money(value), i === dailyRows.length - 1 ? STYLE.currencyPositive : STYLE.currency);
    });
  }

  const audienceSheet = newSheet(labels.audienceLosses, [15, 16, 18, 15, 20, 4, 15, 18], {
    freezeRows: 4,
    landscape: true,
  });
  mergeTitle(audienceSheet, `${venueName} · ${labels.audienceLosses}`, period, 7);
  addSectionHeader(audienceSheet, 4, 0, 4, labels.audienceByDay, STYLE.sectionSky);
  setRow(
    audienceSheet,
    5,
    0,
    [labels.date, labels.menuCovers, labels.bookingGuests, labels.playPlayers, labels.marketingViews],
    STYLE.headerSky,
  );
  data.audienceByDay.forEach((row, i) => {
    const r = 6 + i;
    setCell(audienceSheet, r, 0, row.day, STYLE.date);
    setCell(audienceSheet, r, 1, row.menuCovers, STYLE.integer);
    setCell(audienceSheet, r, 2, row.reservationGuests, STYLE.integer);
    setCell(audienceSheet, r, 3, row.playPlayers, STYLE.integer);
    setCell(audienceSheet, r, 4, row.marketingViews, STYLE.integer);
  });
  addSectionHeader(audienceSheet, 4, 6, 7, labels.lossesByDay, STYLE.sectionRose);
  setRow(audienceSheet, 5, 6, [labels.date, `${labels.amount} (${currency})`], STYLE.headerRose);
  data.lossesByDay.forEach((row, i) => {
    const r = 6 + i;
    setCell(audienceSheet, r, 6, row.day, STYLE.date);
    setCell(audienceSheet, r, 7, money(row.amount), STYLE.currencyNegative);
  });

  const items = salesByItem.length > 0 ? salesByItem : data.topItems;
  const salesSheet = newSheet(labels.sales, [38, 14, 20], {
    freezeRows: 4,
    autoFilter: `A4:C${Math.max(4, 4 + items.length)}`,
  });
  mergeTitle(salesSheet, `${venueName} · ${labels.salesByItem}`, period, 2);
  setRow(salesSheet, 4, 0, [labels.item, labels.quantity, `${labels.revenue} (${currency})`], STYLE.headerAmber);
  if (items.length === 0) {
    setCell(salesSheet, 5, 0, labels.noData, STYLE.note);
    salesSheet.merges.push("A5:C5");
  } else {
    items.forEach((row, i) => {
      setCell(salesSheet, 5 + i, 0, row.name, STYLE.text);
      setCell(salesSheet, 5 + i, 1, row.quantity, STYLE.integer);
      setCell(salesSheet, 5 + i, 2, money(row.revenue), STYLE.currencyPositive);
    });
  }

  return [summarySheet, revenueSheet, audienceSheet, salesSheet];
}

function overviewSheets(
  data: DashboardOverview,
  options: ReportCsvOptions,
): SheetSpec[] {
  const locale = options.locale?.trim() || "en";
  const labels = labelsFor(locale);
  const currency = options.currency?.trim() || "";
  const generatedAt = options.generatedAt ?? new Date();
  const period = options.periodLabel ?? "7 days";
  const venueName = data.shop.name?.trim() || "GoSpots";
  const meta = {
    venue: venueName,
    period,
    generated: formatGenerated(generatedAt, locale),
    currency,
  };

  const summarySheet = newSheet(labels.summary, [26, 18, 4, 30, 14, 4, 30, 14]);
  mergeTitle(summarySheet, `${venueName} · ${labels.report}`, `${labels.summary} · ${period}`, 7);
  addMetaBlock(summarySheet, 5, labels, meta);

  addSectionHeader(summarySheet, 10, 0, 1, labels.financialSummary, STYLE.sectionEmerald);
  setRow(summarySheet, 11, 0, [labels.metric, `${labels.amount} (${currency})`], STYLE.headerEmerald);
  const financeMetrics: [string, number, number][] = [
    [labels.revenueToday, money(data.kpis.revenueToday), STYLE.currencyPositive],
    [labels.revenue7d, money(data.kpis.revenueWeek), STYLE.currencyPositive],
    [labels.profit7d, money(data.kpis.profitWeek), STYLE.currencyPositive],
    [labels.losses7d, money(data.kpis.lossesWeek), STYLE.currencyNegative],
  ];
  financeMetrics.forEach(([label, value, style], i) => {
    setCell(summarySheet, 12 + i, 0, label, STYLE.text);
    setCell(summarySheet, 12 + i, 1, value, style);
  });

  addSectionHeader(summarySheet, 10, 3, 4, labels.operationsSummary, STYLE.sectionSky);
  setRow(summarySheet, 11, 3, [labels.metric, labels.count], STYLE.headerSky);
  const operationMetrics: [string, number][] = [
    [labels.ordersToday, data.kpis.ordersToday],
    [labels.completedOrders7d, data.kpis.completedOrdersWeek],
    [labels.guests7d, data.kpis.customersWeek],
    [labels.reservationsToday, data.kpis.reservationsToday],
    [labels.pendingReservations, data.kpis.reservationsPending],
  ];
  operationMetrics.forEach(([label, value], i) => {
    setCell(summarySheet, 12 + i, 3, label, STYLE.text);
    setCell(summarySheet, 12 + i, 4, value, STYLE.integer);
  });

  addSectionHeader(summarySheet, 10, 6, 7, labels.audienceByDay, STYLE.sectionAmber);
  setRow(summarySheet, 11, 6, [labels.metric, labels.count], STYLE.headerAmber);
  const audienceMetrics: [string, number][] = [
    [labels.venueViews7d, data.kpis.venueViews7d],
    [labels.menuViews7d, data.kpis.menuViews7d],
    [labels.bookingClicks7d, data.kpis.reservationClicks7d],
  ];
  audienceMetrics.forEach(([label, value], i) => {
    setCell(summarySheet, 12 + i, 6, label, STYLE.text);
    setCell(summarySheet, 12 + i, 7, value, STYLE.integer);
  });

  const trendsSheet = newSheet(labels.trends, [15, 20, 4, 15, 14, 14, 4, 15, 14, 4, 15, 18], {
    freezeRows: 5,
    landscape: true,
  });
  mergeTitle(trendsSheet, `${venueName} · ${labels.trends}`, period, 11);

  addSectionHeader(trendsSheet, 4, 0, 1, labels.revenueByDay, STYLE.sectionEmerald);
  setRow(trendsSheet, 5, 0, [labels.date, `${labels.revenue} (${currency})`], STYLE.headerEmerald);
  (data.charts.revenueByDay ?? []).forEach((row, i) => {
    setCell(trendsSheet, 6 + i, 0, row.day, STYLE.date);
    setCell(trendsSheet, 6 + i, 1, money(row.total), STYLE.currencyPositive);
  });

  addSectionHeader(trendsSheet, 4, 3, 5, labels.ordersGuests, STYLE.sectionSky);
  setRow(trendsSheet, 5, 3, [labels.date, labels.orders, labels.guests], STYLE.headerSky);
  (data.charts.ordersByDay ?? []).forEach((row, i) => {
    setCell(trendsSheet, 6 + i, 3, row.day, STYLE.date);
    setCell(trendsSheet, 6 + i, 4, row.count, STYLE.integer);
    setCell(trendsSheet, 6 + i, 5, row.customers, STYLE.integer);
  });

  addSectionHeader(trendsSheet, 4, 7, 8, labels.venueViews7d, STYLE.sectionAmber);
  setRow(trendsSheet, 5, 7, [labels.date, labels.views], STYLE.headerAmber);
  (data.charts.venueViewsByDay ?? []).forEach((row, i) => {
    setCell(trendsSheet, 6 + i, 7, row.day, STYLE.date);
    setCell(trendsSheet, 6 + i, 8, row.count, STYLE.integer);
  });

  addSectionHeader(trendsSheet, 4, 10, 11, labels.lossesByDay, STYLE.sectionRose);
  setRow(trendsSheet, 5, 10, [labels.date, `${labels.amount} (${currency})`], STYLE.headerRose);
  (data.charts.lossesByDay ?? []).forEach((row, i) => {
    setCell(trendsSheet, 6 + i, 10, row.day, STYLE.date);
    setCell(trendsSheet, 6 + i, 11, money(row.amount), STYLE.currencyNegative);
  });

  const sellersSheet = newSheet(labels.topSellers, [38, 14, 20], {
    freezeRows: 4,
    autoFilter: `A4:C${Math.max(4, 4 + data.topMenuItems.length)}`,
  });
  mergeTitle(sellersSheet, `${venueName} · ${labels.topSellers}`, period, 2);
  setRow(sellersSheet, 4, 0, [labels.item, labels.quantity, `${labels.revenue} (${currency})`], STYLE.headerAmber);
  if (data.topMenuItems.length === 0) {
    setCell(sellersSheet, 5, 0, labels.noData, STYLE.note);
    sellersSheet.merges.push("A5:C5");
  } else {
    data.topMenuItems.forEach((row, i) => {
      setCell(sellersSheet, 5 + i, 0, row.name, STYLE.text);
      setCell(sellersSheet, 5 + i, 1, row.quantity, STYLE.integer);
      setCell(sellersSheet, 5 + i, 2, money(row.revenue), STYLE.currencyPositive);
    });
  }

  const activitySheet = newSheet(`${labels.reservations} & ${labels.recentActivity}`, [24, 26, 24, 16, 4, 23, 26, 44], {
    freezeRows: 5,
    landscape: true,
  });
  mergeTitle(activitySheet, `${venueName} · ${labels.reservations} & ${labels.recentActivity}`, period, 7);
  addSectionHeader(activitySheet, 4, 0, 3, labels.recentReservations, STYLE.sectionSky);
  setRow(activitySheet, 5, 0, [labels.guest, labels.timestamp, labels.resource, labels.status], STYLE.headerSky);
  if (data.recentReservations.length === 0) {
    setCell(activitySheet, 6, 0, labels.noData, STYLE.note);
    activitySheet.merges.push("A6:D6");
  } else {
    data.recentReservations.forEach((row, i) => {
      setCell(activitySheet, 6 + i, 0, row.guestName, STYLE.text);
      setCell(activitySheet, 6 + i, 1, row.startsAt, STYLE.textCenter);
      setCell(activitySheet, 6 + i, 2, row.resource ?? "", STYLE.text);
      setCell(activitySheet, 6 + i, 3, row.status, STYLE.textCenter);
    });
  }

  addSectionHeader(activitySheet, 4, 5, 7, labels.recentActivity, STYLE.sectionEmerald);
  setRow(activitySheet, 5, 5, [labels.timestamp, labels.action, labels.details], STYLE.headerEmerald);
  if (data.recentAudit.length === 0) {
    setCell(activitySheet, 6, 5, labels.noData, STYLE.note);
    activitySheet.merges.push("F6:H6");
  } else {
    data.recentAudit.forEach((row, i) => {
      setCell(activitySheet, 6 + i, 5, row.createdAt, STYLE.textCenter);
      setCell(activitySheet, 6 + i, 6, row.action, STYLE.text);
      setCell(activitySheet, 6 + i, 7, row.meta ?? "", STYLE.text);
    });
  }

  return [summarySheet, trendsSheet, sellersSheet, activitySheet];
}

function cellXml(ref: string, cell: SheetCell): string {
  const style = cell.style ?? STYLE.default;
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
  }
  if (typeof cell.value === "boolean") {
    return `<c r="${ref}" s="${style}" t="b"><v>${cell.value ? 1 : 0}</v></c>`;
  }
  if (cell.value == null) {
    return `<c r="${ref}" s="${style}"/>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(cell.value))}</t></is></c>`;
}

function parseRef(ref: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return { row: 0, col: 0 };
  let col = 0;
  for (const char of match[1]) col = col * 26 + (char.charCodeAt(0) - 64);
  return { row: Number(match[2]), col: col - 1 };
}

function sheetXml(sheet: SheetSpec): string {
  const grouped = new Map<number, [string, SheetCell][]>()
  let maxRow = 1;
  let maxCol = 0;
  for (const [ref, cell] of sheet.cells) {
    const parsed = parseRef(ref);
    maxRow = Math.max(maxRow, parsed.row);
    maxCol = Math.max(maxCol, parsed.col);
    const list = grouped.get(parsed.row) ?? [];
    list.push([ref, cell]);
    grouped.set(parsed.row, list);
  }
  for (const merge of sheet.merges) {
    const end = merge.split(":")[1] ?? merge;
    const parsed = parseRef(end);
    maxRow = Math.max(maxRow, parsed.row);
    maxCol = Math.max(maxCol, parsed.col);
  }

  const rows: string[] = [];
  for (let row = 1; row <= maxRow; row += 1) {
    const cells = (grouped.get(row) ?? []).sort(
      (a, b) => parseRef(a[0]).col - parseRef(b[0]).col,
    );
    const height = sheet.rowHeights?.[row];
    rows.push(
      `<row r="${row}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells
        .map(([ref, cell]) => cellXml(ref, cell))
        .join("")}</row>`,
    );
  }

  const cols = sheet.widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");
  const freeze = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : "";
  const merges =
    sheet.merges.length > 0
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
          .map((ref) => `<mergeCell ref="${ref}"/>`)
          .join("")}</mergeCells>`
      : "";
  const autoFilter = sheet.autoFilter
    ? `<autoFilter ref="${sheet.autoFilter}"/>`
    : "";
  const setup = sheet.landscape
    ? `<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>`
    : `<pageMargins left="0.35" right="0.35" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${cellRef(maxRow, maxCol)}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0">${freeze}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${cols}</cols>
  <sheetData>${rows.join("")}</sheetData>
  ${merges}
  ${autoFilter}
  ${setup}
</worksheet>`;
}

function stylesXml(currency: string): string {
  const currencyFormat = `#,##0.00${currency ? ` \"${currency.replace(/"/g, "") }\"` : ""}`;
  const thinBorder = `<border><left style="thin"><color rgb="FFD9E2EC"/></left><right style="thin"><color rgb="FFD9E2EC"/></right><top style="thin"><color rgb="FFD9E2EC"/></top><bottom style="thin"><color rgb="FFD9E2EC"/></bottom><diagonal/></border>`;
  const xf = (
    fontId: number,
    fillId: number,
    borderId: number,
    numFmtId = 0,
    align = "left",
    wrap = true,
  ) => `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="${borderId ? 1 : 0}" applyNumberFormat="${numFmtId ? 1 : 0}" applyAlignment="1"><alignment horizontal="${align}" vertical="center"${wrap ? ' wrapText="1"' : ""}/></xf>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="${xmlEscape(currencyFormat)}"/>
    <numFmt numFmtId="165" formatCode="#,##0"/>
    <numFmt numFmtId="166" formatCode="yyyy-mm-dd"/>
  </numFmts>
  <fonts count="7">
    <font><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Aptos"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="10"/><color rgb="FF047857"/><name val="Aptos"/></font>
    <font><b/><sz val="10"/><color rgb="FFBE123C"/><name val="Aptos"/></font>
    <font><i/><sz val="9"/><color rgb="FF64748B"/><name val="Aptos"/></font>
  </fonts>
  <fills count="10">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF059669"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0284C7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE11D48"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD97706"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE4E6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${thinBorder}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="22">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    ${xf(1, 2, 0, 0, "left")}
    ${xf(2, 0, 0, 0, "left")}
    ${xf(3, 3, 1, 0, "center")}
    ${xf(2, 7, 1, 0, "center")}
    ${xf(3, 3, 1, 0, "left")}
    ${xf(3, 4, 1, 0, "left")}
    ${xf(3, 5, 1, 0, "left")}
    ${xf(3, 6, 1, 0, "left")}
    ${xf(3, 3, 1, 0, "center")}
    ${xf(3, 4, 1, 0, "center")}
    ${xf(3, 5, 1, 0, "center")}
    ${xf(3, 6, 1, 0, "center")}
    ${xf(0, 0, 1, 0, "left")}
    ${xf(0, 0, 1, 0, "center")}
    ${xf(0, 0, 1, 165, "center", false)}
    ${xf(0, 0, 1, 4, "right", false)}
    ${xf(0, 0, 1, 164, "right", false)}
    ${xf(4, 8, 1, 164, "right", false)}
    ${xf(5, 9, 1, 164, "right", false)}
    ${xf(0, 0, 1, 166, "center", false)}
    ${xf(6, 7, 1, 0, "left")}
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function workbookXml(sheets: SheetSpec[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="15000"/></bookViews>
  <sheets>${sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xmlEscape(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("")}</sheets>
  <calcPr calcId="191029"/>
</workbook>`;
}

function workbookRelsXml(sheets: SheetSpec[]): string {
  const sheetRels = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function contentTypesXml(sheetCount: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function coreXml(generatedAt: Date): string {
  const iso = generatedAt.toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>GoSpots</dc:creator>
  <cp:lastModifiedBy>GoSpots</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>
</cp:coreProperties>`;
}

function appXml(sheets: SheetSpec[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>GoSpots</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${xmlEscape(sheet.name.slice(0, 31))}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>
  <Company>GoSpots</Company>
</Properties>`;
}

type ZipEntry = { name: string; data: Uint8Array };

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(data: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2) & 0x1f) >>> 0);
  const dosDate = ((year - 1980) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { time, date: dosDate };
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function zipStore(entries: ZipEntry[], modifiedAt: Date): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const stamp = dosDateTime(modifiedAt);

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(name, 30);
    local.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    central.push(centralHeader);

    offset += localHeader.length + entry.data.length;
  }

  const centralBytes = concatBytes(central);
  const localBytes = concatBytes(local);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralBytes.length, true);
  endView.setUint32(16, localBytes.length, true);
  endView.setUint16(20, 0, true);
  return concatBytes([localBytes, centralBytes, end]);
}

function xlsxFromSheets(
  sheets: SheetSpec[],
  currency: string,
  generatedAt: Date,
): Uint8Array {
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypesXml(sheets.length)) },
    { name: "_rels/.rels", data: encoder.encode(rootRelsXml()) },
    { name: "docProps/core.xml", data: encoder.encode(coreXml(generatedAt)) },
    { name: "docProps/app.xml", data: encoder.encode(appXml(sheets)) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml(sheets)) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRelsXml(sheets)) },
    { name: "xl/styles.xml", data: encoder.encode(stylesXml(currency)) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encoder.encode(sheetXml(sheet)),
    })),
  ];
  return zipStore(entries, generatedAt);
}

export function financeReportToXlsx(
  data: FinanceAnalytics,
  venueName: string,
  salesByItem: SalesByItem[] = [],
  options: ReportCsvOptions = {},
): Uint8Array {
  const generatedAt = options.generatedAt ?? new Date();
  return xlsxFromSheets(
    financeSheets(data, venueName, salesByItem, options),
    options.currency?.trim() || "",
    generatedAt,
  );
}

export function overviewReportToXlsx(
  data: DashboardOverview,
  options: ReportCsvOptions = {},
): Uint8Array {
  const generatedAt = options.generatedAt ?? new Date();
  return xlsxFromSheets(
    overviewSheets(data, options),
    options.currency?.trim() || "",
    generatedAt,
  );
}

export function downloadXlsxFile(filename: string, bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
