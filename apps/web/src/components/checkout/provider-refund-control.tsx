"use client";

import { RotateCcw } from "lucide-react";
import type { ProviderCheckoutPaymentSummary } from "@/lib/provider-checkout-client";
import { formatCheckoutMoney } from "./checkout-presenter";

export function ProviderRefundControl({
  payment,
  locale = "en",
  busy = false,
  onRefund,
}: {
  payment: ProviderCheckoutPaymentSummary;
  locale?: string;
  busy?: boolean;
  onRefund: () => void;
}) {
  const refunded = Number(payment.refundedAmount) > 0;
  const latestRefund = payment.refunds.at(-1);

  return (
    <div className="mt-2 rounded-lg border border-white/7 bg-black/15 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-zinc-400">
          {payment.provider.toUpperCase()} · {payment.state}
        </span>
        {refunded ? (
          <span className="text-zinc-500">
            Refunded {formatCheckoutMoney(payment.refundedAmount, payment.currency, locale)}
          </span>
        ) : null}
      </div>

      {payment.pendingRefund ? (
        <p className="mt-2 text-[11px] leading-4 text-amber-200/80">
          Refund requested. Waiting for provider/webhook confirmation; do not submit another refund.
        </p>
      ) : latestRefund?.state === "FAILED" ? (
        <p className="mt-2 text-[11px] leading-4 text-rose-200/80">
          Last refund failed{latestRefund.errorMessage ? `: ${latestRefund.errorMessage}` : "."}
        </p>
      ) : payment.state === "REFUNDED" ? (
        <p className="mt-2 text-[11px] leading-4 text-emerald-200/80">
          This provider payment is fully refunded.
        </p>
      ) : null}

      {payment.canRefund ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRefund}
          className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-rose-300/20 bg-rose-300/[0.07] px-3 text-xs font-bold text-rose-100 transition hover:bg-rose-300/[0.12] disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {busy
            ? "Requesting refund…"
            : `Refund ${formatCheckoutMoney(payment.refundableAmount, payment.currency, locale)}`}
        </button>
      ) : null}
    </div>
  );
}