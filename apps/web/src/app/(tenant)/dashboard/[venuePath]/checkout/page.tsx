"use client";

import { Loader2 } from "lucide-react";
import { CheckoutWorkspace } from "@/components/checkout/checkout-workspace";
import { TenantPage } from "@/components/layout/tenant-page";
import { checkoutAccess } from "@/components/checkout/checkout-presenter";
import { useAuth } from "@/lib/use-auth";
import { useCurrentMembership } from "@/lib/use-current-membership";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const ENGLISH_CHECKOUT_STEPS = [
  ["1", "Build the bill", "Attach the guest's play session, order, or booking."],
  ["2", "Take payment", "Record cash, manual card, split, or another tender."],
  ["3", "Finish activity", "End every linked play session, order, or booking that is still active."],
  ["4", "Close the check", "When the balance is zero and linked activity is finished, close the guest check."],
] as const;

const POLISH_CHECKOUT_STEPS = [
  ["1", "Zbuduj rachunek", "Połącz grę, zamówienie lub rezerwację gościa."],
  ["2", "Przyjmij płatność", "Zapisz gotówkę, kartę ręczną, płatność dzieloną lub inną metodę."],
  ["3", "Zakończ aktywność", "Zakończ każdą połączoną grę, zamówienie lub rezerwację, która nadal trwa."],
  ["4", "Zamknij rachunek", "Gdy saldo wynosi zero i aktywności są zakończone, zamknij rachunek gościa."],
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
          ? "Jeden ekran Checkout V2 dla czasu gry, zamówień i rezerwacji. Kwoty pochodzą z autorytatywnego podglądu serwera."
          : "One Checkout V2 surface for play, food & drink, and bookings. Amounts come from the authoritative server preview."
      }
      capabilities={[
        "Grouped play, food & drink, and booking charges",
        "Server-authoritative amount due",
        "Role-aware read-only checkout",
        "Cash, Card, Split, and More placeholders without payment side effects",
      ]}
      className="bg-zinc-950/30 p-2 sm:p-3 md:p-4 lg:p-4"
    >
      <section
        className="mb-3 shrink-0 rounded-2xl border border-sky-400/15 bg-sky-400/[0.045] p-3 sm:p-4"
        data-testid="checkout-flow-guide"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
              {polish ? "Jak działa kasa" : "How checkout works"}
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">
              {polish
                ? "Płatność i zamknięcie rachunku to dwa osobne kroki."
                : "Payment and closing the guest check are two separate steps."}
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            {polish
              ? "Dokument fiskalny / faktura to osobny etap zgodności."
              : "Fiscal receipt / invoice is a separate compliance step."}
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
            {polish ? "Ważne: " : "Important: "}
          </span>
          {polish
            ? "„Zapłacone” nie oznacza automatycznie „zamknięte”. Jeśli połączona gra, zamówienie lub rezerwacja nadal trwa, GoSpots pozostawi rachunek otwarty. Najpierw zakończ tę aktywność, a potem wróć tutaj i zamknij rachunek gościa."
            : "“Paid” does not automatically mean “closed.” If a linked play session, order, or booking is still active, GoSpots keeps the check open. Finish that activity first, then return here and close the guest check."}
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
