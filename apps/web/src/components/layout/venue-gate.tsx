"use client";

import { Loader2 } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import {
  dashboardBase,
  dashboardHref,
  hasMembershipForVenuePath,
  toPublicVenuePath,
  venuePathHasSecret,
} from "@/lib/venue-dashboard";
import { translate } from "@/lib/i18n";
import { offlineLiteEnabledFor } from "@/lib/offline-entitlement";
import {
  readOfflineShopSnapshot,
  saveOfflineShopSnapshot,
} from "@/lib/offline-shell-snapshot";
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
    setError(false);
    void api<{ shop: ShopSettings }>(
      `/auth/venue/${encodeURIComponent(bindPath)}/session`,
      { method: "POST" },
    )
      .then((res) => {
        if (!cancelled) {
          saveOfflineShopSnapshot(state.user.id, bindPath, res.shop);
          setApiVenuePath(bindPath);
          setShopInfo(res.shop);
          setVerified(true);
        }
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        const membership = state.user.memberships.find(
          (row) => row.shop.slug === bindPath,
        );
        const canResumeOffline =
          requestError instanceof ApiError &&
          requestError.status === 0 &&
          membership != null &&
          offlineLiteEnabledFor({
            userId: state.user.id,
            shopId: membership.shop.id,
          });
        const cached = canResumeOffline
          ? readOfflineShopSnapshot(state.user.id, bindPath)
          : null;
        if (cached) {
          setApiVenuePath(bindPath);
          setShopInfo(cached);
          setVerified(true);
          setError(false);
          return;
        }
        setError(true);
        void reload();
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
