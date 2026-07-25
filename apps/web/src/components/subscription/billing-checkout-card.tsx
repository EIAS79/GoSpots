"use client";

import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  openBillingPortal,
  startBillingCheckout,
} from "@/lib/dashboard-client";
import { cn } from "@/lib/cn";
import { useVenueSettings } from "@/lib/venue-settings-context";

export function BillingCheckoutCard({
  monthlyTotal,
  configured,
  missingEnv,
  hasLemonSub,
  trialActive,
  trialExpired,
}: {
  /** Monthly total in EUR catalog units — converted for display. */
  monthlyTotal: number;
  configured: boolean;
  /** Missing Lemon env var names from the API (never secret values). */
  missingEnv?: string[];
  hasLemonSub: boolean;
  trialActive: boolean;
  trialExpired: boolean;
}) {
  const { formatFromEur, t } = useVenueSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const { url } = hasLemonSub
        ? await openBillingPortal()
        : await startBillingCheckout();
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("subscription.billingFailed"),
      );
      setLoading(false);
    }
  }

  const missing = (missingEnv ?? []).filter(Boolean);

  return (
    <section className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <CreditCard size={18} className="text-emerald-400" />
            {t("subscription.billingTitle")}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            {t("subscription.billingBody", {
              price: formatFromEur(monthlyTotal),
            })}
          </p>
          {hasLemonSub ? (
            <p className="mt-2 text-xs text-zinc-500">
              {t("subscription.billingManageHint")}
            </p>
          ) : null}
          {!configured ? (
            <p className="mt-2 text-xs text-amber-200/90">
              {missing.length > 0
                ? t("subscription.billingMissingKeys", {
                    keys: missing.join(", "),
                  })
                : t("subscription.billingNotConfigured")}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={!configured || loading}
          onClick={() => void go()}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40",
            trialExpired || !hasLemonSub
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
          )}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ExternalLink size={16} />
          )}
          {hasLemonSub
            ? t("subscription.manageBilling")
            : trialActive
              ? t("subscription.addPayment")
              : t("subscription.activate")}
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-300">{error}</p>
      ) : null}
    </section>
  );
}
