"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import {
  dashboardBase,
  hasMembershipForVenuePath,
} from "@/lib/venue-dashboard";
import type { ShopSettings } from "@/lib/shop-settings-client";
import { VenuePathProvider } from "@/lib/venue-context";
import { VenueSettingsProvider } from "@/lib/venue-settings-context";
import { useAuth } from "@/lib/use-auth";

export function VenueGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const venuePath = params.venuePath as string;
  const { state, reload } = useAuth();
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopSettings | null>(null);

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

    let cancelled = false;
    void api<{ shop: ShopSettings }>(
      `/auth/venue/${encodeURIComponent(venuePath)}/session`,
      { method: "POST" },
    )
      .then((res) => {
        if (!cancelled) {
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
  }, [state, venuePath, router, reload]);

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
        <p className="text-sm text-rose-300">You don&apos;t have access to this venue dashboard.</p>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="text-sm text-emerald-400 hover:underline"
        >
          Sign in with another account
        </button>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <VenuePathProvider venuePath={venuePath}>
      <VenueSettingsProvider initial={shopInfo ?? undefined}>
        <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>
      </VenueSettingsProvider>
    </VenuePathProvider>
  );
}
