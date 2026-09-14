"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchProviderCheckoutPayments,
  refundRemainingProviderCheckoutPayment,
  type ProviderCheckoutPaymentSummary,
} from "@/lib/provider-checkout-client";
import { checkoutErrorMessage } from "./checkout-presenter";
import { ProviderRefundControl } from "./provider-refund-control";

export function ProviderRefundPanel({
  settlementId,
  canWrite,
  locale = "en",
}: {
  settlementId: string | null;
  canWrite: boolean;
  locale?: string;
}) {
  const [payments, setPayments] = useState<ProviderCheckoutPaymentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!settlementId) {
      setPayments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPayments(await fetchProviderCheckoutPayments(settlementId));
    } catch (loadError) {
      setError(
        checkoutErrorMessage(
          loadError,
          "Could not load provider payment/refund state.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refund(payment: ProviderCheckoutPaymentSummary) {
    if (!canWrite || busyId || !payment.canRefund) return;
    const confirmed = window.confirm(
      `Refund the remaining ${payment.refundableAmount} ${payment.currency} on this ${payment.provider.toUpperCase()} card payment?`,
    );
    if (!confirmed) return;

    setBusyId(payment.id);
    setError(null);
    try {
      await refundRemainingProviderCheckoutPayment(payment.id);
      await load();
    } catch (refundError) {
      setError(
        checkoutErrorMessage(
          refundError,
          "Could not request the provider refund. Check provider status before retrying.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!settlementId || (!loading && payments.length === 0 && !error)) return null;

  return (
    <section className="border-t border-white/8 bg-black/10 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Card provider payments
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Refunds use the original checkout allocation lineage and provider transaction reference.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busyId !== null}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 transition hover:bg-white/[0.05] disabled:opacity-50"
          aria-label="Refresh provider payments"
          title="Refresh provider payments"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-xs leading-5 text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {payments.map((payment) => (
          <article
            key={payment.id}
            className="rounded-xl border border-white/8 bg-white/[0.025] p-3"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-zinc-200">Card payment</span>
              <span className="font-bold text-emerald-300">{payment.state}</span>
            </div>
            <ProviderRefundControl
              payment={payment}
              locale={locale}
              busy={busyId === payment.id}
              onRefund={() => void refund(payment)}
            />
          </article>
        ))}
      </div>
    </section>
  );
}