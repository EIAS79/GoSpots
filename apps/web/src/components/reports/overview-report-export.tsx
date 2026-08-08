"use client";

import { Download, Printer } from "lucide-react";
import { useState } from "react";
import {
  PrintReportDocument,
  ReportMetricGrid,
  ReportSection,
} from "@/components/reports/print-report-document";
import type { DashboardOverview } from "@/lib/dashboard-client";
import {
  downloadTextFile,
  overviewReportToCsv,
  reportFilename,
} from "@/lib/export-report";
import { formatDate } from "@/lib/format";
import { useVenueSettings } from "@/lib/venue-settings-context";
import { formatVenueDayKey } from "@/lib/venue-timezone";

export function OverviewReportExport({ data }: { data: DashboardOverview }) {
  const { formatMoney, locale, currency, t, shop } = useVenueSettings();
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const venueName = data.shop.name?.trim() || shop?.name?.trim() || "GoSpots";
  const venueTimeZone = shop?.timezone ?? undefined;
  const periodLabel = t("dashOverview.last7Days");
  const labels = reportLabels(locale);

  function handlePrint() {
    setGeneratedAt(new Date());
    requestAnimationFrame(() => window.print());
  }

  function handleDownload() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    downloadTextFile(
      `${reportFilename(venueName)}-overview-${date}.csv`,
      overviewReportToCsv(data, {
        currency,
        locale,
        periodLabel,
        generatedAt: now,
      }),
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-900/35 px-3 py-2.5">
        <div>
          <p className="text-xs font-medium text-zinc-300">{labels.exportTitle}</p>
          <p className="mt-0.5 text-[11px] text-zinc-600">{labels.exportHint}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
          >
            <Printer size={14} />
            PDF
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/15"
          >
            <Download size={14} />
            CSV
          </button>
        </div>
      </div>

      <PrintReportDocument
        title={labels.reportTitle}
        venueName={venueName}
        period={periodLabel}
        generatedAt={generatedAt}
        locale={locale}
        currency={currency}
      >
        <ReportMetricGrid
          items={[
            {
              label: t("dashOverview.revenueToday"),
              value: formatMoney(data.kpis.revenueToday),
            },
            {
              label: t("dashOverview.revenueWeek"),
              value: formatMoney(data.kpis.revenueWeek),
            },
            {
              label: t("dashOverview.profitWeek"),
              value: formatMoney(data.kpis.profitWeek),
              note: `${labels.losses}: ${formatMoney(data.kpis.lossesWeek)}`,
            },
            {
              label: t("dashOverview.ordersToday"),
              value: String(data.kpis.ordersToday),
              note: `${labels.completed7d}: ${data.kpis.completedOrdersWeek}`,
            },
            {
              label: t("dashOverview.guestsWeek"),
              value: String(data.kpis.customersWeek),
            },
            {
              label: t("dashOverview.reservationsTitle"),
              value: String(data.kpis.reservationsToday),
              note: `${labels.pending}: ${data.kpis.reservationsPending}`,
            },
          ]}
        />

        <ReportSection title={t("dashOverview.revenueTrendTitle")} note={periodLabel}>
          <div className="gs-report-table-wrap">
            <table className="gs-report-table">
              <thead>
                <tr>
                  <th>{labels.date}</th>
                  <th className="num">{labels.revenue}</th>
                </tr>
              </thead>
              <tbody>
                {(data.charts.revenueByDay ?? []).map((row) => (
                  <tr key={row.day}>
                    <td>{formatVenueDayKey(row.day, locale)}</td>
                    <td className="num positive">{formatMoney(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>

        <ReportSection title={t("dashOverview.guestsPerDayTitle")} keepTogether>
          <div className="gs-report-table-wrap">
            <table className="gs-report-table">
              <thead>
                <tr>
                  <th>{labels.date}</th>
                  <th className="num">{labels.orders}</th>
                  <th className="num">{labels.guests}</th>
                </tr>
              </thead>
              <tbody>
                {(data.charts.ordersByDay ?? []).map((row) => (
                  <tr key={row.day}>
                    <td>{formatVenueDayKey(row.day, locale)}</td>
                    <td className="num">{row.count}</td>
                    <td className="num">{row.customers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>

        <ReportSection title={labels.audienceTitle} keepTogether>
          <ReportMetricGrid
            items={[
              {
                label: t("dashOverview.venueViews"),
                value: String(data.kpis.venueViews7d),
              },
              {
                label: t("dashOverview.menuViews"),
                value: String(data.kpis.menuViews7d),
              },
              {
                label: t("dashOverview.bookClicks"),
                value: String(data.kpis.reservationClicks7d),
              },
            ]}
          />
          {(data.charts.venueViewsByDay ?? []).length > 0 ? (
            <div className="gs-report-table-wrap">
              <table className="gs-report-table">
                <thead>
                  <tr>
                    <th>{labels.date}</th>
                    <th className="num">{labels.views}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.charts.venueViewsByDay ?? []).map((row) => (
                    <tr key={row.day}>
                      <td>{formatVenueDayKey(row.day, locale)}</td>
                      <td className="num">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ReportSection>

        <ReportSection title={t("dashOverview.topSellersTitle")} keepTogether={data.topMenuItems.length <= 10}>
          {data.topMenuItems.length === 0 ? (
            <div className="gs-report-empty">{t("dashOverview.noSalesYet")}</div>
          ) : (
            <div className="gs-report-table-wrap">
              <table className="gs-report-table">
                <thead>
                  <tr>
                    <th>{labels.item}</th>
                    <th className="num">{labels.quantity}</th>
                    <th className="num">{labels.revenue}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topMenuItems.map((row) => (
                    <tr key={`${row.menuItemId ?? "custom"}-${row.name}`}>
                      <td>{row.name}</td>
                      <td className="num">{row.quantity}</td>
                      <td className="num positive">{formatMoney(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportSection>

        <ReportSection title={t("dashOverview.reservationsTitle")} newPage={data.recentReservations.length > 8}>
          {data.recentReservations.length === 0 ? (
            <div className="gs-report-empty">{labels.noReservations}</div>
          ) : (
            <div className="gs-report-table-wrap">
              <table className="gs-report-table">
                <thead>
                  <tr>
                    <th>{labels.guest}</th>
                    <th>{labels.resource}</th>
                    <th>{labels.startsAt}</th>
                    <th>{labels.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentReservations.map((row) => (
                    <tr key={row.id}>
                      <td>{row.guestName}</td>
                      <td>{row.resource ?? t("dashOverview.noTable")}</td>
                      <td>{formatDate(row.startsAt, locale, venueTimeZone)}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportSection>

        <ReportSection title={t("dashOverview.auditLogTitle")}>
          {data.recentAudit.length === 0 ? (
            <div className="gs-report-empty">{labels.noActivity}</div>
          ) : (
            <div className="gs-report-table-wrap">
              <table className="gs-report-table">
                <thead>
                  <tr>
                    <th>{labels.date}</th>
                    <th>{labels.action}</th>
                    <th>{labels.details}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentAudit.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.createdAt, locale, venueTimeZone)}</td>
                      <td>{row.action}</td>
                      <td className="muted">{row.meta ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportSection>
      </PrintReportDocument>
    </>
  );
}

function reportLabels(locale: string) {
  if (locale.toLowerCase().startsWith("pl")) {
    return {
      exportTitle: "Eksport przeglądu",
      exportHint: "Czytelny raport PDF do druku oraz uporządkowany plik CSV.",
      reportTitle: "Raport przeglądowy",
      losses: "Straty",
      completed7d: "Zrealizowane 7 dni",
      pending: "Oczekujące",
      date: "Data",
      revenue: "Przychód",
      orders: "Zamówienia",
      guests: "Goście",
      audienceTitle: "Ruch i zainteresowanie",
      views: "Wyświetlenia",
      item: "Pozycja",
      quantity: "Ilość",
      guest: "Gość",
      resource: "Zasób",
      startsAt: "Początek",
      status: "Status",
      noReservations: "Brak ostatnich rezerwacji.",
      action: "Akcja",
      details: "Szczegóły",
      noActivity: "Brak ostatniej aktywności.",
    };
  }

  return {
    exportTitle: "Export overview",
    exportHint: "A clean print-ready PDF report and a structured CSV file.",
    reportTitle: "Overview report",
    losses: "Losses",
    completed7d: "Completed 7d",
    pending: "Pending",
    date: "Date",
    revenue: "Revenue",
    orders: "Orders",
    guests: "Guests",
    audienceTitle: "Traffic & engagement",
    views: "Views",
    item: "Item",
    quantity: "Quantity",
    guest: "Guest",
    resource: "Resource",
    startsAt: "Starts at",
    status: "Status",
    noReservations: "No recent reservations.",
    action: "Action",
    details: "Details",
    noActivity: "No recent activity.",
  };
}
