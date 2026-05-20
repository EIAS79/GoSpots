"use client";

import { Download, Loader2, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  Eye,
  Gamepad2,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import {
  fetchFinanceAnalytics,
  type FinanceAnalytics,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      setData(await fetchFinanceAnalytics(days));
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 print:grid-cols-3">
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
      </div>
    </div>
  );
}
