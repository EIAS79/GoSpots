"use client";

import { Loader2 } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import {
  dashboardBase,
  dashboardHref,
  hasMembershipForVenuePath,
  toPublicVenuePath,
  venuePathHasSecret,
} from "@/lib/venue-dashboard";
import { translate } from "@/lib/i18n";
import type { ShopSettings } from "@/lib/shop-settings-client";
import { VenuePathProvider } from "@/lib/venue-context";
import {
  useVenueSettingsOptional,
  VenueSettingsProvider,
} from "@/lib/venue-settings-context";
import { useAuth } from "@/lib/use-auth";

export function VenueGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const venuePath = params.venuePath as string;
  const { state, reload } = useAuth();
  const settings = useVenueSettingsOptional();
  const t = (key: string, vars?: Record<string, string | number>) =>
    settings?.t(key, vars) ?? translate("en", key, vars);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopSettings | null>(null);
  const [apiVenuePath, setApiVenuePath] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dashboard-route");
    return () => {
      document.documentElement.classList.remove("dashboard-route");
    };
  }, []);

  useEffect(() => {
    if (state.status === "loading") return;
    if (state.status === "guest") {
      router.replace(
        `/login?next=${encodeURIComponent(dashboardBase(venuePath))}`,
      );
      return;
    }

    if (!hasMembershipForVenuePath(state.user.memberships, venuePath)) {
      setError(true);
      return;
    }

    const bindPath = toPublicVenuePath(venuePath);

    // Drop dashboard key from the address bar after we can resolve it from membership.
    // Middleware usually redirects first; this covers client navigations that still carry a secret segment.
    if (venuePathHasSecret(venuePath)) {
      const publicPath = bindPath;
      const prefix = `/dashboard/${venuePath}`;
      const suffix = pathname.startsWith(prefix)
        ? pathname.slice(prefix.length)
        : "";
      router.replace(dashboardHref(publicPath, suffix));
      return;
    }

    let cancelled = false;
    setVerified(false);
    void api<{ shop: ShopSettings }>(
      `/auth/venue/${encodeURIComponent(bindPath)}/session`,
      { method: "POST" },
    )
      .then((res) => {
        if (!cancelled) {
          setApiVenuePath(bindPath);
          setShopInfo(res.shop);
          setVerified(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          void reload();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state, venuePath, pathname, router, reload]);

  if (state.status === "loading" || state.status === "guest") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm text-rose-300">{t("venueGate.noAccess")}</p>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="text-sm text-emerald-400 hover:underline"
        >
          {t("venueGate.signInOther")}
        </button>
      </div>
    );
  }

  if (!verified || !apiVenuePath) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <VenuePathProvider
      venuePath={toPublicVenuePath(venuePath)}
      apiVenuePath={apiVenuePath}
    >
      <VenueSettingsProvider initial={shopInfo ?? undefined}>
        <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>
      </VenueSettingsProvider>
    </VenuePathProvider>
  );
}
