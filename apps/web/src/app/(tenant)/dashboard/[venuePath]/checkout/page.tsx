"use client";

import { Loader2 } from "lucide-react";
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
          ? "Jeden rachunek gościa: zbuduj rachunek, ustal końcową kwotę, przyjmij płatność i zamknij rachunek."
          : "One guest bill: build it, finalize the amount, take payment, then close the check."
      }
      capabilities={[
        "One bill across session time, orders, services and booking charges",
        "Authorized discounts, comps, overrides, service charge and gratuity",
        "Cash, external-terminal card, split, partial and mixed recorded payments",
        "Immutable commercial receipt and canonical ledger reconciliation",
      ]}
      className="bg-zinc-950/30 p-2 sm:p-3 md:p-4 lg:p-4"
    >
      <section
        className="mb-3 shrink-0 rounded-2xl border border-sky-400/15 bg-sky-400/[0.045] px-3 py-2.5 sm:px-4"
        data-testid="checkout-flow-guide"
      >
        <p className="text-xs leading-5 text-zinc-400">
          <span className="font-bold text-sky-200">
            {polish ? "Najważniejsza zasada: " : "The important rule: "}
          </span>
          {polish
            ? "najpierw zakończ otwarte zamówienia i aktywne sesje, aby kwota była ostateczna. Dopiero potem przyjmij płatność. Po zapisaniu płatności nie pobieraj jej drugi raz — zamknięcie rachunku finalizuje tylko rozliczenie i stan operacyjny."
            : "finalize open orders and active sessions first so the amount is stable. Only then take payment. Once payment is recorded, never take it again — closing the check only finalizes settlement and operational state."}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-zinc-600">
          {polish
            ? "Pokwitowanie komercyjne nie jest dokumentem fiskalnym. Paragon fiskalny lub faktura to osobny etap zgodności."
            : "The commercial receipt is non-fiscal. Fiscal receipt or invoice is a separate compliance step."}
        </p>
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
