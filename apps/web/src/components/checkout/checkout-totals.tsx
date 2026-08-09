import type { CheckoutPreview } from "@/lib/checkout-client";
import { formatCheckoutMoney } from "./checkout-presenter";

function TotalRow({
  label,
  amount,
  currency,
  locale,
  subdued = false,
}: {
  label: string;
  amount: string;
  currency: string;
  locale: string;
  subdued?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className={subdued ? "text-zinc-500" : "text-zinc-300"}>{label}</span>
      <span className="font-medium tabular-nums text-zinc-100">
        {formatCheckoutMoney(amount, currency, locale)}
      </span>
    </div>
  );
}

export function CheckoutTotals({
  preview,
  locale = "en",
}: {
  preview: CheckoutPreview;
  locale?: string;
}) {
  return (
    <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.055] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
            Check total
          </p>
          <p className="mt-1 text-xs text-zinc-500">Live bill</p>
        </div>
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.65)]" />
      </div>

      <div className="border-y border-white/7 py-2 text-sm">
        <TotalRow
          label="Subtotal"
          amount={preview.subtotal}
          currency={preview.currency}
          locale={locale}
        />
        <TotalRow
          label="Adjustments"
          amount={preview.adjustments}
          currency={preview.currency}
          locale={locale}
          subdued
        />
        <TotalRow
          label="Tax"
          amount={preview.taxAmount}
          currency={preview.currency}
          locale={locale}
          subdued
        />
        <TotalRow
          label="Deposits"
          amount={preview.depositAmount}
          currency={preview.currency}
          locale={locale}
          subdued
        />
        <TotalRow
          label="Total"
          amount={preview.total}
          currency={preview.currency}
          locale={locale}
        />
      </div>

      <div className="pt-4 text-right">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
          Amount due
        </p>
        <p
          className="mt-1 text-4xl font-black tracking-tight tabular-nums text-white"
          data-testid="checkout-amount-due"
        >
          {formatCheckoutMoney(preview.amountDue, preview.currency, locale)}
        </p>
      </div>
    </section>
  );
}
