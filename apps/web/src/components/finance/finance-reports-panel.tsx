"use client";

import {
  CalendarRange,
  CreditCard,
  Download,
  Eye,
  Gamepad2,
  Loader2,
  Printer,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  VenueBarChart,
  VenueDoughnutChart,
  VenueLineChart,
  VenueMultiBarChart,
} from "@/components/charts/venue-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  PrintReportDocument,
  ReportMetricGrid,
  ReportSection,
} from "@/components/reports/print-report-document";
import { cn } from "@/lib/cn";
import {
  downloadTextFile,
  financeReportToCsv,
  reportFilename,
} from "@/lib/export-report";
import {
  fetchFinanceAnalytics,
  fetchSalesByItem,
  type FinanceAnalytics,
  type SalesByItem,
} from "@/lib/finance-client";
import { coerceMoney } from "@/lib/money";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueSettings } from "@/lib/venue-settings-context";
import { formatVenueDayKey } from "@/lib/venue-timezone";
import { downloadXlsxFile, financeReportToXlsx } from "@/lib/xlsx-report";

const DAY_OPTS = [1, 7, 30, 90] as const;

export function FinanceReportsPanel({
  venueName = "Venue",
  liveRefresh = false,
}: {
  venueName?: string;
  liveRefresh?: boolean;
}) {
  const { formatMoney, t, locale, currency } = useVenueSettings();
  const formatDayKey = (dayKey: string) => formatVenueDayKey(dayKey, locale);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FinanceAnalytics | null>(null);
  const [salesByItem, setSalesByItem] = useState<SalesByItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState(() => new Date());

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const [analytics, items] = await Promise.all([
          fetchFinanceAnalytics(days),
          fetchSalesByItem(days),
        ]);
        setData(analytics);
        setSalesByItem(items);
        return true;
      } catch (e) {
        if (!opts?.silent) {
          setError(
            e instanceof Error ? e.message : t("finance.reportLoadFailed"),
          );
        }
        return false;
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [days, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(
    () => load({ silent: true }),
    [days],
    {
      intervalMs: 30_000,
      refreshOnSections: ["finance", "shop_orders"],
      enabled: liveRefresh,
    },
  );

  const periodLabel =
    days === 1
      ? t("finance.reportToday")
      : t("finance.reportLastDays", { days });

  const dayOptLabel = (value: number) => {
    switch (value) {
      case 1:
        return t("finance.reportToday");
      case 7:
        return t("finance.reportDays7");
      case 30:
        return t("finance.reportDays30");
      case 90:
        return t("finance.reportDays90");
      default:
        return String(value);
    }
  };

  const paymentMethodLabel = useCallback(
    (method: string) => {
      switch (method) {
        case "CASH":
          return t("finance.txPayCash");
        case "CARD":
          return t("finance.txPayCard");
        case "ONLINE":
          return t("finance.txPayOnline");
        case "OTHER":
          return t("finance.txPayOther");
        default:
          return method;
      }
    },
    [t],
  );

  function handlePrint() {
    setGeneratedAt(new Date());
    requestAnimationFrame(() => window.print());
  }

  function handleDownloadExcel() {
    if (!data) return;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    downloadXlsxFile(
      `${reportFilename(venueName)}-finance-${days}d-${date}.xlsx`,
      financeReportToXlsx(data, venueName, salesByItem, {
        currency,
        locale,
        periodLabel,
        generatedAt: now,
        paymentMethodLabel,
      }),
    );
  }

  function handleDownloadCsv() {
    if (!data) return;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    downloadTextFile(
      `${reportFilename(venueName)}-finance-${days}d-${date}.csv`,
      financeReportToCsv(data, venueName, salesByItem, {
        currency,
        locale,
        periodLabel,
        generatedAt: now,
        paymentMethodLabel,
      }),
    );
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-rose-300">
        {error ?? t("finance.reportNoData")}
      </p>
    );
  }

  const { summary } = data;
  const paymentBreakdown = data.paymentMethodBreakdown ?? [];
  const dailyClose = data.dailyClose;
  const showDailyClose =
    dailyClose != null && (days === 1 || coerceMoney(dailyClose.total) > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {DAY_OPTS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDays(value)}
            className={
              days === value
                ? "rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-200"
                : "rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10"
            }
          >
            {dayOptLabel(value)}
          </button>
        ))}
        <button
          type="button"
          onClick={handlePrint}
          title={t("finance.reportPrint")}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5"
        >
          <Printer size={14} />
          PDF
        </button>
        <button
          type="button"
          onClick={handleDownloadExcel}
          title="Formatted Excel workbook with organized sheets, styled tables, wrapping, and fitted columns"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/15"
        >
          <Download size={14} />
          Excel
        </button>
        <button
          type="button"
          onClick={handleDownloadCsv}
          title="Raw CSV data for import, filtering, and integrations"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
        >
          <Download size={14} />
          Raw CSV
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {t("finance.reportRefresh")}
        </button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <KpiCard
            label={t("finance.reportTotalRevenue")}
            value={formatMoney(summary.revenue)}
            hint={t("finance.reportProfitLosses", {
              profit: formatMoney(summary.profit),
              losses: formatMoney(summary.losses),
            })}
            icon={TrendingUp}
          />
          <KpiCard
            label={t("finance.reportMenuOrders")}
            value={formatMoney(summary.revenueMenuOrders ?? summary.revenueOrders)}
            icon={UtensilsCrossed}
          />
          <KpiCard
            label={t("finance.reportTablesGames")}
            value={formatMoney(summary.revenuePlaySessions ?? 0)}
            hint={t("finance.reportSessions", {
              n: summary.playSessionCount ?? 0,
            })}
            icon={Gamepad2}
          />
          <KpiCard
            label={t("finance.reportReservations")}
            value={formatMoney(summary.revenueReservations ?? 0)}
            icon={CalendarRange}
          />
          <KpiCard
            label={t("finance.reportMarketingViews")}
            value={String(summary.marketingViews ?? 0)}
            hint={t("finance.reportMarketingHint", {
              menu: summary.menuViews ?? 0,
              book: summary.reservationClicks ?? 0,
            })}
            icon={Eye}
          />
          <KpiCard
            label={t("finance.reportGuests")}
            value={String(
              (summary.menuCovers ?? summary.customerCount) +
                (summary.reservationGuests ?? 0) +
                (summary.playPlayers ?? 0),
            )}
            hint={t("finance.reportGuestsHint", {
              menu: summary.menuCovers ?? summary.customerCount,
              book: summary.reservationGuests ?? 0,
              play: summary.playPlayers ?? 0,
            })}
            icon={Users}
            tone="sky"
          />
        </div>

        {showDailyClose && dailyClose ? (
          <section className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-5">
            <h2 className="text-sm font-semibold text-white">
              {t("finance.reportDailyClose", { day: formatDayKey(dailyClose.day) })}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {t("finance.reportDailyCloseHint")}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <SummaryAmount
                label={t("finance.reportChannelMenu")}
                value={formatMoney(dailyClose.menuOrders)}
              />
              <SummaryAmount
                label={t("finance.reportChannelPlay")}
                value={formatMoney(dailyClose.playSessions)}
              />
              <SummaryAmount
                label={t("finance.reportChannelBookings")}
                value={formatMoney(dailyClose.reservations)}
              />
              <SummaryAmount
                label={t("finance.reportChannelQuick")}
                value={formatMoney(dailyClose.quickSales)}
              />
              <SummaryAmount
                label={t("finance.reportChannelTotal")}
                value={formatMoney(dailyClose.total)}
                strong
              />
            </div>
          </section>
        ) : null}

        {paymentBreakdown.length > 0 ? (
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <CreditCard size={14} className="text-sky-400" />
              {t("finance.reportPaymentBreakdown", { period: periodLabel })}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {t("finance.reportPaymentHint")}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[20rem] text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-4">{t("finance.reportMethod")}</th>
                    <th className="pb-2 pr-4 text-right">
                      {t("finance.reportTxCount")}
                    </th>
                    <th className="pb-2 text-right">
                      {t("finance.reportNetAmount")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paymentBreakdown.map((row) => (
                    <tr key={row.method}>
                      <td className="py-2 pr-4 text-zinc-200">
                        {paymentMethodLabel(row.method)}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-400">
                        {row.count}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right font-medium tabular-nums",
                          coerceMoney(row.amount) < 0
                            ? "text-rose-300"
                            : "text-emerald-300",
                        )}
                      >
                        {formatMoney(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("finance.reportRevenuePeriod", { period: periodLabel })}>
            <VenueLineChart
              data={data.revenueByDay.map((d) => ({
                label: formatDayKey(d.day),
                value: Math.round(coerceMoney(d.total) * 100) / 100,
              }))}
              label={t("finance.reportChartRevenue")}
            />
          </ChartCard>
          <ChartCard title={t("finance.reportRevenueBySource")}>
            {data.revenueByDay.length > 1 ? (
              <VenueMultiBarChart
                labels={data.revenueByDay.map((d) => formatDayKey(d.day))}
                datasets={[
                  {
                    label: t("finance.reportChannelMenu"),
                    data: data.revenueByDay.map((d) => coerceMoney(d.menuOrders)),
                    color: "rgba(52, 211, 153, 0.85)",
                  },
                  {
                    label: t("finance.reportChannelPlay"),
                    data: data.revenueByDay.map((d) => coerceMoney(d.playSessions)),
                    color: "rgba(56, 189, 248, 0.85)",
                  },
                  {
                    label: t("finance.reportChannelBookings"),
                    data: data.revenueByDay.map((d) => coerceMoney(d.reservations)),
                    color: "rgba(251, 191, 36, 0.85)",
                  },
                  {
                    label: t("finance.reportChannelQuick"),
                    data: data.revenueByDay.map((d) => coerceMoney(d.quickSales)),
                    color: "rgba(167, 139, 250, 0.85)",
                  },
                ]}
              />
            ) : (
              <VenueDoughnutChart
                data={[
                  {
                    label: t("finance.reportChannelMenu"),
                    value: coerceMoney(
                      summary.revenueMenuOrders ?? summary.revenueOrders,
                    ),
                    color: "rgba(52, 211, 153, 0.9)",
                  },
                  {
                    label: t("finance.reportChannelPlay"),
                    value: coerceMoney(summary.revenuePlaySessions ?? 0),
                    color: "rgba(56, 189, 248, 0.9)",
                  },
                  {
                    label: t("finance.reportChannelBookings"),
                    value: coerceMoney(summary.revenueReservations ?? 0),
                    color: "rgba(251, 191, 36, 0.9)",
                  },
                  {
                    label: t("finance.reportChannelQuick"),
                    value: coerceMoney(
                      summary.revenueQuickSales ?? summary.revenueTransactions,
                    ),
                    color: "rgba(167, 139, 250, 0.9)",
                  },
                ]}
              />
            )}
          </ChartCard>
          <ChartCard title={t("finance.reportInVenueGuests")}>
            <VenueBarChart
              data={(data.audienceByDay ?? []).map((d) => ({
                label: formatDayKey(d.day),
                value: d.menuCovers + d.reservationGuests + d.playPlayers,
              }))}
              label={t("finance.reportChartGuests")}
              color="rgba(56, 189, 248, 0.85)"
            />
          </ChartCard>
          <ChartCard title={t("finance.reportChartLosses")}>
            <VenueBarChart
              data={data.lossesByDay.map((d) => ({
                label: formatDayKey(d.day),
                value: Math.round(coerceMoney(d.amount) * 100) / 100,
              }))}
              label={t("finance.reportChartLosses")}
              color="rgba(244, 63, 94, 0.75)"
            />
          </ChartCard>
        </div>

        <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-white">
            {t("finance.reportSalesByItem", { period: periodLabel })}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {t("finance.reportSalesByItemHint")}
          </p>
          {salesByItem.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              {t("finance.reportNoItemSales")}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-4">{t("finance.reportColItem")}</th>
                    <th className="pb-2 pr-4 text-right">
                      {t("finance.reportColQty")}
                    </th>
                    <th className="pb-2 text-right">
                      {t("finance.reportColRevenue")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {salesByItem.map((row) => (
                    <tr key={`${row.menuItemId ?? "custom"}-${row.name}`}>
                      <td className="py-2 pr-4 text-zinc-200">{row.name}</td>
                      <td className="py-2 pr-4 text-right text-zinc-400">
                        {row.quantity}
                      </td>
                      <td className="py-2 text-right text-emerald-300">
                        {formatMoney(row.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <FinancePrintReport
        data={data}
        salesByItem={salesByItem}
        venueName={venueName}
        periodLabel={periodLabel}
        generatedAt={generatedAt}
        locale={locale}
        currency={currency}
        formatMoney={formatMoney}
        formatDayKey={formatDayKey}
        paymentMethodLabel={paymentMethodLabel}
        t={t}
      />
    </div>
  );
}

function FinancePrintReport({
  data,
  salesByItem,
  venueName,
  periodLabel,
  generatedAt,
  locale,
  currency,
  formatMoney,
  formatDayKey,
  paymentMethodLabel,
  t,
}: {
  data: FinanceAnalytics;
  salesByItem: SalesByItem[];
  venueName: string;
  periodLabel: string;
  generatedAt: Date;
  locale: string;
  currency: string;
  formatMoney: (value: import("@/lib/money").MoneyWire) => string;
  formatDayKey: (dayKey: string) => string;
  paymentMethodLabel: (method: string) => string;
  t: ReturnType<typeof useVenueSettings>["t"];
}) {
  const { summary } = data;
  const paymentBreakdown = data.paymentMethodBreakdown ?? [];
  const totalGuests =
    (summary.menuCovers ?? summary.customerCount) +
    (summary.reservationGuests ?? 0) +
    (summary.playPlayers ?? 0);
  const items = salesByItem.length > 0 ? salesByItem : data.topItems;
  const showDailyClose =
    data.dailyClose != null &&
    (data.days === 1 || coerceMoney(data.dailyClose.total) > 0);

  return (
    <PrintReportDocument
      title={t("finance.reportTitle", { venue: venueName })}
      venueName={venueName}
      period={periodLabel}
      generatedAt={generatedAt}
      locale={locale}
      currency={currency}
    >
      <ReportMetricGrid
        items={[
          {
            label: t("finance.reportTotalRevenue"),
            value: formatMoney(summary.revenue),
          },
          {
            label: t("finance.reportProfitLosses", {
              profit: "",
              losses: "",
            }).split(":")[0] || "Profit",
            value: formatMoney(summary.profit),
            note: `${t("finance.reportChartLosses")}: ${formatMoney(summary.losses)}`,
          },
          {
            label: t("finance.reportMenuOrders"),
            value: formatMoney(summary.revenueMenuOrders ?? summary.revenueOrders),
          },
          {
            label: t("finance.reportTablesGames"),
            value: formatMoney(summary.revenuePlaySessions ?? 0),
            note: t("finance.reportSessions", { n: summary.playSessionCount ?? 0 }),
          },
          {
            label: t("finance.reportReservations"),
            value: formatMoney(summary.revenueReservations ?? 0),
          },
          {
            label: t("finance.reportGuests"),
            value: String(totalGuests),
          },
        ]}
      />

      <ReportSection title={t("finance.reportRevenueBySource")} keepTogether>
        <div className="gs-report-table-wrap">
          <table className="gs-report-table">
            <thead>
              <tr>
                <th>{t("finance.reportMethod")}</th>
                <th className="num">{t("finance.reportNetAmount")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("finance.reportChannelMenu")}</td>
                <td className="num positive">
                  {formatMoney(summary.revenueMenuOrders ?? summary.revenueOrders)}
                </td>
              </tr>
              <tr>
                <td>{t("finance.reportChannelPlay")}</td>
                <td className="num positive">
                  {formatMoney(summary.revenuePlaySessions ?? 0)}
                </td>
              </tr>
              <tr>
                <td>{t("finance.reportChannelBookings")}</td>
                <td className="num positive">
                  {formatMoney(summary.revenueReservations ?? 0)}
                </td>
              </tr>
              <tr>
                <td>{t("finance.reportChannelQuick")}</td>
                <td className="num positive">
                  {formatMoney(summary.revenueQuickSales ?? summary.revenueTransactions)}
                </td>
              </tr>
              <tr>
                <td><strong>{t("finance.reportChannelTotal")}</strong></td>
                <td className="num positive"><strong>{formatMoney(summary.revenue)}</strong></td>
              </tr>
              <tr>
                <td>{t("finance.reportChartLosses")}</td>
                <td className="num negative">{formatMoney(summary.losses)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ReportSection>

      {showDailyClose && data.dailyClose ? (
        <ReportSection
          title={t("finance.reportDailyClose", {
            day: formatDayKey(data.dailyClose.day),
          })}
          note={t("finance.reportDailyCloseHint")}
          keepTogether
        >
          <ReportMetricGrid
            items={[
              {
                label: t("finance.reportChannelMenu"),
                value: formatMoney(data.dailyClose.menuOrders),
              },
              {
                label: t("finance.reportChannelPlay"),
                value: formatMoney(data.dailyClose.playSessions),
              },
              {
                label: t("finance.reportChannelBookings"),
                value: formatMoney(data.dailyClose.reservations),
              },
              {
                label: t("finance.reportChannelQuick"),
                value: formatMoney(data.dailyClose.quickSales),
              },
              {
                label: t("finance.reportChannelTotal"),
                value: formatMoney(data.dailyClose.total),
              },
            ]}
          />
        </ReportSection>
      ) : null}

      {paymentBreakdown.length > 0 ? (
        <ReportSection
          title={t("finance.reportPaymentBreakdown", { period: periodLabel })}
          note={t("finance.reportPaymentHint")}
          keepTogether={paymentBreakdown.length <= 8}
        >
          <div className="gs-report-table-wrap">
            <table className="gs-report-table">
              <thead>
                <tr>
                  <th>{t("finance.reportMethod")}</th>
                  <th className="num">{t("finance.reportTxCount")}</th>
                  <th className="num">{t("finance.reportNetAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {paymentBreakdown.map((row) => (
                  <tr key={row.method}>
                    <td>{paymentMethodLabel(row.method)}</td>
                    <td className="num">{row.count}</td>
                    <td
                      className={cn(
                        "num",
                        coerceMoney(row.amount) < 0 ? "negative" : "positive",
                      )}
                    >
                      {formatMoney(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>
      ) : null}

      <ReportSection
        title={t("finance.reportRevenuePeriod", { period: periodLabel })}
        note={t("finance.reportChartRevenue")}
        newPage={data.days >= 30}
      >
        <div className="gs-report-table-wrap">
          <table className="gs-report-table">
            <thead>
              <tr>
                <th>{t("finance.reportRevenuePeriod", { period: "" })}</th>
                <th className="num">{t("finance.reportChannelMenu")}</th>
                <th className="num">{t("finance.reportChannelPlay")}</th>
                <th className="num">{t("finance.reportChannelBookings")}</th>
                <th className="num">{t("finance.reportChannelQuick")}</th>
                <th className="num">{t("finance.reportChannelTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {data.revenueByDay.map((row) => (
                <tr key={row.day}>
                  <td>{formatDayKey(row.day)}</td>
                  <td className="num">{formatMoney(row.menuOrders)}</td>
                  <td className="num">{formatMoney(row.playSessions)}</td>
                  <td className="num">{formatMoney(row.reservations)}</td>
                  <td className="num">{formatMoney(row.quickSales)}</td>
                  <td className="num positive">{formatMoney(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportSection>

      {data.lossesByDay.length > 0 ? (
        <ReportSection title={t("finance.reportChartLosses")}>
          <div className="gs-report-table-wrap">
            <table className="gs-report-table">
              <thead>
                <tr>
                  <th>{t("finance.reportChartRevenue")}</th>
                  <th className="num">{t("finance.reportChartLosses")}</th>
                </tr>
              </thead>
              <tbody>
                {data.lossesByDay.map((row) => (
                  <tr key={row.day}>
                    <td>{formatDayKey(row.day)}</td>
                    <td className="num negative">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>
      ) : null}

      {(data.audienceByDay ?? []).length > 0 ? (
        <ReportSection title={t("finance.reportInVenueGuests")}>
          <div className="gs-report-table-wrap">
            <table className="gs-report-table">
              <thead>
                <tr>
                  <th>{t("finance.reportChartGuests")}</th>
                  <th className="num">{t("finance.reportChannelMenu")}</th>
                  <th className="num">{t("finance.reportReservations")}</th>
                  <th className="num">{t("finance.reportTablesGames")}</th>
                  <th className="num">{t("finance.reportMarketingViews")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.audienceByDay ?? []).map((row) => (
                  <tr key={row.day}>
                    <td>{formatDayKey(row.day)}</td>
                    <td className="num">{row.menuCovers}</td>
                    <td className="num">{row.reservationGuests}</td>
                    <td className="num">{row.playPlayers}</td>
                    <td className="num">{row.marketingViews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>
      ) : null}

      <ReportSection
        title={t("finance.reportSalesByItem", { period: periodLabel })}
        note={t("finance.reportSalesByItemHint")}
        newPage={data.days >= 30 && items.length > 10}
      >
        {items.length === 0 ? (
          <div className="gs-report-empty">{t("finance.reportNoItemSales")}</div>
        ) : (
          <div className="gs-report-table-wrap">
            <table className="gs-report-table">
              <thead>
                <tr>
                  <th>{t("finance.reportColItem")}</th>
                  <th className="num">{t("finance.reportColQty")}</th>
                  <th className="num">{t("finance.reportColRevenue")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
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
    </PrintReportDocument>
  );
}

function SummaryAmount({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        strong
          ? "border-amber-400/30 bg-amber-500/10"
          : "border-white/10 bg-zinc-950/40",
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          strong ? "text-amber-100" : "text-emerald-300",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}
