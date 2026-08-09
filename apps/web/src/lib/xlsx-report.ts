import type { DashboardOverview } from "./dashboard-client";
import type { FinanceAnalytics, SalesByItem } from "./finance-client";
import type { ReportCsvOptions } from "./export-report";
import { coerceMoney } from "./money";

const encoder = new TextEncoder();

const S = {
  normal: 0,
  title: 1,
  subtitle: 2,
  metaLabel: 3,
  metaValue: 4,
  sectionGreen: 5,
  sectionBlue: 6,
  sectionRed: 7,
  sectionAmber: 8,
  headerGreen: 9,
  headerBlue: 10,
  headerRed: 11,
  headerAmber: 12,
  text: 13,
  center: 14,
  integer: 15,
  money: 16,
  positive: 17,
  negative: 18,
  note: 19,
} as const;

type Value = string | number | boolean | null | undefined;
type Cell = { value: Value; style: number };

type Sheet = {
  name: string;
  cells: Map<number, Map<number, Cell>>;
  merges: string[];
  widths: number[];
  rowHeights: Map<number, number>;
  freezeRows?: number;
  autoFilter?: string;
  landscape?: boolean;
};

type ZipEntry = { name: string; data: Uint8Array };

function t(locale: string, en: string, pl: string) {
  return locale.toLowerCase().startsWith("pl") ? pl : en;
}

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colName(index: number) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function ref(row: number, col: number) {
  return `${colName(col)}${row}`;
}

function sheet(name: string, widths: number[], options: Partial<Sheet> = {}): Sheet {
  return {
    name,
    cells: new Map(),
    merges: [],
    widths,
    rowHeights: new Map(),
    freezeRows: options.freezeRows,
    autoFilter: options.autoFilter,
    landscape: options.landscape,
  };
}

function put(
  target: Sheet,
  row: number,
  col: number,
  value: Value,
  style: number = S.text,
) {
  let rowMap = target.cells.get(row);
  if (!rowMap) {
    rowMap = new Map<number, Cell>();
    target.cells.set(row, rowMap);
  }
  rowMap.set(col, { value, style });
}

function putRow(
  target: Sheet,
  row: number,
  startCol: number,
  values: Value[],
  style: number = S.text,
) {
  values.forEach((value, i) => put(target, row, startCol + i, value, style));
}

function merge(target: Sheet, range: string) {
  target.merges.push(range);
}

function section(
  target: Sheet,
  row: number,
  startCol: number,
  endCol: number,
  label: string,
  style: number,
) {
  put(target, row, startCol, label, style);
  merge(target, `${ref(row, startCol)}:${ref(row, endCol)}`);
  target.rowHeights.set(row, 22);
}

function title(target: Sheet, main: string, sub: string, endCol: number) {
  put(target, 1, 0, main, S.title);
  merge(target, `A1:${colName(endCol)}2`);
  put(target, 3, 0, sub, S.subtitle);
  merge(target, `A3:${colName(endCol)}3`);
  target.rowHeights.set(1, 27);
  target.rowHeights.set(2, 27);
  target.rowHeights.set(3, 22);
}

function meta(
  target: Sheet,
  startRow: number,
  locale: string,
  venue: string,
  period: string,
  generatedAt: Date,
  currency: string,
) {
  const rows = [
    [t(locale, "Venue", "Lokal"), venue],
    [t(locale, "Period", "Okres"), period],
    [
      t(locale, "Generated", "Wygenerowano"),
      generatedAt.toLocaleString(locale || "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    ],
    [t(locale, "Currency", "Waluta"), currency],
  ];
  rows.forEach(([label, value], i) => {
    put(target, startRow + i, 0, label, S.metaLabel);
    put(target, startRow + i, 1, value, S.metaValue);
  });
}

function money(value: unknown) {
  return Math.round(coerceMoney(value) * 100) / 100;
}

function financeWorkbookSheets(
  data: FinanceAnalytics,
  venueName: string,
  salesByItem: SalesByItem[],
  options: ReportCsvOptions,
): Sheet[] {
  const locale = options.locale?.trim() || "en";
  const currency = options.currency?.trim() || "";
  const generatedAt = options.generatedAt ?? new Date();
  const period = options.periodLabel ?? `${data.days} days`;
  const { summary } = data;

  const summarySheet = sheet(
    t(locale, "Summary", "Podsumowanie"),
    [25, 21, 4, 30, 15, 4, 24, 13, 19],
  );
  title(
    summarySheet,
    `${venueName} · ${t(locale, "Finance report", "Raport finansowy")}`,
    period,
    8,
  );
  meta(summarySheet, 5, locale, venueName, period, generatedAt, currency);

  section(
    summarySheet,
    10,
    0,
    1,
    t(locale, "Financial summary", "Podsumowanie finansowe"),
    S.sectionGreen,
  );
  putRow(
    summarySheet,
    11,
    0,
    [t(locale, "Metric", "Wskaźnik"), `${t(locale, "Amount", "Kwota")} (${currency})`],
    S.headerGreen,
  );
  const financeRows: [string, number, number][] = [
    [t(locale, "Total revenue", "Przychód łącznie"), money(summary.revenue), S.positive],
    [t(locale, "Menu orders", "Zamówienia z menu"), money(summary.revenueMenuOrders ?? summary.revenueOrders), S.money],
    [t(locale, "Tables & games", "Stoły i gry"), money(summary.revenuePlaySessions ?? 0), S.money],
    [t(locale, "Reservations", "Rezerwacje"), money(summary.revenueReservations ?? 0), S.money],
    [t(locale, "Quick sales", "Szybka sprzedaż"), money(summary.revenueQuickSales ?? summary.revenueTransactions), S.money],
    [t(locale, "Losses", "Straty"), money(summary.losses), S.negative],
    [t(locale, "Profit", "Zysk"), money(summary.profit), S.positive],
  ];
  financeRows.forEach(([label, value, style], i) => {
    put(summarySheet, 12 + i, 0, label, S.text);
    put(summarySheet, 12 + i, 1, value, style);
  });

  section(
    summarySheet,
    10,
    3,
    4,
    t(locale, "Operations summary", "Podsumowanie operacyjne"),
    S.sectionBlue,
  );
  putRow(
    summarySheet,
    11,
    3,
    [t(locale, "Metric", "Wskaźnik"), t(locale, "Count", "Liczba")],
    S.headerBlue,
  );
  const operationRows: [string, number][] = [
    [t(locale, "Orders", "Zamówienia"), summary.orderCount],
    [t(locale, "Completed", "Zrealizowane"), summary.completedOrderCount],
    [t(locale, "Menu covers", "Goście menu"), summary.menuCovers ?? summary.customerCount],
    [t(locale, "Booking guests", "Goście rezerwacji"), summary.reservationGuests ?? 0],
    [t(locale, "Play players", "Gracze"), summary.playPlayers ?? 0],
    [t(locale, "Marketing views", "Wyświetlenia marketingowe"), summary.marketingViews ?? 0],
    [t(locale, "Menu views", "Wyświetlenia menu"), summary.menuViews ?? 0],
    [t(locale, "Booking clicks", "Kliknięcia rezerwacji"), summary.reservationClicks ?? 0],
    [t(locale, "Transactions", "Transakcje"), summary.transactionCount ?? 0],
    [t(locale, "Play sessions", "Sesje gry"), summary.playSessionCount ?? 0],
  ];
  operationRows.forEach(([label, value], i) => {
    put(summarySheet, 12 + i, 3, label, S.text);
    put(summarySheet, 12 + i, 4, value, S.integer);
  });

  section(
    summarySheet,
    10,
    6,
    8,
    t(locale, "Payment methods", "Metody płatności"),
    S.sectionAmber,
  );
  putRow(
    summarySheet,
    11,
    6,
    [
      t(locale, "Method", "Metoda"),
      t(locale, "Count", "Liczba"),
      `${t(locale, "Amount", "Kwota")} (${currency})`,
    ],
    S.headerAmber,
  );
  const payments = data.paymentMethodBreakdown ?? [];
  if (payments.length === 0) {
    put(summarySheet, 12, 6, t(locale, "No payment data", "Brak danych o płatnościach"), S.note);
    merge(summarySheet, "G12:I12");
  } else {
    payments.forEach((row, i) => {
      put(
        summarySheet,
        12 + i,
        6,
        options.paymentMethodLabel?.(row.method) ?? row.method,
        S.text,
      );
      put(summarySheet, 12 + i, 7, row.count, S.integer);
      put(summarySheet, 12 + i, 8, money(row.amount), S.money);
    });
  }

  const revenueSheet = sheet(
    t(locale, "Revenue", "Przychód"),
    [15, 18, 18, 18, 18, 18, 4, 25, 19],
    { freezeRows: 4, landscape: true },
  );
  title(
    revenueSheet,
    `${venueName} · ${t(locale, "Revenue by day", "Przychód dzienny")}`,
    period,
    8,
  );
  putRow(
    revenueSheet,
    4,
    0,
    [
      t(locale, "Date", "Data"),
      t(locale, "Menu orders", "Zamówienia z menu"),
      t(locale, "Tables & games", "Stoły i gry"),
      t(locale, "Reservations", "Rezerwacje"),
      t(locale, "Quick sales", "Szybka sprzedaż"),
      t(locale, "Total", "Razem"),
    ],
    S.headerGreen,
  );
  data.revenueByDay.forEach((row, i) => {
    const r = 5 + i;
    put(revenueSheet, r, 0, row.day, S.center);
    put(revenueSheet, r, 1, money(row.menuOrders), S.money);
    put(revenueSheet, r, 2, money(row.playSessions), S.money);
    put(revenueSheet, r, 3, money(row.reservations), S.money);
    put(revenueSheet, r, 4, money(row.quickSales), S.money);
    put(revenueSheet, r, 5, money(row.total), S.positive);
  });
  revenueSheet.autoFilter = `A4:F${Math.max(4, 4 + data.revenueByDay.length)}`;

  if (data.dailyClose) {
    section(
      revenueSheet,
      5,
      7,
      8,
      `${t(locale, "Daily close", "Zamknięcie dnia")} · ${data.dailyClose.day}`,
      S.sectionAmber,
    );
    putRow(
      revenueSheet,
      6,
      7,
      [t(locale, "Metric", "Wskaźnik"), `${t(locale, "Amount", "Kwota")} (${currency})`],
      S.headerAmber,
    );
    const closeRows: [string, unknown][] = [
      [t(locale, "Menu orders", "Zamówienia z menu"), data.dailyClose.menuOrders],
      [t(locale, "Tables & games", "Stoły i gry"), data.dailyClose.playSessions],
      [t(locale, "Reservations", "Rezerwacje"), data.dailyClose.reservations],
      [t(locale, "Quick sales", "Szybka sprzedaż"), data.dailyClose.quickSales],
      [t(locale, "Total", "Razem"), data.dailyClose.total],
    ];
    closeRows.forEach(([label, value], i) => {
      put(revenueSheet, 7 + i, 7, label, S.text);
      put(
        revenueSheet,
        7 + i,
        8,
        money(value),
        i === closeRows.length - 1 ? S.positive : S.money,
      );
    });
  }

  const audienceSheet = sheet(
    t(locale, "Audience & losses", "Goście i straty"),
    [15, 17, 19, 16, 21, 4, 15, 19],
    { freezeRows: 5, landscape: true },
  );
  title(
    audienceSheet,
    `${venueName} · ${t(locale, "Audience & losses", "Goście i straty")}`,
    period,
    7,
  );
  section(
    audienceSheet,
    4,
    0,
    4,
    t(locale, "Audience by day", "Goście dziennie"),
    S.sectionBlue,
  );
  putRow(
    audienceSheet,
    5,
    0,
    [
      t(locale, "Date", "Data"),
      t(locale, "Menu covers", "Goście menu"),
      t(locale, "Booking guests", "Goście rezerwacji"),
      t(locale, "Play players", "Gracze"),
      t(locale, "Marketing views", "Wyświetlenia marketingowe"),
    ],
    S.headerBlue,
  );
  data.audienceByDay.forEach((row, i) => {
    const r = 6 + i;
    put(audienceSheet, r, 0, row.day, S.center);
    put(audienceSheet, r, 1, row.menuCovers, S.integer);
    put(audienceSheet, r, 2, row.reservationGuests, S.integer);
    put(audienceSheet, r, 3, row.playPlayers, S.integer);
    put(audienceSheet, r, 4, row.marketingViews, S.integer);
  });
  section(
    audienceSheet,
    4,
    6,
    7,
    t(locale, "Losses by day", "Straty dzienne"),
    S.sectionRed,
  );
  putRow(
    audienceSheet,
    5,
    6,
    [t(locale, "Date", "Data"), `${t(locale, "Amount", "Kwota")} (${currency})`],
    S.headerRed,
  );
  data.lossesByDay.forEach((row, i) => {
    put(audienceSheet, 6 + i, 6, row.day, S.center);
    put(audienceSheet, 6 + i, 7, money(row.amount), S.negative);
  });

  const items = salesByItem.length > 0 ? salesByItem : data.topItems;
  const salesSheet = sheet(t(locale, "Sales", "Sprzedaż"), [42, 15, 21], {
    freezeRows: 4,
  });
  title(
    salesSheet,
    `${venueName} · ${t(locale, "Sales by item", "Sprzedaż wg pozycji")}`,
    period,
    2,
  );
  putRow(
    salesSheet,
    4,
    0,
    [
      t(locale, "Item", "Pozycja"),
      t(locale, "Quantity", "Ilość"),
      `${t(locale, "Revenue", "Przychód")} (${currency})`,
    ],
    S.headerAmber,
  );
  salesSheet.autoFilter = `A4:C${Math.max(4, 4 + items.length)}`;
  if (items.length === 0) {
    put(salesSheet, 5, 0, t(locale, "No sales data", "Brak danych sprzedażowych"), S.note);
    merge(salesSheet, "A5:C5");
  } else {
    items.forEach((row, i) => {
      put(salesSheet, 5 + i, 0, row.name, S.text);
      put(salesSheet, 5 + i, 1, row.quantity, S.integer);
      put(salesSheet, 5 + i, 2, money(row.revenue), S.positive);
    });
  }

  return [summarySheet, revenueSheet, audienceSheet, salesSheet];
}

function overviewWorkbookSheets(
  data: DashboardOverview,
  options: ReportCsvOptions,
): Sheet[] {
  const locale = options.locale?.trim() || "en";
  const currency = options.currency?.trim() || "";
  const generatedAt = options.generatedAt ?? new Date();
  const period = options.periodLabel ?? "7 days";
  const venueName = data.shop.name?.trim() || "GoSpots";

  const summarySheet = sheet(
    t(locale, "Summary", "Podsumowanie"),
    [27, 20, 4, 31, 15, 4, 31, 15],
  );
  title(
    summarySheet,
    `${venueName} · ${t(locale, "Overview report", "Raport przeglądowy")}`,
    period,
    7,
  );
  meta(summarySheet, 5, locale, venueName, period, generatedAt, currency);

  section(
    summarySheet,
    10,
    0,
    1,
    t(locale, "Financial summary", "Podsumowanie finansowe"),
    S.sectionGreen,
  );
  putRow(
    summarySheet,
    11,
    0,
    [t(locale, "Metric", "Wskaźnik"), `${t(locale, "Amount", "Kwota")} (${currency})`],
    S.headerGreen,
  );
  const financeRows: [string, number, number][] = [
    [t(locale, "Revenue today", "Przychód dzisiaj"), money(data.kpis.revenueToday), S.positive],
    [t(locale, "Revenue - last 7 days", "Przychód - ostatnie 7 dni"), money(data.kpis.revenueWeek), S.positive],
    [t(locale, "Profit - last 7 days", "Zysk - ostatnie 7 dni"), money(data.kpis.profitWeek), S.positive],
    [t(locale, "Losses - last 7 days", "Straty - ostatnie 7 dni"), money(data.kpis.lossesWeek), S.negative],
  ];
  financeRows.forEach(([label, value, style], i) => {
    put(summarySheet, 12 + i, 0, label, S.text);
    put(summarySheet, 12 + i, 1, value, style);
  });

  section(
    summarySheet,
    10,
    3,
    4,
    t(locale, "Operations", "Operacje"),
    S.sectionBlue,
  );
  putRow(
    summarySheet,
    11,
    3,
    [t(locale, "Metric", "Wskaźnik"), t(locale, "Count", "Liczba")],
    S.headerBlue,
  );
  const operationRows: [string, number][] = [
    [t(locale, "Orders today", "Zamówienia dzisiaj"), data.kpis.ordersToday],
    [t(locale, "Completed orders - last 7 days", "Zrealizowane zamówienia - ostatnie 7 dni"), data.kpis.completedOrdersWeek],
    [t(locale, "Guests - last 7 days", "Goście - ostatnie 7 dni"), data.kpis.customersWeek],
    [t(locale, "Reservations today", "Rezerwacje dzisiaj"), data.kpis.reservationsToday],
    [t(locale, "Pending reservations", "Oczekujące rezerwacje"), data.kpis.reservationsPending],
  ];
  operationRows.forEach(([label, value], i) => {
    put(summarySheet, 12 + i, 3, label, S.text);
    put(summarySheet, 12 + i, 4, value, S.integer);
  });

  section(
    summarySheet,
    10,
    6,
    7,
    t(locale, "Traffic & engagement", "Ruch i zaangażowanie"),
    S.sectionAmber,
  );
  putRow(
    summarySheet,
    11,
    6,
    [t(locale, "Metric", "Wskaźnik"), t(locale, "Count", "Liczba")],
    S.headerAmber,
  );
  const audienceRows: [string, number][] = [
    [t(locale, "Venue views - last 7 days", "Wyświetlenia lokalu - ostatnie 7 dni"), data.kpis.venueViews7d],
    [t(locale, "Menu views - last 7 days", "Wyświetlenia menu - ostatnie 7 dni"), data.kpis.menuViews7d],
    [t(locale, "Booking clicks - last 7 days", "Kliknięcia rezerwacji - ostatnie 7 dni"), data.kpis.reservationClicks7d],
  ];
  audienceRows.forEach(([label, value], i) => {
    put(summarySheet, 12 + i, 6, label, S.text);
    put(summarySheet, 12 + i, 7, value, S.integer);
  });

  const trendsSheet = sheet(
    t(locale, "Trends", "Trendy"),
    [15, 20, 4, 15, 14, 14, 4, 15, 14, 4, 15, 19],
    { freezeRows: 5, landscape: true },
  );
  title(trendsSheet, `${venueName} · ${t(locale, "Trends", "Trendy")}`, period, 11);

  section(trendsSheet, 4, 0, 1, t(locale, "Revenue", "Przychód"), S.sectionGreen);
  putRow(
    trendsSheet,
    5,
    0,
    [t(locale, "Date", "Data"), `${t(locale, "Revenue", "Przychód")} (${currency})`],
    S.headerGreen,
  );
  (data.charts.revenueByDay ?? []).forEach((row, i) => {
    put(trendsSheet, 6 + i, 0, row.day, S.center);
    put(trendsSheet, 6 + i, 1, money(row.total), S.positive);
  });

  section(
    trendsSheet,
    4,
    3,
    5,
    t(locale, "Orders vs guests", "Zamówienia i goście"),
    S.sectionBlue,
  );
  putRow(
    trendsSheet,
    5,
    3,
    [t(locale, "Date", "Data"), t(locale, "Orders", "Zamówienia"), t(locale, "Guests", "Goście")],
    S.headerBlue,
  );
  (data.charts.ordersByDay ?? []).forEach((row, i) => {
    put(trendsSheet, 6 + i, 3, row.day, S.center);
    put(trendsSheet, 6 + i, 4, row.count, S.integer);
    put(trendsSheet, 6 + i, 5, row.customers, S.integer);
  });

  section(
    trendsSheet,
    4,
    7,
    8,
    t(locale, "Venue views", "Wyświetlenia lokalu"),
    S.sectionAmber,
  );
  putRow(
    trendsSheet,
    5,
    7,
    [t(locale, "Date", "Data"), t(locale, "Views", "Wyświetlenia")],
    S.headerAmber,
  );
  (data.charts.venueViewsByDay ?? []).forEach((row, i) => {
    put(trendsSheet, 6 + i, 7, row.day, S.center);
    put(trendsSheet, 6 + i, 8, row.count, S.integer);
  });

  section(trendsSheet, 4, 10, 11, t(locale, "Losses", "Straty"), S.sectionRed);
  putRow(
    trendsSheet,
    5,
    10,
    [t(locale, "Date", "Data"), `${t(locale, "Amount", "Kwota")} (${currency})`],
    S.headerRed,
  );
  (data.charts.lossesByDay ?? []).forEach((row, i) => {
    put(trendsSheet, 6 + i, 10, row.day, S.center);
    put(trendsSheet, 6 + i, 11, money(row.amount), S.negative);
  });

  const sellersSheet = sheet(t(locale, "Top sellers", "Najlepsza sprzedaż"), [42, 15, 21], {
    freezeRows: 4,
  });
  title(
    sellersSheet,
    `${venueName} · ${t(locale, "Top sellers", "Najlepsza sprzedaż")}`,
    period,
    2,
  );
  putRow(
    sellersSheet,
    4,
    0,
    [
      t(locale, "Item", "Pozycja"),
      t(locale, "Quantity", "Ilość"),
      `${t(locale, "Revenue", "Przychód")} (${currency})`,
    ],
    S.headerAmber,
  );
  sellersSheet.autoFilter = `A4:C${Math.max(4, 4 + data.topMenuItems.length)}`;
  if (data.topMenuItems.length === 0) {
    put(sellersSheet, 5, 0, t(locale, "No sales data", "Brak danych sprzedażowych"), S.note);
    merge(sellersSheet, "A5:C5");
  } else {
    data.topMenuItems.forEach((row, i) => {
      put(sellersSheet, 5 + i, 0, row.name, S.text);
      put(sellersSheet, 5 + i, 1, row.quantity, S.integer);
      put(sellersSheet, 5 + i, 2, money(row.revenue), S.positive);
    });
  }

  const activitySheet = sheet(
    t(locale, "Reservations & activity", "Rezerwacje i aktywność"),
    [24, 28, 25, 16, 4, 24, 29, 46],
    { freezeRows: 5, landscape: true },
  );
  title(
    activitySheet,
    `${venueName} · ${t(locale, "Reservations & activity", "Rezerwacje i aktywność")}`,
    period,
    7,
  );
  section(
    activitySheet,
    4,
    0,
    3,
    t(locale, "Recent reservations", "Ostatnie rezerwacje"),
    S.sectionBlue,
  );
  putRow(
    activitySheet,
    5,
    0,
    [
      t(locale, "Guest", "Gość"),
      t(locale, "Timestamp", "Data i czas"),
      t(locale, "Resource", "Zasób"),
      t(locale, "Status", "Status"),
    ],
    S.headerBlue,
  );
  if (data.recentReservations.length === 0) {
    put(activitySheet, 6, 0, t(locale, "No reservations", "Brak rezerwacji"), S.note);
    merge(activitySheet, "A6:D6");
  } else {
    data.recentReservations.forEach((row, i) => {
      put(activitySheet, 6 + i, 0, row.guestName, S.text);
      put(activitySheet, 6 + i, 1, row.startsAt, S.center);
      put(activitySheet, 6 + i, 2, row.resource ?? "", S.text);
      put(activitySheet, 6 + i, 3, row.status, S.center);
    });
  }

  section(
    activitySheet,
    4,
    5,
    7,
    t(locale, "Recent activity", "Ostatnia aktywność"),
    S.sectionGreen,
  );
  putRow(
    activitySheet,
    5,
    5,
    [
      t(locale, "Timestamp", "Data i czas"),
      t(locale, "Action", "Akcja"),
      t(locale, "Details", "Szczegóły"),
    ],
    S.headerGreen,
  );
  if (data.recentAudit.length === 0) {
    put(activitySheet, 6, 5, t(locale, "No activity", "Brak aktywności"), S.note);
    merge(activitySheet, "F6:H6");
  } else {
    data.recentAudit.forEach((row, i) => {
      put(activitySheet, 6 + i, 5, row.createdAt, S.center);
      put(activitySheet, 6 + i, 6, row.action, S.text);
      put(activitySheet, 6 + i, 7, row.meta ?? "", S.text);
    });
  }

  return [summarySheet, trendsSheet, sellersSheet, activitySheet];
}

function cellXml(row: number, col: number, cell: Cell) {
  const cellRef = ref(row, col);
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return `<c r="${cellRef}" s="${cell.style}"><v>${cell.value}</v></c>`;
  }
  if (typeof cell.value === "boolean") {
    return `<c r="${cellRef}" s="${cell.style}" t="b"><v>${cell.value ? 1 : 0}</v></c>`;
  }
  if (cell.value == null) {
    return `<c r="${cellRef}" s="${cell.style}"/>`;
  }
  return `<c r="${cellRef}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(cell.value))}</t></is></c>`;
}

function sheetXml(target: Sheet) {
  const rowNumbers = [...target.cells.keys()];
  let maxRow = Math.max(1, ...rowNumbers);
  let maxCol = Math.max(0, target.widths.length - 1);
  for (const [row, cells] of target.cells) {
    maxRow = Math.max(maxRow, row);
    for (const col of cells.keys()) maxCol = Math.max(maxCol, col);
  }

  const rows: string[] = [];
  for (let row = 1; row <= maxRow; row += 1) {
    const cells = target.cells.get(row);
    const height = target.rowHeights.get(row);
    const cellMarkup = cells
      ? [...cells.entries()]
          .sort(([a], [b]) => a - b)
          .map(([col, cell]) => cellXml(row, col, cell))
          .join("")
      : "";
    rows.push(
      `<row r="${row}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cellMarkup}</row>`,
    );
  }

  const columns = target.widths
    .map(
      (width, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");
  const pane = target.freezeRows
    ? `<pane ySplit="${target.freezeRows}" topLeftCell="A${target.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : "";
  const merges =
    target.merges.length > 0
      ? `<mergeCells count="${target.merges.length}">${target.merges
          .map((range) => `<mergeCell ref="${range}"/>`)
          .join("")}</mergeCells>`
      : "";
  const filter = target.autoFilter ? `<autoFilter ref="${target.autoFilter}"/>` : "";
  const page = target.landscape
    ? `<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>`
    : `<pageMargins left="0.35" right="0.35" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${ref(maxRow, maxCol)}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${columns}</cols>
  <sheetData>${rows.join("")}</sheetData>
  ${merges}
  ${filter}
  ${page}
</worksheet>`;
}

function stylesXml(currency: string) {
  const moneyFormat = `#,##0.00${currency ? ` "${currency.replace(/"/g, "")}"` : ""}`;
  const border = `<border><left style="thin"><color rgb="FFD9E2EC"/></left><right style="thin"><color rgb="FFD9E2EC"/></right><top style="thin"><color rgb="FFD9E2EC"/></top><bottom style="thin"><color rgb="FFD9E2EC"/></bottom><diagonal/></border>`;
  const xf = (
    fontId: number,
    fillId: number,
    borderId: number,
    numFmtId: number,
    horizontal: "left" | "center" | "right",
    wrap = true,
  ) => `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="${borderId ? 1 : 0}" applyNumberFormat="${numFmtId ? 1 : 0}" applyAlignment="1"><alignment horizontal="${horizontal}" vertical="center"${wrap ? ' wrapText="1"' : ""}/></xf>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="${xml(moneyFormat)}"/></numFmts>
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
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="20">
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
    ${xf(0, 0, 1, 1, "center", false)}
    ${xf(0, 0, 1, 164, "right", false)}
    ${xf(4, 8, 1, 164, "right", false)}
    ${xf(5, 9, 1, 164, "right", false)}
    ${xf(6, 7, 1, 0, "left")}
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function workbookXml(sheets: Sheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="15000"/></bookViews>
  <sheets>${sheets
    .map(
      (item, i) =>
        `<sheet name="${xml(item.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("")}</sheets>
  <calcPr calcId="191029"/>
</workbook>`;
}

function workbookRelsXml(sheets: Sheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function contentTypesXml(count: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${Array.from({ length: count }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function coreXml(date: Date) {
  const iso = date.toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>GoSpots</dc:creator><cp:lastModifiedBy>GoSpots</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>
</cp:coreProperties>`;
}

function appXml(sheets: Sheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>GoSpots</Application>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((item) => `<vt:lpstr>${xml(item.name.slice(0, 31))}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>
  <Company>GoSpots</Company>
</Properties>`;
}

let crcTable: Uint32Array | undefined;

function crc32(data: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosStamp(date: Date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2) & 0x1f) >>> 0);
  const day =
    ((year - 1980) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, day };
}

function concat(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

function zip(entries: ZipEntry[], date: Date) {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  const stamp = dosStamp(date);
  let offset = 0;

  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    localChunks.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, stamp.time, true);
    cv.setUint16(14, stamp.day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centralChunks.push(central);

    offset += local.length + entry.data.length;
  });

  const local = concat(localChunks);
  const central = concat(centralChunks);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);
  ev.setUint16(20, 0, true);
  return concat([local, central, end]);
}

function buildXlsx(sheets: Sheet[], currency: string, generatedAt: Date) {
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypesXml(sheets.length)) },
    { name: "_rels/.rels", data: encoder.encode(rootRelsXml()) },
    { name: "docProps/core.xml", data: encoder.encode(coreXml(generatedAt)) },
    { name: "docProps/app.xml", data: encoder.encode(appXml(sheets)) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml(sheets)) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRelsXml(sheets)) },
    { name: "xl/styles.xml", data: encoder.encode(stylesXml(currency)) },
    ...sheets.map((item, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encoder.encode(sheetXml(item)),
    })),
  ];
  return zip(entries, generatedAt);
}

export function financeReportToXlsx(
  data: FinanceAnalytics,
  venueName: string,
  salesByItem: SalesByItem[] = [],
  options: ReportCsvOptions = {},
) {
  const generatedAt = options.generatedAt ?? new Date();
  return buildXlsx(
    financeWorkbookSheets(data, venueName, salesByItem, options),
    options.currency?.trim() || "",
    generatedAt,
  );
}

export function overviewReportToXlsx(
  data: DashboardOverview,
  options: ReportCsvOptions = {},
) {
  const generatedAt = options.generatedAt ?? new Date();
  return buildXlsx(
    overviewWorkbookSheets(data, options),
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
