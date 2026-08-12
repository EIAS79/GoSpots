"use client";

import { AlertTriangle, Check, Circle, ExternalLink, LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { GuestCheck } from "@/lib/guest-check-client";
import { useVenueHref } from "@/lib/venue-context";
import {
  checkoutBillBlockers,
  checkoutFlowStep,
  checkoutOperationalBlockers,
} from "./checkout-presenter";

const EN_STEPS = [
  ["Build bill", "Attach the right play, orders, and booking charges."],
  ["Finalize bill", "Hand off open orders and end running standalone play timers so the amount cannot keep changing."],
  ["Take payment", "Record how the customer actually paid after the bill is final."],
  ["Close check", "Archive the paid check when no live activity is still blocking it."],
] as const;

const PL_STEPS = [
  ["Zbuduj rachunek", "Podepnij właściwą grę, zamówienia i opłaty rezerwacji."],
  ["Ustal końcowy rachunek", "Wydaj otwarte zamówienia i zakończ bieżące samodzielne sesje gry, aby kwota nie mogła się już zmienić."],
  ["Przyjmij płatność", "Zapisz rzeczywistą metodę płatności dopiero po ustaleniu końcowej kwoty."],
  ["Zamknij rachunek", "Archiwizuj opłacony rachunek, gdy żadna aktywna czynność go już nie blokuje."],
] as const;

export function CheckoutFlowStatus({
  check,
  lineCount,
  paymentStarted,
  fullyPaid,
  locale = "en",
}: {
  check: GuestCheck;
  lineCount: number;
  paymentStarted: boolean;
  fullyPaid: boolean;
  locale?: string;
}) {
  const polish = locale === "pl";
  const steps = polish ? PL_STEPS : EN_STEPS;
  const billBlockers = checkoutBillBlockers(check);
  const closeBlockers = checkoutOperationalBlockers(check);
  const current = checkoutFlowStep({
    lineCount,
    paymentStarted,
    fullyPaid,
    blockerCount: closeBlockers.length,
    billBlockerCount: billBlockers.length,
  });
  const ordersHref = useVenueHref("/orders");
  const sessionsHref = useVenueHref("/sessions");

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
            {polish ? "Status kasy" : "Checkout status"}
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">
            {polish ? `Krok ${current} z 4` : `Step ${current} of 4`} · {steps[current - 1][0]}
          </p>
        </div>
        {fullyPaid ? (
          <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
            {polish ? "Zapłacone" : "Paid"}
          </span>
        ) : paymentStarted ? (
          <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
            {polish ? "Częściowo zapłacone" : "Partially paid"}
          </span>
        ) : billBlockers.length === 0 && lineCount > 0 ? (
          <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-300">
            {polish ? "Gotowe do płatności" : "Ready for payment"}
          </span>
        ) : null}
      </div>

      <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map(([title, copy], index) => {
          const number = index + 1;
          const done = number < current;
          const active = number === current;
          return (
            <li
              key={title}
              className={`rounded-xl border px-3 py-2.5 ${
                active
                  ? "border-sky-400/25 bg-sky-400/[0.07]"
                  : done
                    ? "border-emerald-400/15 bg-emerald-400/[0.04]"
                    : "border-white/6 bg-black/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                    done
                      ? "bg-emerald-400 text-emerald-950"
                      : active
                        ? "bg-sky-400/15 text-sky-200"
                        : "bg-white/[0.04] text-zinc-600"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
                </span>
                <p className={`text-xs font-bold ${active ? "text-sky-100" : "text-zinc-300"}`}>
                  {title}
                </p>
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-zinc-500">{copy}</p>
            </li>
          );
        })}
      </ol>

      {!fullyPaid && billBlockers.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.065] p-3">
          <div className="flex items-start gap-2.5">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-amber-200">
                {polish
                  ? "Płatność zablokowana — najpierw ustal końcową kwotę"
                  : "Payment locked — finalize the bill first"}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-amber-100/70">
                {polish
                  ? "To zabezpiecza kasjera przed pobraniem płatności, gdy timer lub zamówienie może jeszcze zmienić należność."
                  : "This prevents the cashier from taking money while a running timer or open order can still change what the guest owes."}
              </p>
              <div className="mt-2 space-y-2">
                {billBlockers.map((blocker) => (
                  <div
                    key={`${blocker.kind}-${blocker.id}`}
                    className="flex flex-col gap-2 rounded-lg border border-amber-300/10 bg-black/15 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-200">
                        {blocker.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {blocker.kind === "ORDER"
                          ? polish
                            ? `Zamówienie jest ${blocker.status.toLowerCase()}. Wydaj je lub anuluj.`
                            : `Order is ${blocker.status.toLowerCase()}. Hand it off or cancel it.`
                          : polish
                            ? `Timer gry nadal działa. Zakończ timer, aby zamrozić końcową kwotę.`
                            : `Play timer is still running. End the timer to freeze the final amount.`}
                      </p>
                    </div>
                    <Link
                      href={blocker.action === "orders" ? ordersHref : sessionsHref}
                      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-2.5 text-[11px] font-bold text-amber-200 transition hover:bg-amber-300/15"
                    >
                      {blocker.action === "orders"
                        ? polish
                          ? "Otwórz zamówienia"
                          : "Open orders"
                        : polish
                          ? "Otwórz sesje"
                          : "Open sessions"}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {fullyPaid && closeBlockers.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.065] p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-amber-200">
                {polish
                  ? "Płatność zakończona — ale coś nadal jest aktywne"
                  : "Payment is complete — but something is still live"}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-amber-100/70">
                {polish
                  ? "Nie pobieraj płatności ponownie. Zakończ poniższą aktywność, wróć do kasy i zamknij rachunek."
                  : "Do not take payment again. Finish the activity below, return to Checkout, then close the check."}
              </p>
              <div className="mt-2 space-y-2">
                {closeBlockers.map((blocker) => (
                  <div
                    key={`${blocker.kind}-${blocker.id}`}
                    className="flex flex-col gap-2 rounded-lg border border-amber-300/10 bg-black/15 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-200">
                        {blocker.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {blocker.kind === "ORDER"
                          ? polish
                            ? `Zamówienie jest ${blocker.status.toLowerCase()}. Zakończ je lub anuluj.`
                            : `Order is ${blocker.status.toLowerCase()}. Complete or cancel it.`
                          : polish
                            ? `Sesja gry jest ${blocker.status.toLowerCase()}. Zakończ ją lub anuluj.`
                            : `Play session is ${blocker.status.toLowerCase()}. End or cancel it.`}
                      </p>
                    </div>
                    <Link
                      href={blocker.action === "orders" ? ordersHref : sessionsHref}
                      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-2.5 text-[11px] font-bold text-amber-200 transition hover:bg-amber-300/15"
                    >
                      {blocker.action === "orders"
                        ? polish
                          ? "Otwórz zamówienia"
                          : "Open orders"
                        : polish
                          ? "Otwórz sesje"
                          : "Open sessions"}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : fullyPaid && closeBlockers.length === 0 ? (
        <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-xs text-emerald-100">
          <span className="font-bold text-emerald-200">
            {polish ? "Gotowe do zamknięcia. " : "Ready to close. "}
          </span>
          {polish
            ? "Płatność jest kompletna i żadna aktywna gra ani zamówienie nie blokuje rachunku."
            : "Payment is complete and no live play session or order is blocking this check."}
        </div>
      ) : null}
    </section>
  );
}