"use client";

import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  openBillingPortal,
  startBillingCheckout,
} from "@/lib/dashboard-client";
import { cn } from "@/lib/cn";

export function BillingCheckoutCard({
  monthlyTotal,
  configured,
  hasLemonSub,
  trialActive,
  trialExpired,
}: {
  monthlyTotal: number;
  configured: boolean;
  hasLemonSub: boolean;
  trialActive: boolean;
  trialExpired: boolean;
}) {
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
      setError(e instanceof Error ? e.message : "Billing action failed.");
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <CreditCard size={18} className="text-emerald-400" />
            Billing
          </h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Payments run through{" "}
            <span className="text-zinc-200">Lemon Squeezy</span> (Merchant of
            Record) — multi-currency checkout, VAT/tax handled for you. Your
            pack + add-ons total{" "}
            <span className="font-medium text-emerald-300">
              €{monthlyTotal}/mo
            </span>
            .
          </p>
          {hasLemonSub ? (
            <p className="mt-2 text-xs text-zinc-500">
              Manage payment method, invoices, or cancel in the Lemon Squeezy
              portal. Pack changes you save here apply at the next billing
              period.
            </p>
          ) : null}
          {!configured ? (
            <p className="mt-2 text-xs text-amber-200/90">
              Billing keys are not set on the API yet. Add LEMON_SQUEEZY_* env
              vars to enable checkout.
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
            ? "Manage billing"
            : trialActive
              ? "Add payment method"
              : "Activate subscription"}
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-300">{error}</p>
      ) : null}
    </section>
  );
}
