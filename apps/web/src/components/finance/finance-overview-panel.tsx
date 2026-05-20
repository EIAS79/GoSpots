"use client";

import {
  CalendarRange,
  ChartColumn,
  Gamepad2,
  Loader2,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { fetchDashboardOverview } from "@/lib/dashboard-client";
import { fetchFinanceAnalytics } from "@/lib/finance-client";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";

export function FinanceOverviewPanel() {
  const { formatMoney } = useVenueSettings();
  const financeReportsHref = useVenueHref("/finance?tab=reports");
  const financeTransactionsHref = useVenueHref("/finance?tab=transactions");
  const financeLossesHref = useVenueHref("/finance?tab=losses");
  const ordersHref = useVenueHref("/orders");
  const playHref = useVenueHref("/play-billing");
  const sessionsHref = useVenueHref("/sessions");

  const [loading, setLoading] = useState(true);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueWeek, setRevenueWeek] = useState(0);
  const [lossesWeek, setLossesWeek] = useState(0);
  const [menuRevenueWeek, setMenuRevenueWeek] = useState(0);
  const [playRevenueWeek, setPlayRevenueWeek] = useState(0);
  const [reservationRevenueWeek, setReservationRevenueWeek] = useState(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [overview, analytics] = await Promise.all([
        fetchDashboardOverview(),
        fetchFinanceAnalytics(7),
      ]);
      setRevenueToday(overview.kpis.revenueToday);
      setRevenueWeek(overview.kpis.revenueWeek);
      setLossesWeek(overview.kpis.lossesWeek);
      setMenuRevenueWeek(analytics.summary.revenueMenuOrders);
      setPlayRevenueWeek(analytics.summary.revenuePlaySessions);
      setReservationRevenueWeek(analytics.summary.revenueReservations);
    } catch {
      /* keep last values */
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveData(() => load({ silent: true }), [], {
    intervalMs: 30_000,
    refreshOnSections: ["finance", "shop_orders", "operations"],
  });

  const profitWeek = revenueWeek - lossesWeek;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-7 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue today"
          value={formatMoney(revenueToday)}
          icon={TrendingUp}
          tone="emerald"
        />
        <KpiCard
          label="Revenue (7 days)"
          value={formatMoney(revenueWeek)}
          hint={`Profit ${formatMoney(profitWeek)} after losses`}
          icon={TrendingUp}
          tone="sky"
        />
        <KpiCard
          label="Menu sales (7d)"
          value={formatMoney(menuRevenueWeek)}
          hint="From completed kitchen tickets"
          icon={ShoppingCart}
          tone="amber"
        />
        <KpiCard
          label="Losses (7 days)"
          value={formatMoney(lossesWeek)}
          icon={TrendingDown}
          tone="rose"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <RevenueSourceCard
          label="Play & tables"
          amount={playRevenueWeek}
          formatMoney={formatMoney}
          href={playHref}
          hint="Paid game reservations (Operations → Play billing)"
          icon={Gamepad2}
        />
        <RevenueSourceCard
          label="Reservations"
          amount={reservationRevenueWeek}
          formatMoney={formatMoney}
          href={sessionsHref}
          hint="Billed bookings on Reservations"
          icon={CalendarRange}
        />
        <RevenueSourceCard
          label="Menu orders"
          amount={menuRevenueWeek}
          formatMoney={formatMoney}
          href={ordersHref}
          hint="Completed tickets on Operations → Menu orders"
          icon={ShoppingCart}
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Finance tools
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <FinanceLinkCard
            href={financeTransactionsHref}
            label="Transactions"
            hint="Quick counter sales ledger"
            icon={Wallet}
          />
          <FinanceLinkCard
            href={financeLossesHref}
            label="Losses"
            hint="Spoilage, waste, write-offs"
            icon={TrendingDown}
          />
          <FinanceLinkCard
            href={financeReportsHref}
            label="Reports"
            hint="Charts, print, CSV export"
            icon={ChartColumn}
          />
        </div>
      </div>
    </div>
  );
}

function RevenueSourceCard({
  label,
  amount,
  formatMoney,
  href,
  hint,
  icon: Icon,
}: {
  label: string;
  amount: number;
  formatMoney: (n: number) => string;
  href: string;
  hint: string;
  icon: typeof ShoppingCart;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 transition hover:border-emerald-400/25"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            {label} · 7d
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {formatMoney(amount)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>
        </div>
        <Icon size={18} className="shrink-0 text-zinc-500" />
      </div>
    </Link>
  );
}

function FinanceLinkCard({
  href,
  label,
  hint,
  icon: Icon,
}: {
  href: string;
  label: string;
  hint: string;
  icon: typeof Wallet;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3 transition hover:border-emerald-400/25 hover:bg-zinc-900/80"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-emerald-300">
        <Icon size={18} />
      </span>
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-0.5 block text-[11px] text-zinc-500">{hint}</span>
      </span>
    </Link>
  );
}
