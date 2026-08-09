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
    <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Server-authoritative total
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Preview version {preview.checkVersion}
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
          Live preview
        </span>
      </div>

      <div className="border-y border-white/7 py-2 text-sm">
        <TotalRow label="Subtotal" amount={preview.subtotal} currency={preview.currency} locale={locale} />
        <TotalRow label="Adjustments" amount={preview.adjustments} currency={preview.currency} locale={locale} subdued />
        <TotalRow label="Tax" amount={preview.taxAmount} currency={preview.currency} locale={locale} subdued />
        <TotalRow label="Deposits" amount={preview.depositAmount} currency={preview.currency} locale={locale} subdued />
        <TotalRow label="Total" amount={preview.total} currency={preview.currency} locale={locale} />
      </div>

      <div className="pt-4 text-right">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
          Amount due
        </p>
        <p className="mt-1 text-4xl font-black tracking-tight tabular-nums text-white sm:text-5xl" data-testid="checkout-amount-due">
          {formatCheckoutMoney(preview.amountDue, preview.currency, locale)}
        </p>
      </div>
    </section>
  );
}
