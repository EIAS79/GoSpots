"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackEventOnce } from "@/lib/analytics";
import {
  fetchBillingCheckoutStatus,
  fetchBillingPayments,
  peekPendingBillingOperation,
} from "@/lib/dashboard-client";

const FAILED_PAYMENT_STATUSES = new Set(["FAILED", "CANCELED", "EXPIRED"]);
const FAILED_OPERATION_STATUSES = new Set(["FAILED", "EXPIRED"]);

/**
 * Tracks a subscription purchase only from a server-confirmed PAID payment row.
 * The pending checkout operation is captured before the subscription page clears it,
 * so URL cleanup does not lose the conversion. Legacy soft-success returns without
 * an operation id are intentionally not counted as purchases.
 */
export function BillingPurchaseTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/subscription")) return;

    const query = new URLSearchParams(window.location.search);
    const operationId = query.get("op") || peekPendingBillingOperation();
    if (!operationId) return;

    let cancelled = false;
    const startedAt = Date.now();
    const timeoutMs = 90_000;

    async function tick() {
      if (cancelled) return;

      try {
        const [operation, payments] = await Promise.all([
          fetchBillingCheckoutStatus(operationId).catch(() => null),
          fetchBillingPayments(20).catch(() => ({ items: [] })),
        ]);

        if (cancelled) return;

        const response = operation?.response as
          | { billingSubscriptionId?: string }
          | null
          | undefined;
        const subscriptionId = response?.billingSubscriptionId;

        if (subscriptionId) {
          const relatedPayments = payments.items.filter(
            (payment) => payment.subscriptionId === subscriptionId,
          );
          const paidPayment = relatedPayments.find(
            (payment) => payment.canonicalStatus === "PAID",
          );

          if (paidPayment) {
            trackEventOnce(`purchase:${paidPayment.id}`, {
              event: "purchase",
              transaction_id: paidPayment.id,
              value: paidPayment.amountMinor / 100,
              currency: paidPayment.currency,
              provider: paidPayment.provider,
              subscription_id: subscriptionId,
              operation_id: operationId,
              sequence_type: paidPayment.sequenceType,
            });
            return;
          }

          const failedPayment = relatedPayments.some((payment) =>
            FAILED_PAYMENT_STATUSES.has(payment.canonicalStatus),
          );
          if (failedPayment) return;
        }

        if (
          operation?.status &&
          FAILED_OPERATION_STATUSES.has(operation.status)
        ) {
          return;
        }
      } catch {
        // Temporary network/provider errors are retried within the same window.
      }

      if (!cancelled && Date.now() - startedAt < timeoutMs) {
        window.setTimeout(() => void tick(), 2000);
      }
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
