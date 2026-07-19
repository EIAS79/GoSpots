import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { VenuesDiscovery } from "@/components/venues/venues-discovery";

export const metadata: Metadata = {
  title: "Find your next spot — GoSpots",
  description:
    "Discover gaming centers, lounges, bars, and entertainment venues worldwide on GoSpots.",
};

function VenuesLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <Loader2 className="size-8 animate-spin text-amber-400" />
    </div>
  );
}

export default function VenuesPage() {
  return (
    <Suspense fallback={<VenuesLoading />}>
      <VenuesDiscovery />
    </Suspense>
  );
}
