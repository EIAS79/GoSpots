"use client";

import {
  CalendarRange,
  Eye,
  LayoutGrid,
  LineChart,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { VenueBarChart, VenueLineChart } from "@/components/charts/venue-chart";
import { cn } from "@/lib/cn";
import type { DashboardOverview } from "@/lib/dashboard-client";
import { formatDate } from "@/lib/format";
import { coerceMoney } from "@/lib/money";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

type OverviewTab = "summary" | "finance" | "orders" | "audience" | "activity";
type OverviewT = (key: string, vars?: Record<string, string | number>) => string;

const TABS: { id: OverviewTab; tKey: string; icon: typeof LayoutGrid }[] = [
  { id: "summary", tKey: "tabSummary", icon: LayoutGrid },
  { id: "finance", tKey: "tabFinance", icon: TrendingUp },
  { id: "orders", tKey: "tabOrders", icon: UtensilsCrossed },
  { id: "audience", tKey: "tabAudience", icon: Eye },
  { id: "activity", tKey: "tabActivity", icon: CalendarRange },
];

export function OverviewDashboard({
  data,
  formatMoney,
  locale,
  links,
}: {
  data: DashboardOverview;
  formatMoney: (n: import("@/lib/money").MoneyWire) => string;
  locale: string;
  links: {
    reports: string;
    orders: string;
    menu: string;
    sessions: string;
    audit: string;
    losses: string;
    subscription: string;
  };
}) {
  const [tab, setTab] = useState<OverviewTab>("summary");
  const { kpis, charts, topMenuItems, recentReservations, recentAudit } = data;
  const vs = useVenueSettingsOptional();
  const t: OverviewT = vs?.t ?? ((key) => key);
  const venueTimeZone = vs?.shop?.timezone ?? undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-950/80 p-1 ring-1 ring-white/10">
          {TABS.map(({ id, tKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-emerald-500/20 text-emerald-100 shadow-sm"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
              )}
            >
              <Icon size={14} className="shrink-0 opacity-80" />
              {t(`dashOverview.${tKey}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href={links.subscription}
            className="inline-flex min-h-9 items-center rounded-lg border border-white/10 px-2.5 py-1.5 text-zinc-400 hover:bg-white/5"
          >
            {t("dashOverview.planLink")}
          </Link>
          <Link
            href={links.reports}
            className="inline-flex min-h-9 items-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-200"
          >
            {t("dashOverview.reportsLink")}
          </Link>
        </div>
      </div>

      {tab === "summary" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("dashOverview.revenueToday")}
              value={formatMoney(kpis.revenueToday)}
              icon={TrendingUp}
            />
            <KpiCard
              label={t("dashOverview.profitWeek")}
              value={formatMoney(kpis.profitWeek)}
              hint={t("dashOverview.salesHint", {
                amount: formatMoney(kpis.revenueWeek),
              })}
              icon={TrendingUp}
              tone="amber"
            />
            <KpiCard
              label={t("dashOverview.ordersToday")}
              value={String(kpis.ordersToday)}
              icon={UtensilsCrossed}
            />
            <KpiCard
              label={t("dashOverview.guestsWeek")}
              value={String(kpis.customersWeek)}
              icon={Users}
              tone="sky"
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <MiniChartCard
              title={t("dashOverview.revenueTrendTitle")}
              subtitle={t("dashOverview.last7Days")}
              href={links.reports}
              linkLabel={t("dashOverview.reportsLink")}
            >
              <VenueLineChart
                data={(charts.revenueByDay ?? []).map((d) => ({
                  label: d.day,
                  value: Math.round(coerceMoney(d.total) * 100) / 100,
                }))}
                label={t("dashOverview.revenueSeriesLabel")}
              />
            </MiniChartCard>
            <MiniChartCard
              title={t("dashOverview.recentReservationsTitle")}
              subtitle={t("dashOverview.latestBookings")}
              href={links.sessions}
              linkLabel={t("dashOverview.allReservationsLink")}
            >
              <ul className="divide-y divide-white/5">
                {recentReservations.slice(0, 4).map((r) => (
                  <li
                    key={r.id}
                    className="flex justify-between gap-2 py-2 text-xs"
                  >
                    <span className="truncate text-zinc-300">{r.guestName}</span>
                    <span className="shrink-0 text-amber-200/90">{r.status}</span>
                  </li>
                ))}
              </ul>
            </MiniChartCard>
          </div>
        </div>
      ) : null}

      {tab === "finance" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label={t("dashOverview.revenueWeek")}
              value={formatMoney(kpis.revenueWeek)}
              icon={LineChart}
            />
            <KpiCard
              label={t("dashOverview.profitWeek")}
              value={formatMoney(kpis.profitWeek)}
              hint={t("dashOverview.lossesHint", {
                amount: formatMoney(kpis.lossesWeek),
              })}
              icon={TrendingUp}
              tone="amber"
            />
            <KpiCard
              label={t("dashOverview.revenueToday")}
              value={formatMoney(kpis.revenueToday)}
              icon={TrendingUp}
            />
          </div>
          <MiniChartCard
            title={t("dashOverview.revenueBreakdownTitle")}
            subtitle={t("dashOverview.revenueBreakdownSubtitle")}
            href={links.reports}
            linkLabel={t("dashOverview.fullFinanceReportsLink")}
            className="max-w-3xl"
          >
            <VenueLineChart
              data={(charts.revenueByDay ?? []).map((d) => ({
                label: d.day,
                value: Math.round(coerceMoney(d.total) * 100) / 100,
              }))}
              label={t("dashOverview.revenueSeriesLabel")}
            />
          </MiniChartCard>
          {coerceMoney(kpis.lossesWeek) > 0 ? (
            <p className="flex items-center gap-2 text-xs text-rose-300/90">
              <TrendingDown size={14} />
              {t("dashOverview.lossesWeekMessage", {
                amount: formatMoney(kpis.lossesWeek),
              })}{" "}
              <Link
                href={links.losses}
                className="inline-flex min-h-9 items-center underline"
              >
                {t("dashOverview.reviewLossesLink")}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label={t("dashOverview.ordersToday")}
              value={String(kpis.ordersToday)}
              hint={t("dashOverview.ordersHandedOffHint", {
                count: kpis.completedOrdersWeek,
              })}
              icon={UtensilsCrossed}
            />
            <KpiCard
              label={t("dashOverview.guestsWeek")}
              value={String(kpis.customersWeek)}
              icon={Users}
              tone="sky"
            />
            <KpiCard
              label={t("dashOverview.revenueToday")}
              value={formatMoney(kpis.revenueToday)}
              icon={TrendingUp}
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <MiniChartCard
              title={t("dashOverview.guestsPerDayTitle")}
              subtitle={t("dashOverview.guestsPerDaySubtitle")}
              href={links.orders}
              linkLabel={t("dashOverview.menuOrdersLink")}
            >
              <VenueBarChart
                data={(charts.ordersByDay ?? []).map((d) => ({
                  label: d.day,
                  value: d.customers,
                }))}
                label={t("dashOverview.guestsSeriesLabel")}
                color="rgba(56, 189, 248, 0.85)"
              />
            </MiniChartCard>
            <MiniChartCard
              title={t("dashOverview.topSellersTitle")}
              href={links.menu}
              linkLabel={t("dashOverview.manageMenuLink")}
            >
              <ul className="space-y-2">
                {topMenuItems.length === 0 ? (
                  <li className="text-xs text-zinc-500">
                    {t("dashOverview.noSalesYet")}
                  </li>
                ) : (
                  topMenuItems.map((item) => (
                    <li
                      key={item.menuItemId ?? item.name}
                      className="flex justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-zinc-300">{item.name}</span>
                      <span className="shrink-0 text-emerald-300">
                        {item.quantity} · {formatMoney(item.revenue)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </MiniChartCard>
          </div>
        </div>
      ) : null}

      {tab === "audience" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label={t("dashOverview.venueViews")}
              value={String(kpis.venueViews7d)}
              icon={Eye}
            />
            <KpiCard
              label={t("dashOverview.menuViews")}
              value={String(kpis.menuViews7d)}
              icon={UtensilsCrossed}
              tone="sky"
            />
            <KpiCard
              label={t("dashOverview.bookClicks")}
              value={String(kpis.reservationClicks7d)}
              icon={CalendarRange}
              tone="amber"
            />
          </div>
          <MiniChartCard
            title={t("dashOverview.profileViewsTitle")}
            subtitle={t("dashOverview.marketingTraffic")}
            className="max-w-2xl"
          >
            <VenueBarChart
              data={charts.venueViewsByDay.map((d) => ({
                label: d.day,
                value: d.count,
              }))}
              label={t("dashOverview.viewsSeriesLabel")}
              color="rgba(167, 139, 250, 0.85)"
            />
          </MiniChartCard>
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <MiniChartCard
            title={t("dashOverview.reservationsTitle")}
            subtitle={t("dashOverview.reservationsSubtitle", {
              today: kpis.reservationsToday,
              pending: kpis.reservationsPending,
            })}
            href={links.sessions}
            linkLabel={t("dashOverview.reservationsLink")}
          >
            <ul className="divide-y divide-white/5">
              {recentReservations.map((r) => (
                <li
                  key={r.id}
                  className="flex justify-between gap-2 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-200">
                      {r.guestName}
                    </p>
                    <p className="truncate text-zinc-500">
                      {r.resource ?? t("dashOverview.noTable")} ·{" "}
                      {formatDate(r.startsAt, locale, venueTimeZone)}
                    </p>
                  </div>
                  <span className="shrink-0 text-amber-200">{r.status}</span>
                </li>
              ))}
            </ul>
          </MiniChartCard>
          <MiniChartCard
            title={t("dashOverview.auditLogTitle")}
            href={links.audit}
            linkLabel={t("dashOverview.fullLogLink")}
          >
            <ul className="space-y-2">
              {recentAudit.map((a) => (
                <li key={a.id} className="text-xs leading-relaxed">
                  <span className="text-zinc-500">
                    {formatDate(a.createdAt, locale)}
                  </span>
                  <span className="ml-1.5 text-zinc-300">{a.action}</span>
                </li>
              ))}
            </ul>
          </MiniChartCard>
        </div>
      ) : null}
    </div>
  );
}

function MiniChartCard({
  title,
  subtitle,
  href,
  linkLabel,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-white/10 bg-zinc-900/40 p-4",
        className,
      )}
    >
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="mt-3 inline-flex min-h-9 items-center text-[11px] text-emerald-400 hover:underline"
        >
          {linkLabel} →
        </Link>
      ) : null}
    </section>
  );
}
