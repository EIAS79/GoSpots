"use client";

import { AlertTriangle, Ban, RefreshCw } from "lucide-react";
import type { ProviderCheckoutPaymentOperation } from "@/lib/provider-checkout-client";
import { formatCheckoutMoney } from "./checkout-presenter";

function copy(operation: ProviderCheckoutPaymentOperation) {
  if (operation.state === "CAPTURED") {
    return {
      title: "Card captured — finish checkout linkage",
      detail:
        "The provider captured the card, but GoSpots still needs to finish the checkout payment record. Do not charge the customer again.",
      action: "Finish checkout linkage",
    };
  }
  if (operation.state === "UNKNOWN" || operation.reconciliationRequired) {
    return {
      title: "Card outcome is unknown",
      detail:
        "Do not retry the card. Ask Adyen for the original transaction status first; GoSpots will only unlock another attempt after the outcome is resolved.",
      action: "Reconcile outcome",
    };
  }
  return {
    title: "Card payment is still in progress",
    detail:
      "This bill is locked against another card attempt until the current terminal operation is resolved or canceled.",
    action: "Refresh outcome",
  };
}

export function ProviderPaymentRecoveryPanel({
  operation,
  locale = "en",
  busy = false,
  canCancel = false,
  onReconcile,
  onCancel,
}: {
  operation: ProviderCheckoutPaymentOperation;
  locale?: string;
  busy?: boolean;
  canCancel?: boolean;
  onReconcile: () => void;
  onCancel?: () => void;
}) {
  const content = copy(operation);
  return (
    <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-100">{content.title}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{content.detail}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
            <span>{operation.provider.toUpperCase()}</span>
            <span>·</span>
            <span>{operation.state}</span>
            <span>·</span>
            <span>{formatCheckoutMoney(operation.amount, operation.currency, locale)}</span>
          </div>
          {operation.errorMessage ? (
            <p className="mt-2 text-xs leading-5 text-amber-200/80">
              {operation.errorMessage}
            </p>
          ) : null}
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${canCancel ? "grid-cols-2" : "grid-cols-1"}`}>
        {canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 text-xs font-bold text-rose-100 disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5" />
            Cancel terminal payment
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onReconcile}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 text-xs font-bold text-amber-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {content.action}
        </button>
      </div>
    </section>
  );
}
