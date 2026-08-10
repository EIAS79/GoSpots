"use client";

import { Banknote, CreditCard, ShieldCheck } from "lucide-react";
import type { CheckoutPaymentMethod } from "@/lib/checkout-client";
import { formatCheckoutMoney } from "./checkout-presenter";

function methodCopy(method: CheckoutPaymentMethod) {
  if (method === "CASH") {
    return {
      label: "Cash",
      action: "Confirm cash received",
      detail:
        "Confirm that you physically received this amount. GoSpots will record it in the open cash shift.",
      icon: Banknote,
    };
  }
  if (method === "MANUAL_CARD") {
    return {
      label: "Manual card",
      action: "Record manual card",
      detail:
        "Only continue after the external terminal or processor has approved this payment. GoSpots records the payment here; it does not charge the card.",
      icon: CreditCard,
    };
  }
  return {
    label: "Other",
    action: "Record other payment",
    detail:
      "Confirm that this payment was received through another method before recording it in GoSpots.",
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
