import { ChevronDown, CircleDollarSign } from "lucide-react";
import type {
  CheckoutPaymentState,
  CheckoutPreview,
} from "@/lib/checkout-client";
import { CheckoutComplianceStatus } from "./compliance-status";
import { formatCheckoutMoney } from "./checkout-presenter";

function TotalRow({
  label,
  amount,
  currency,
  locale,
  subdued = false,
  accent = false,
}: {
  label: string;
  amount: string;
  currency: string;
  locale: string;
  subdued?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span
        className={
          subdued
            ? "text-zinc-500"
            : accent
              ? "text-emerald-300"
              : "text-zinc-300"
        }
      >
        {label}
      </span>
      <span
        className={`font-semibold tabular-nums ${accent ? "text-emerald-300" : "text-zinc-100"}`}
      >
        {formatCheckoutMoney(amount, currency, locale)}
      </span>
    </div>
  );
}

export function CheckoutTotals({
  preview,
  paymentState = null,
  locale = "en",
}: {
  preview: CheckoutPreview;
  paymentState?: CheckoutPaymentState | null;
  locale?: string;
}) {
  const amountDue = paymentState?.amountDue ?? preview.amountDue;
  const isPaid = paymentState?.state === "PAID" || amountDue === "0.0000";
  const status = paymentState
    ? paymentState.state === "PARTIALLY_PAID"
      ? "Partially paid"
      : paymentState.state === "PAID"
        ? "Paid"
        : "Settlement ready"
    : "Live bill";

  return (
    <div className="space-y-3">
      <section
        className={`overflow-hidden rounded-2xl border ${
          isPaid
            ? "border-emerald-400/35 bg-emerald-400/[0.075]"
            : "border-white/10 bg-zinc-950/80"
        }`}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-9 w-9 place-items-center rounded-xl ${
                  isPaid
                    ? "bg-emerald-400/12 text-emerald-300"
                    : "bg-white/[0.06] text-zinc-300"
                }`}
              >
                <CircleDollarSign className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                  {isPaid ? "Balance" : "Amount due"}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{status}</p>
              </div>
            </div>
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                isPaid
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.04] text-zinc-400"
              }`}
            >
              {isPaid ? "Paid" : "Open"}
            </span>
          </div>

          <p
            className={`mt-4 text-right text-[2.55rem] font-black leading-none tracking-tight tabular-nums ${
              isPaid ? "text-emerald-300" : "text-white"
            }`}
            data-testid="checkout-amount-due"
          >
            {formatCheckoutMoney(amountDue, preview.currency, locale)}
          </p>

          {paymentState && paymentState.paidAmount !== "0.0000" ? (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/7 bg-black/20 px-3 py-2 text-xs">
              <span className="text-zinc-500">Already paid</span>
              <span className="font-bold tabular-nums text-emerald-300">
                {formatCheckoutMoney(
                  paymentState.paidAmount,
                  paymentState.currency,
                  locale,
                )}
              </span>
            </div>
          ) : null}
        </div>

        <details className="group border-t border-white/7">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-zinc-400 transition hover:bg-white/[0.025] hover:text-zinc-200">
            <span>Bill breakdown</span>
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-white/7 bg-black/15 px-4 py-2 text-sm">
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
            <div className="mt-1 border-t border-white/7 pt-1">
              <TotalRow
                label="Check total"
                amount={preview.total}
                currency={preview.currency}
                locale={locale}
              />
            </div>
          </div>
        </details>
      </section>

      {isPaid && paymentState ? (
        <CheckoutComplianceStatus
          settlementId={paymentState.settlementId}
          canWrite={false}
        />
      ) : null}
    </div>
  );
}
