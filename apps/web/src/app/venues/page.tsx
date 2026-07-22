import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { VenuesDiscovery } from "@/components/venues/venues-discovery";

export const metadata: Metadata = {
  title: "Find venues — GoSpots",
  description:
    "Browse gaming centers, restaurants, and venues on GoSpots. Search by city and category, then reserve when hosts enable it.",
};

function VenuesLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-[var(--color-foreground)]">
      <Loader2 className="size-8 animate-spin text-amber-500 dark:text-amber-400" />
    </div>
  );
}

/** Guest discovery directory — owner acquisition is `/for-venues`. */
export default function VenuesPage() {
  return (
    <Suspense fallback={<VenuesLoading />}>
      <VenuesDiscovery />
    </Suspense>
  );
}
