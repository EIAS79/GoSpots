import type { FinanceAnalytics } from "./finance-client";

export function financeReportToCsv(
  data: FinanceAnalytics,
  venueName: string,
): string {
  const { summary } = data;
  const lines: string[] = [
    `Venue,${escapeCsv(venueName)}`,
    `Period,${data.days} day(s)`,
    "",
    "Summary",
    `Total revenue,${summary.revenue}`,
    `Menu orders,${summary.revenueMenuOrders ?? summary.revenueOrders}`,
    `Tables & games,${summary.revenuePlaySessions ?? 0}`,
    `Reservations,${summary.revenueReservations ?? 0}`,
    `Quick sales,${summary.revenueQuickSales ?? summary.revenueTransactions}`,
    `Losses,${summary.losses}`,
    `Profit,${summary.profit}`,
    `Menu covers,${summary.menuCovers ?? summary.customerCount}`,
    `Booking guests,${summary.reservationGuests ?? 0}`,
    `Play players,${summary.playPlayers ?? 0}`,
    `Marketing views,${summary.marketingViews ?? 0}`,
    "",
    "Revenue by day,Menu,Play,Bookings,Quick,Total",
  ];
  for (const row of data.revenueByDay) {
    lines.push(
      `${row.day},${row.menuOrders},${row.playSessions},${row.reservations},${row.quickSales},${row.total}`,
    );
  }
  return lines.join("\n");
}

function escapeCsv(s: string) {
  if (s.includes(",") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
