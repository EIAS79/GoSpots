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
      <TenantPage title="Checkout" description="Server-authoritative operator checkout.">
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
          ? "Jeden ekran Checkout V2 dla czasu gry, zamówień i rezerwacji. Kwoty pochodzą z autorytatywnego podglądu serwera."
          : "One Checkout V2 surface for play, food & drink, and bookings. Amounts come from the authoritative server preview."
      }
      capabilities={[
        "Grouped play, food & drink, and booking charges",
        "Server-authoritative amount due",
        "Role-aware read-only checkout",
        "Cash, Card, Split, and More placeholders without payment side effects",
      ]}
      className="bg-zinc-950/30"
    >
      <CheckoutWorkspace
        canRead={access.read}
        canWrite={access.write}
        locale={locale}
      />
    </TenantPage>
  );
}
