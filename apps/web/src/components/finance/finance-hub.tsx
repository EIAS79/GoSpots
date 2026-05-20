"use client";

import {
  ChartColumn,
  LayoutGrid,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { FinanceOverviewPanel } from "@/components/finance/finance-overview-panel";
import { FinanceReportsPanel } from "@/components/finance/finance-reports-panel";
import { FinanceTransactionsPanel } from "@/components/finance/finance-transactions-panel";
import { LossesPanel } from "@/components/finance/losses-panel";
import { fetchDashboardOverview } from "@/lib/dashboard-client";
import { useVenueHref } from "@/lib/venue-context";

/** Finance = ledger & reporting only (no kitchen queue or floor bookings). */
export type FinanceHubTab =
  | "overview"
  | "transactions"
  | "losses"
  | "reports";

const TABS: {
  id: FinanceHubTab;
  label: string;
  icon: typeof Wallet;
}[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "transactions", label: "Transactions", icon: Wallet },
  { id: "losses", label: "Losses", icon: TrendingDown },
  { id: "reports", label: "Reports", icon: ChartColumn },
];

const LEGACY_TAB_REDIRECT: Record<string, "/orders" | "/play-billing"> = {
  orders: "/orders",
  play: "/play-billing",
};

function parseTab(value: string | null, fallback: FinanceHubTab): FinanceHubTab {
  if (TABS.some((t) => t.id === value)) return value as FinanceHubTab;
  return fallback;
}

export function FinanceHub({
  initialTab = "overview",
  canWrite,
}: {
  initialTab?: FinanceHubTab | "orders" | "play";
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ordersHref = useVenueHref("/orders");
  const playHref = useVenueHref("/play-billing");
  const rawTab = searchParams.get("tab") ?? (initialTab !== "overview" ? initialTab : null);
  const tab = parseTab(
    LEGACY_TAB_REDIRECT[rawTab ?? ""] ? null : rawTab,
    parseTab(
      typeof initialTab === "string" && !LEGACY_TAB_REDIRECT[initialTab]
        ? initialTab
        : null,
      "overview",
    ),
  );
  const [venueName, setVenueName] = useState("Venue");

  useEffect(() => {
    const legacy = rawTab && LEGACY_TAB_REDIRECT[rawTab];
    if (legacy === "/orders") {
      router.replace(ordersHref);
      return;
    }
    if (legacy === "/play-billing") {
      router.replace(playHref);
      return;
    }
  }, [rawTab, router, ordersHref, playHref]);

  useEffect(() => {
    void fetchDashboardOverview()
      .then((d) => setVenueName(d.shop.name ?? "Venue"))
      .catch(() => undefined);
  }, []);

  const setTab = useCallback(
    (next: FinanceHubTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const panel = useMemo(() => {
    switch (tab) {
      case "transactions":
        return <FinanceTransactionsPanel canWrite={canWrite} />;
      case "losses":
        return <LossesPanel canWrite={canWrite} />;
      case "reports":
        return <FinanceReportsPanel venueName={venueName} liveRefresh />;
      default:
        return <FinanceOverviewPanel />;
    }
  }, [tab, canWrite, venueName]);

  if (rawTab && LEGACY_TAB_REDIRECT[rawTab]) {
    return (
      <div className="flex justify-center py-12 text-sm text-zinc-500">
        Redirecting…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-white/10 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500">
        Track revenue, record quick sales and losses, and run reports. Kitchen
        orders live under{" "}
        <span className="text-zinc-400">Operations → Menu orders</span>;
        game charges under{" "}
        <span className="text-zinc-400">Operations → Play billing</span>;
        reservations under{" "}
        <span className="text-zinc-400">Reservations</span>.
      </p>

      <nav
        className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-zinc-950/90 p-1 backdrop-blur-md scrollbar-none"
        aria-label="Finance sections"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                active
                  ? "bg-emerald-500/15 text-emerald-100"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
              )}
            >
              <Icon size={14} className={active ? "text-emerald-400" : ""} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div key={tab}>{panel}</div>
    </div>
  );
}
