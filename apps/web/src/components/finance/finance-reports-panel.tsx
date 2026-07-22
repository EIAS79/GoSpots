"use client";

import { Download, Loader2, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useLiveData } from "@/lib/use-live-data";
import {
  VenueBarChart,
  VenueDoughnutChart,
  VenueLineChart,
  VenueMultiBarChart,
} from "@/components/charts/venue-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { coerceMoney } from "@/lib/money";
import {
  CalendarRange,
  CreditCard,
  Eye,
  Gamepad2,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import {
  fetchFinanceAnalytics,
  fetchSalesByItem,
  type FinanceAnalytics,
  type SalesByItem,
} from "@/lib/finance-client";
import {
  downloadTextFile,
  financeReportToCsv,
} from "@/lib/export-report";
import { useVenueSettings } from "@/lib/venue-settings-context";
import {
  formatVenueDayKey,
} from "@/lib/venue-timezone";

const DAY_OPTS = [1, 7, 30, 90] as const;

export function FinanceReportsPanel({
  venueName = "Venue",
  liveRefresh = false,
}: {
  venueName?: string;
  liveRefresh?: boolean;
}) {
  const { formatMoney, t, locale } = useVenueSettings();
  const formatDayKey = (dayKey: string) => formatVenueDayKey(dayKey, locale);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FinanceAnalytics | null>(null);
  const [salesByItem, setSalesByItem] = useState<SalesByItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
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
  }, [days, t]);

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

  function handlePrint() {
    window.print();
  }

  function handleDownload() {
    if (!data) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `${venueName.replace(/\s+/g, "-")}-report-${days}d-${date}.csv`,
      financeReportToCsv(data, venueName),
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
  const periodLabel =
    days === 1
      ? t("finance.reportToday")
      : t("finance.reportLastDays", { days });
  const paymentBreakdown = data.paymentMethodBreakdown ?? [];
  const dailyClose = data.dailyClose;
  const showDailyClose =
    dailyClose != null && (days === 1 || coerceMoney(dailyClose.total) > 0);

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

  const paymentMethodLabel = (method: string) => {
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
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
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
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
        >
          <Printer size={14} />
          {t("finance.reportPrint")}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
        >
          <Download size={14} />
          {t("finance.reportDownloadCsv")}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {t("finance.reportRefresh")}
        </button>
      </div>

      <div ref={printRef} className="space-y-6 print:text-black">
        <div className="hidden print:block print:mb-4">
          <h1 className="text-xl font-bold">
            {t("finance.reportTitle", { venue: venueName })}
          </h1>
          <p className="text-sm text-zinc-600">{periodLabel} · {new Date().toLocaleString()}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 print:grid-cols-3">
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
          <section className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="text-sm font-semibold text-white print:text-black">
              {t("finance.reportDailyClose", { day: formatDayKey(dailyClose.day) })}
            </h2>
            <p className="mt-1 text-xs text-zinc-500 print:text-zinc-600">
              {t("finance.reportDailyCloseHint")}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                <p className="text-[10px] uppercase text-zinc-500">
                  {t("finance.reportChannelMenu")}
                </p>
                <p className="text-sm font-semibold text-emerald-300">
                  {formatMoney(dailyClose.menuOrders)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                <p className="text-[10px] uppercase text-zinc-500">
                  {t("finance.reportChannelPlay")}
                </p>
                <p className="text-sm font-semibold text-sky-300">
                  {formatMoney(dailyClose.playSessions)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                <p className="text-[10px] uppercase text-zinc-500">
                  {t("finance.reportChannelBookings")}
                </p>
                <p className="text-sm font-semibold text-amber-300">
                  {formatMoney(dailyClose.reservations)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                <p className="text-[10px] uppercase text-zinc-500">
                  {t("finance.reportChannelQuick")}
                </p>
                <p className="text-sm font-semibold text-violet-300">
                  {formatMoney(dailyClose.quickSales)}
                </p>
              </div>
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                <p className="text-[10px] uppercase text-amber-200/80">
                  {t("finance.reportChannelTotal")}
                </p>
                <p className="text-sm font-bold text-amber-100">
                  {formatMoney(dailyClose.total)}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {paymentBreakdown.length > 0 ? (
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white print:text-black">
              <CreditCard size={14} className="text-sky-400" />
              {t("finance.reportPaymentBreakdown", { period: periodLabel })}
            </h2>
            <p className="mt-1 text-xs text-zinc-500 print:text-zinc-600">
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
                          coerceMoney(row.amount) < 0 ? "text-rose-300" : "text-emerald-300",
                        )}
                      >
                        {coerceMoney(row.amount) < 0 ? "−" : ""}
                        {formatMoney(Math.abs(coerceMoney(row.amount)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-1">
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="text-sm font-semibold text-white print:text-black">
              {t("finance.reportRevenuePeriod", { period: periodLabel })}
            </h2>
            <VenueLineChart
              data={data.revenueByDay.map((d) => ({
                label: formatDayKey(d.day),
                value: Math.round(coerceMoney(d.total) * 100) / 100,
              }))}
              label={t("finance.reportChartRevenue")}
            />
          </section>
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="text-sm font-semibold text-white print:text-black">
              {t("finance.reportRevenueBySource")}
            </h2>
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
          </section>
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="text-sm font-semibold text-white print:text-black">
              {t("finance.reportInVenueGuests")}
            </h2>
            <VenueBarChart
              data={(data.audienceByDay ?? []).map((d) => ({
                label: d.day,
                value: d.menuCovers + d.reservationGuests + d.playPlayers,
              }))}
              label={t("finance.reportChartGuests")}
              color="rgba(56, 189, 248, 0.85)"
            />
          </section>
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white print:text-black">
              <TrendingDown size={14} className="text-rose-400" />
              {t("finance.reportChartLosses")}
            </h2>
            <VenueBarChart
              data={data.lossesByDay.map((d) => ({
                label: d.day,
                value: Math.round(coerceMoney(d.amount) * 100) / 100,
              }))}
              label={t("finance.reportChartLosses")}
              color="rgba(244, 63, 94, 0.75)"
            />
          </section>
        </div>

        <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
          <h2 className="text-sm font-semibold text-white print:text-black">
            {t("finance.reportSalesByItem", { period: periodLabel })}
          </h2>
          <p className="mt-1 text-xs text-zinc-500 print:text-zinc-600">
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
    </div>
  );
}
