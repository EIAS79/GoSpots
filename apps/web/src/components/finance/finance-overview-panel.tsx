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
import { coerceMoney } from "@/lib/money";
import { fetchDashboardOverview } from "@/lib/dashboard-client";
import { fetchFinanceAnalytics } from "@/lib/finance-client";
import { useLiveData } from "@/lib/use-live-data";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";

export function FinanceOverviewPanel() {
  const { formatMoney, t } = useVenueSettings();
  const financeReportsHref = useVenueHref("/finance?tab=reports");
  const financeTransactionsHref = useVenueHref("/finance?tab=transactions");
  const financeLossesHref = useVenueHref("/finance?tab=losses");
  const ordersHref = useVenueHref("/orders");
  const playHref = useVenueHref("/play-billing");
  const sessionsHref = useVenueHref("/sessions");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueWeek, setRevenueWeek] = useState(0);
  const [lossesWeek, setLossesWeek] = useState(0);
  const [menuRevenueWeek, setMenuRevenueWeek] = useState(0);
  const [playRevenueWeek, setPlayRevenueWeek] = useState(0);
  const [reservationRevenueWeek, setReservationRevenueWeek] = useState(0);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const overview = await fetchDashboardOverview();
        setRevenueToday(coerceMoney(overview.kpis.revenueToday));
        setRevenueWeek(coerceMoney(overview.kpis.revenueWeek));
        setLossesWeek(coerceMoney(overview.kpis.lossesWeek));
        try {
          const analytics = await fetchFinanceAnalytics(7);
          setMenuRevenueWeek(coerceMoney(analytics.summary.revenueMenuOrders));
          setPlayRevenueWeek(coerceMoney(analytics.summary.revenuePlaySessions));
          setReservationRevenueWeek(
            coerceMoney(analytics.summary.revenueReservations),
          );
        } catch (e) {
          setMenuRevenueWeek(0);
          setPlayRevenueWeek(0);
          setReservationRevenueWeek(0);
          setError(
            e instanceof Error
              ? e.message
              : t("finance.overviewBreakdownFailed"),
          );
        }
        return true;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : t("finance.overviewLoadFailed"),
        );
        return false;
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [t],
  );

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
      {error ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("finance.kpiRevenueToday")}
          value={formatMoney(revenueToday)}
          icon={TrendingUp}
          tone="emerald"
        />
        <KpiCard
          label={t("finance.kpiRevenue7d")}
          value={formatMoney(revenueWeek)}
          hint={t("finance.kpiProfitAfterLosses", {
            amount: formatMoney(profitWeek),
          })}
          icon={TrendingUp}
          tone="sky"
        />
        <KpiCard
          label={t("finance.kpiMenuSales7d")}
          value={formatMoney(menuRevenueWeek)}
          hint={t("finance.kpiMenuSalesHint")}
          icon={ShoppingCart}
          tone="amber"
        />
        <KpiCard
          label={t("finance.kpiLosses7d")}
          value={formatMoney(lossesWeek)}
          icon={TrendingDown}
          tone="rose"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RevenueSourceCard
          label={t("finance.sourcePlay")}
          amount={playRevenueWeek}
          formatMoney={formatMoney}
          href={playHref}
          hint={t("finance.sourcePlayHint")}
          suffix={t("finance.sourceSuffix7d")}
          icon={Gamepad2}
        />
        <RevenueSourceCard
          label={t("finance.sourceReservations")}
          amount={reservationRevenueWeek}
          formatMoney={formatMoney}
          href={sessionsHref}
          hint={t("finance.sourceReservationsHint")}
          suffix={t("finance.sourceSuffix7d")}
          icon={CalendarRange}
        />
        <RevenueSourceCard
          label={t("finance.sourceMenu")}
          amount={menuRevenueWeek}
          formatMoney={formatMoney}
          href={ordersHref}
          hint={t("finance.sourceMenuHint")}
          suffix={t("finance.sourceSuffix7d")}
          icon={ShoppingCart}
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          {t("finance.toolsHeading")}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <FinanceLinkCard
            href={financeTransactionsHref}
            label={t("finance.toolTransactions")}
            hint={t("finance.toolTransactionsHint")}
            icon={Wallet}
          />
          <FinanceLinkCard
            href={financeLossesHref}
            label={t("finance.toolLosses")}
            hint={t("finance.toolLossesHint")}
            icon={TrendingDown}
          />
          <FinanceLinkCard
            href={financeReportsHref}
            label={t("finance.toolReports")}
            hint={t("finance.toolReportsHint")}
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
  suffix,
  icon: Icon,
}: {
  label: string;
  amount: number;
  formatMoney: (n: import("@/lib/money").MoneyWire) => string;
  href: string;
  hint: string;
  suffix: string;
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
            {label} {suffix}
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
