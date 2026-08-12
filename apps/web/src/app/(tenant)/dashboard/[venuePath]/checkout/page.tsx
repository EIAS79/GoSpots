"use client";

import { Loader2 } from "lucide-react";
import { CheckoutWorkspace } from "@/components/checkout/checkout-workspace";
import { TenantPage } from "@/components/layout/tenant-page";
import { checkoutAccess } from "@/components/checkout/checkout-presenter";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const ENGLISH_CHECKOUT_STEPS = [
  ["1", "Build bill", "Add menu items or attach the guest's order, booking, and play."],
  ["2", "Finalize bill", "Hand off open orders and finish standalone play sessions so the amount cannot keep changing."],
  ["3", "Take payment", "Record cash, a card already taken on an external terminal, split payment, or another tender."],
  ["4", "Close check", "When the balance is zero, close the guest check. Resource-booking billing is finalized automatically."],
] as const;

const POLISH_CHECKOUT_STEPS = [
  ["1", "Zbuduj rachunek", "Dodaj pozycje menu albo połącz zamówienie, rezerwację i grę gościa."],
  ["2", "Ustal końcowy rachunek", "Wydaj otwarte zamówienia i zakończ samodzielne sesje gry, aby kwota nie mogła się już zmienić."],
  ["3", "Przyjmij płatność", "Zapisz gotówkę, kartę przyjętą na zewnętrznym terminalu, płatność dzieloną lub inną metodę."],
  ["4", "Zamknij rachunek", "Gdy saldo wynosi zero, zamknij rachunek gościa. Rozliczenie rezerwacji zasobu jest finalizowane automatycznie."],
] as const;

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
  const steps = polish ? POLISH_CHECKOUT_STEPS : ENGLISH_CHECKOUT_STEPS;

  return (
    <TenantPage
      title={polish ? "Kasa" : "Checkout"}
      description={
        polish
          ? "Jeden rachunek gościa dla gry, zamówień i rezerwacji — z finalną kwotą przed przyjęciem płatności."
          : "One guest bill for play, food & drink, and bookings — with the amount finalized before payment is taken."
      }
      capabilities={[
        "One guest check across play, orders, and bookings",
        "Bill-finalization gate before payment",
        "Cash, manual external-terminal card, split, and other tenders",
        "Immutable payment allocation and explicit close state",
      ]}
      className="bg-zinc-950/30 p-2 sm:p-3 md:p-4 lg:p-4"
    >
      <section
        className="mb-3 rounded-2xl border border-sky-400/15 bg-sky-400/[0.045] p-3 sm:p-4"
        data-testid="checkout-flow-guide"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
              {polish ? "Bezpieczny przepływ kasy" : "Safe checkout flow"}
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">
              {polish
                ? "Najpierw ustal końcową kwotę. Dopiero potem przyjmij płatność."
                : "Finalize what the guest owes first. Take payment only after the bill is stable."}
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            {polish
              ? "Paragon fiskalny / faktura pozostaje osobnym etapem zgodności."
              : "Fiscal receipt / invoice remains a separate compliance step."}
          </p>
        </div>

        <ol className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {steps.map(([number, title, copy]) => (
            <li
              key={number}
              className="flex gap-2.5 rounded-xl border border-white/7 bg-black/15 px-3 py-2.5"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-400/12 text-xs font-black text-sky-200">
                {number}
              </span>
              <div>
                <p className="text-xs font-bold text-zinc-200">{title}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">{copy}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.055] px-3 py-2 text-xs leading-5 text-amber-100/90">
          <span className="font-bold text-amber-200">
            {polish ? "Dlaczego: " : "Why: "}
          </span>
          {polish
            ? "GoSpots blokuje nową płatność, gdy otwarte zamówienie lub samodzielna sesja gry może jeszcze zmienić kwotę. Po zapisaniu pierwszej płatności rachunek jest zablokowany."
            : "GoSpots blocks a new payment while an open order or standalone play session can still change the amount. Once the first payment is recorded, the bill is locked."}
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
