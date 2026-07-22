"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { TenantPage } from "@/components/layout/tenant-page";
import {
  fetchDashboardOverview,
  type DashboardOverview,
} from "@/lib/dashboard-client";
import { useDashboardGuide } from "@/lib/use-dashboard-guide";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";

export default function VenueOverviewPage() {
  const guide = useDashboardGuide("overview");
  const { formatMoney, locale, t } = useVenueSettings();
  const links = {
    reports: useVenueHref("/finance?tab=reports"),
    orders: useVenueHref("/orders"),
    finance: useVenueHref("/finance"),
    menu: useVenueHref("/menu"),
    sessions: useVenueHref("/sessions"),
    audit: useVenueHref("/audit"),
    losses: useVenueHref("/finance?tab=losses"),
    subscription: useVenueHref("/subscription"),
  };

  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardOverview()
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : t("dashOverview.loadError"),
        ),
      )
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <TenantPage
        title={t("dashOverview.title")}
        className="flex items-center justify-center"
      >
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </TenantPage>
    );
  }

  if (error || !data) {
    return (
      <TenantPage title={t("dashOverview.title")}>
        <p className="text-sm text-rose-300">
          {error ?? t("dashOverview.loadErrorGeneric")}
        </p>
      </TenantPage>
    );
  }

  return (
    <TenantPage
      title={guide.title}
      description={`${data.shop.name ?? "Your venue"} — ${guide.description}`}
      capabilities={guide.capabilities}
    >
      <OverviewDashboard
        data={data}
        formatMoney={formatMoney}
        locale={locale}
        links={links}
      />
    </TenantPage>
  );
}
