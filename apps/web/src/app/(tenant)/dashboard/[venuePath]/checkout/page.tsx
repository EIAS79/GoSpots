"use client";

import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { CheckoutWorkspace } from "@/components/checkout/checkout-workspace";
import { TenantPage } from "@/components/layout/tenant-page";
import { checkoutAccess } from "@/components/checkout/checkout-presenter";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

function hasPermission(role: string | undefined, permissions: string, key: string) {
  if (role === "OWNER") return true;
  const values = new Set(
    permissions
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return values.has("*") || values.has(key);
}

export default function CheckoutPage() {
  const { state } = useAuth();
  const membership = useCurrentMembership();
  const locale = useVenueSettingsOptional()?.locale ?? "en";

  if (state.status !== "authed") {
    return (
      <TenantPage title="Checkout" description="Guest bills and payment.">
        <div className="flex min-h-[18rem] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
        </div>
      </TenantPage>
    );
  }

  const permissions = membership?.permissions ?? "";
  const access = checkoutAccess(membership?.role, permissions);
  const canDiscount = hasPermission(
    membership?.role,
    permissions,
    "discount.manual",
  );
  const canComp = hasPermission(membership?.role, permissions, "comp.apply");
  const canPriceOverride = hasPermission(
    membership?.role,
    permissions,
    "price.override",
  );
  const polish = locale === "pl";

  return (
    <TenantPage
      title={polish ? "Kasa" : "Checkout"}
      description={
        polish
          ? "Szybkie centrum obsługi rachunku: aktywność, płatność, fiskalizacja i zamknięcie."
          : "Operator command center for the full guest-check lifecycle: activity, payment, compliance and close."
      }
      className="bg-zinc-950/30 p-2 sm:p-3 md:p-4 lg:p-4"
    >
      <section
        className="mb-3 grid gap-2 rounded-2xl border border-white/8 bg-black/20 p-3 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-4 sm:px-4"
        data-testid="checkout-flow-guide"
      >
        <div className="flex items-center gap-2 text-emerald-300">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/10">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em]">
              {polish ? "Bezpieczna kasa" : "Safe checkout"}
            </p>
            <p className="text-[11px] text-zinc-500">
              {polish ? "Jedna płatność, jeden stan prawdy" : "One payment, one source of truth"}
            </p>
          </div>
        </div>

        <div className="grid gap-1.5 text-[11px] leading-4 text-zinc-400 sm:grid-cols-3">
          <p className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
            {polish ? "Najpierw zakończ aktywne zamówienia i sesje." : "Finalize active orders and sessions first."}
          </p>
          <p className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
            {polish ? "Pobierz płatność tylko raz i poczekaj na wynik terminala." : "Take payment once and wait for the terminal result."}
          </p>
          <p className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
            {polish ? "Zamknij rachunek dopiero po rozliczeniu aktywności i zgodności." : "Close only after activity and compliance are resolved."}
          </p>
        </div>
      </section>

      <CheckoutWorkspace
        canRead={access.read}
        canWrite={access.write}
        canDiscount={canDiscount}
        canComp={canComp}
        canPriceOverride={canPriceOverride}
        locale={locale}
      />
    </TenantPage>
  );
}
