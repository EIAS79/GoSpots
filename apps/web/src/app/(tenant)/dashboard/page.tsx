"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/use-auth";
import {
  dashboardBase,
  resolveVenuePathFromMemberships,
} from "@/lib/venue-dashboard";

/** Sends owners/staff to their venue dashboard (`/dashboard/{slug}--{key}`). */
export default function DashboardPage() {
  const router = useRouter();
  const { state } = useAuth();

  useEffect(() => {
    if (state.status === "loading") return;
    if (state.status === "guest") {
      router.replace("/login?next=/dashboard");
      return;
    }
    const venuePath = resolveVenuePathFromMemberships(state.user.memberships);
    if (venuePath) {
      router.replace(dashboardBase(venuePath));
      return;
    }
    router.replace("/login");
  }, [state, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
    </div>
  );
}
