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

const DAY_OPTS = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

export function FinanceReportsPanel({
  venueName = "Venue",
  liveRefresh = false,
}: {
  venueName?: string;
  liveRefresh?: boolean;
}) {
  const { formatMoney } = useVenueSettings();
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
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : "Failed to load analytics.");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [days]);

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
    return <p className="text-sm text-rose-300">{error ?? "No data"}</p>;
  }

  const { summary } = data;
  const periodLabel =
    days === 1 ? "Today" : `Last ${days} days`;
  const paymentBreakdown = data.paymentMethodBreakdown ?? [];
  const dailyClose = data.dailyClose;
  const showDailyClose =
    dailyClose != null && (days === 1 || dailyClose.total > 0);

  const paymentMethodLabel = (method: string) => {
    switch (method) {
      case "CASH":
        return "Cash";
      case "CARD":
        return "Card";
      case "ONLINE":
        return "Online";
      case "OTHER":
        return "Other";
      default:
        return method;
    }
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {DAY_OPTS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setDays(o.value)}
            className={
              days === o.value
                ? "rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-200"
                : "rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10"
            }
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          onClick={handlePrint}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
        >
          <Printer size={14} />
          Print
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
        >
          <Download size={14} />
          Download CSV
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Refresh
        </button>
      </div>

      <div ref={printRef} className="space-y-6 print:text-black">
        <div className="hidden print:block print:mb-4">
          <h1 className="text-xl font-bold">{venueName} — Finance report</h1>
          <p className="text-sm text-zinc-600">{periodLabel} · {new Date().toLocaleString()}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 print:grid-cols-3">
          <KpiCard
            label="Total revenue"
            value={formatMoney(summary.revenue)}
            hint={`Profit ${formatMoney(summary.profit)} · Losses ${formatMoney(summary.losses)}`}
            icon={TrendingUp}
          />
          <KpiCard
            label="Menu orders"
            value={formatMoney(summary.revenueMenuOrders ?? summary.revenueOrders)}
            icon={UtensilsCrossed}
          />
          <KpiCard
            label="Tables & games"
            value={formatMoney(summary.revenuePlaySessions ?? 0)}
            hint={`${summary.playSessionCount ?? 0} sessions`}
            icon={Gamepad2}
          />
          <KpiCard
            label="Reservations"
            value={formatMoney(summary.revenueReservations ?? 0)}
            icon={CalendarRange}
          />
          <KpiCard
            label="Marketing views"
            value={String(summary.marketingViews ?? 0)}
            hint={`${summary.menuViews ?? 0} menu · ${summary.reservationClicks ?? 0} book clicks`}
            icon={Eye}
          />
          <KpiCard
            label="Guests (in-venue)"
            value={String(
              (summary.menuCovers ?? summary.customerCount) +
                (summary.reservationGuests ?? 0) +
                (summary.playPlayers ?? 0),
            )}
            hint={`Menu ${summary.menuCovers ?? summary.customerCount} · Bookings ${summary.reservationGuests ?? 0} · Play ${summary.playPlayers ?? 0}`}
            icon={Users}
            tone="sky"
          />
        </div>

        {showDailyClose && dailyClose ? (
          <section className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="text-sm font-semibold text-white print:text-black">
              Daily close — {dailyClose.day}
            </h2>
            <p className="mt-1 text-xs text-zinc-500 print:text-zinc-600">
              Gross revenue by channel for the selected day (venue timezone).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                <p className="text-[10px] uppercase text-zinc-500">Menu</p>
                <p className="text-sm font-semibold text-emerald-300">
                  {formatMoney(dailyClose.menuOrders)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                <p className="text-[10px] uppercase text-zinc-500">Play</p>
                <p className="text-sm font-semibold text-sky-300">
                  {formatMoney(dailyClose.playSessions)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                <p className="text-[10px] uppercase text-zinc-500">Bookings</p>
                <p className="text-sm font-semibold text-amber-300">
                  {formatMoney(dailyClose.reservations)}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                <p className="text-[10px] uppercase text-zinc-500">Quick</p>
                <p className="text-sm font-semibold text-violet-300">
                  {formatMoney(dailyClose.quickSales)}
                </p>
              </div>
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                <p className="text-[10px] uppercase text-amber-200/80">Total</p>
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
              Payment method breakdown ({periodLabel})
            </h2>
            <p className="mt-1 text-xs text-zinc-500 print:text-zinc-600">
              Menu orders, quick sales, game billing, and walk-ins combined.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[20rem] text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-4">Method</th>
                    <th className="pb-2 pr-4 text-right">Transactions</th>
                    <th className="pb-2 text-right">Net amount</th>
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
                          row.amount < 0 ? "text-rose-300" : "text-emerald-300",
                        )}
                      >
                        {row.amount < 0 ? "−" : ""}
                        {formatMoney(Math.abs(row.amount))}
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
              Revenue ({periodLabel})
            </h2>
            <VenueLineChart
              data={data.revenueByDay.map((d) => ({
                label: d.day,
                value: Math.round(d.total * 100) / 100,
              }))}
              label="Revenue"
            />
          </section>
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="text-sm font-semibold text-white print:text-black">
              Revenue by source
            </h2>
            {data.revenueByDay.length > 1 ? (
              <VenueMultiBarChart
                labels={data.revenueByDay.map((d) => d.day)}
                datasets={[
                  {
                    label: "Menu",
                    data: data.revenueByDay.map((d) => d.menuOrders),
                    color: "rgba(52, 211, 153, 0.85)",
                  },
                  {
                    label: "Play",
                    data: data.revenueByDay.map((d) => d.playSessions),
                    color: "rgba(56, 189, 248, 0.85)",
                  },
                  {
                    label: "Bookings",
                    data: data.revenueByDay.map((d) => d.reservations),
                    color: "rgba(251, 191, 36, 0.85)",
                  },
                  {
                    label: "Quick",
                    data: data.revenueByDay.map((d) => d.quickSales),
                    color: "rgba(167, 139, 250, 0.85)",
                  },
                ]}
              />
            ) : (
              <VenueDoughnutChart
                data={[
                  {
                    label: "Menu",
                    value: summary.revenueMenuOrders ?? summary.revenueOrders,
                    color: "rgba(52, 211, 153, 0.9)",
                  },
                  {
                    label: "Play",
                    value: summary.revenuePlaySessions ?? 0,
                    color: "rgba(56, 189, 248, 0.9)",
                  },
                  {
                    label: "Bookings",
                    value: summary.revenueReservations ?? 0,
                    color: "rgba(251, 191, 36, 0.9)",
                  },
                  {
                    label: "Quick",
                    value:
                      summary.revenueQuickSales ?? summary.revenueTransactions,
                    color: "rgba(167, 139, 250, 0.9)",
                  },
                ]}
              />
            )}
          </section>
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="text-sm font-semibold text-white print:text-black">
              In-venue guests
            </h2>
            <VenueBarChart
              data={(data.audienceByDay ?? []).map((d) => ({
                label: d.day,
                value: d.menuCovers + d.reservationGuests + d.playPlayers,
              }))}
              label="Guests"
              color="rgba(56, 189, 248, 0.85)"
            />
          </section>
          <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white print:text-black">
              <TrendingDown size={14} className="text-rose-400" />
              Losses
            </h2>
            <VenueBarChart
              data={data.lossesByDay.map((d) => ({
                label: d.day,
                value: Math.round(d.amount * 100) / 100,
              }))}
              label="Losses"
              color="rgba(244, 63, 94, 0.75)"
            />
          </section>
        </div>

        <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
          <h2 className="text-sm font-semibold text-white print:text-black">
            Sales by item ({periodLabel})
          </h2>
          <p className="mt-1 text-xs text-zinc-500 print:text-zinc-600">
            Menu quick sales and completed kitchen orders combined.
          </p>
          {salesByItem.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No item sales in this period.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-4">Item</th>
                    <th className="pb-2 pr-4 text-right">Qty</th>
                    <th className="pb-2 text-right">Revenue</th>
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
