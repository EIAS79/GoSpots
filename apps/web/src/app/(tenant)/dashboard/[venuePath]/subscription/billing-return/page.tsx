"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";

/**
 * Hosted-checkout return can land here; we forward to the subscription page
 * with confirming + op so payment is verified via API (never trust the URL alone).
 */
function BillingReturnInner() {
  const { t } = useVenueSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  const subscriptionHref = useVenueHref("/subscription");

  useEffect(() => {
    const op = searchParams.get("op");
    const qs = new URLSearchParams();
    qs.set("billing", "confirming");
    if (op) qs.set("op", op);
    router.replace(`${subscriptionHref}?${qs.toString()}`);
  }, [router, searchParams, subscriptionHref]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-16 text-sm text-sky-100">
      <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      {t("subscription.confirmingPayment")}
    </div>
  );
}

export default function BillingReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      }
    >
      <BillingReturnInner />
    </Suspense>
  );
}
