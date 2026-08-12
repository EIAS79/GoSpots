"use client";

import { Loader2 } from "lucide-react";
import { CheckoutWorkspace } from "@/components/checkout/checkout-workspace";
import { TenantPage } from "@/components/layout/tenant-page";
import { checkoutAccess } from "@/components/checkout/checkout-presenter";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

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

  const access = checkoutAccess(membership?.role, membership?.permissions ?? "");
  const polish = locale === "pl";

  return (
    <TenantPage
      title={polish ? "Kasa" : "Checkout"}
      description={
        polish
          ? "Jeden rachunek gościa: sprawdź pozycje, przyjmij płatność, zakończ aktywną grę lub zamówienie i zamknij rachunek."
          : "One guest bill: review charges, take payment, finish any live play or order, then close the check."
      }
      capabilities={[
        "One bill across play, orders, and booking charges",
        "Server-authoritative total and remaining balance",
        "Cash, external-terminal card, split, and other recorded payments",
        "Live close-readiness with clear blockers and next actions",
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
            ? "płatność zmniejsza saldo; zamknięcie rachunku tylko finalizuje obsługę. Jeśli gra lub zamówienie nadal trwa, zakończ je najpierw. Nie pobieraj tej samej płatności drugi raz."
            : "payment reduces the balance; closing the check only finalizes the workflow. If a play session or order is still live, finish it first. Never take the same payment twice."}
        </p>
      </section>

      <CheckoutWorkspace
        canRead={access.read}
        canWrite={access.write}
        locale={locale}
      />
    </TenantPage>
  );
}
