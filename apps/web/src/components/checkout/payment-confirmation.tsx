"use client";

import { Banknote, CreditCard, ShieldCheck } from "lucide-react";
import type { CheckoutPaymentMethod } from "@/lib/checkout-client";
import { formatCheckoutMoney } from "./checkout-presenter";

function methodCopy(method: CheckoutPaymentMethod) {
  if (method === "CASH") {
    return {
      label: "Cash received",
      action: "Confirm cash received",
      detail:
        "Only continue after you physically receive this amount. GoSpots will record it in the currently open cash shift.",
      icon: Banknote,
    };
  }
  if (method === "MANUAL_CARD") {
    return {
      label: "Card · external terminal",
      action: "Record approved card payment",
      detail:
        "Only continue after the separate card terminal or processor says the payment is approved. GoSpots records that result; it does not charge the card from this button.",
      icon: CreditCard,
    };
  }
  return {
    label: "Other payment received",
    action: "Record received payment",
    detail:
      "Only continue after you have actually received this payment through another method. This button records the result in GoSpots.",
    icon: ShieldCheck,
  };
}

export function PaymentConfirmation({
  method,
  amount,
  currency,
  locale = "en",
  busy = false,
  onConfirm,
  onCancel,
}: {
  method: CheckoutPaymentMethod;
  amount: string;
  currency: string;
  locale?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = methodCopy(method);
  const Icon = copy.icon;

  return (
    <section className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.065] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/12 text-emerald-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
            Confirm payment
          </p>
          <h3 className="mt-1 text-base font-bold text-white">{copy.label}</h3>
          <p className="mt-2 text-3xl font-black tabular-nums text-white">
            {formatCheckoutMoney(amount, currency, locale)}
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-400">{copy.detail}</p>
          <p className="mt-2 rounded-lg border border-white/7 bg-black/15 px-2.5 py-2 text-[11px] leading-4 text-zinc-500">
            Recording payment changes the GoSpots balance. It does not automatically end an active play session or open order.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/[0.07] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="min-h-11 rounded-xl bg-emerald-400 px-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
        >
          {busy ? "Recording…" : copy.action}
        </button>
      </div>
    </section>
  );
}
