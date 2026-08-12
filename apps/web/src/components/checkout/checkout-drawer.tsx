"use client";

import { ArrowLeftRight, RefreshCw, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  closeCheckoutCheck,
  createCheckSettlement,
  createCheckoutPayment,
  fetchCheckoutPaymentState,
  previewCheckout,
  previewPaymentGroups,
  type CheckoutPaymentMethod,
  type CheckoutPaymentState,
  type CheckoutPreview,
} from "@/lib/checkout-client";
import type { GuestCheck } from "@/lib/guest-check-client";
import { ChargeGroups } from "./charge-groups";
import { CheckMergePanel } from "./check-merge-panel";
import { CheckoutFlowStatus } from "./checkout-flow-status";
import { CheckoutSourcePicker } from "./checkout-source-picker";
import { CheckoutTotals } from "./checkout-totals";
import {
  checkoutCloseErrorMessage,
  checkoutOperationalBlockers,
  classifyCheckoutError,
  formatCheckoutMoney,
  type CheckoutIssueKind,
} from "./checkout-presenter";
import { PaymentConfirmation } from "./payment-confirmation";
import { SettlementStatus } from "./settlement-status";
import { SplitPaymentPanel } from "./split-payment-panel";
import {
  TenderButtons,
  type CheckoutTender,
} from "./tender-buttons";

function errorDetail(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) return error.message;
  return null;
}

function numericAmount(value: string | undefined | null) {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function hasPositiveAmount(value: string | undefined | null) {
  const amount = numericAmount(value);
  return amount != null && amount > 0;
}

function isZeroAmount(value: string | undefined | null) {
  const amount = numericAmount(value);
  return amount != null && amount === 0;
}

function tenderMethod(tender: CheckoutTender): CheckoutPaymentMethod | null {
  if (tender === "Cash") return "CASH";
  if (tender === "ManualCard") return "MANUAL_CARD";
  if (tender === "Other") return "OTHER";
  return null;
}

function paymentMethodLabel(method: string) {
  if (method === "CASH") return "Cash";
  if (method === "MANUAL_CARD") return "Card · recorded manually";
  if (method === "OTHER") return "Other recorded payment";
  return method.replaceAll("_", " ").toLowerCase();
}

export function CheckoutDrawer({
  check,
  canWrite,
  locale = "en",
  onCheckChanged,
}: {
  check: GuestCheck;
  canWrite: boolean;
  locale?: string;
  onCheckChanged: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [paymentState, setPaymentState] =
    useState<CheckoutPaymentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [pendingTender, setPendingTender] = useState<CheckoutTender | null>(null);
  const [closingCheck, setClosingCheck] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [issue, setIssue] = useState<CheckoutIssueKind | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const loadPreview = useCallback(
    async (useExpectedVersion: boolean): Promise<CheckoutPreview | null> => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setIssue("offline");
        setDetail(null);
        setLoading(false);
        return null;
      }

      setLoading(true);
      setDetail(null);
      try {
        const next = await previewCheckout(
          check.id,
          useExpectedVersion ? check.version : undefined,
        );
        setPreview(next);
        setIssue(null);
        return next;
      } catch (error) {
        const nextIssue = classifyCheckoutError(error);
        if (nextIssue === "conflict" && useExpectedVersion) {
          setIssue("conflict");
          try {
            const latest = await previewCheckout(check.id);
            setPreview(latest);
            return latest;
          } catch (reloadError) {
            setPreview(null);
            setIssue(classifyCheckoutError(reloadError));
            setDetail(errorDetail(reloadError));
            return null;
          }
        }

        setPreview(null);
        setIssue(nextIssue);
        setDetail(errorDetail(error));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [check.id, check.version],
  );

  const loadPaymentState = useCallback(
    async (settlementId: string): Promise<CheckoutPaymentState | null> => {
      try {
        const next = await fetchCheckoutPaymentState(settlementId);
        setPaymentState(next);
        return next;
      } catch (error) {
        setPaymentState(null);
        setPaymentError(errorDetail(error));
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    setPreview(null);
    setIssue(null);
    setPaymentError(null);
    void loadPreview(true);
  }, [loadPreview]);

  useEffect(() => {
    setSplitOpen(false);
    setMergeOpen(false);
    setPendingTender(null);
    setPaymentError(null);
    setCloseError(null);
    if (check.currentSettlementId) {
      void loadPaymentState(check.currentSettlementId);
    } else {
      setPaymentState(null);
    }
  }, [check.id, check.currentSettlementId, loadPaymentState]);

  async function handleSourceChanged() {
    setPaymentState(null);
    setSplitOpen(false);
    setPendingTender(null);
    setPaymentError(null);
    setCloseError(null);
    await onCheckChanged();
    await loadPreview(false);
  }

  async function ensureSettlement(): Promise<CheckoutPaymentState> {
    if (paymentState) return paymentState;

    if (check.currentSettlementId) {
      const existing = await fetchCheckoutPaymentState(check.currentSettlementId);
      setPaymentState(existing);
      return existing;
    }

    const expectedVersion = preview?.checkVersion ?? check.version;
    const settlement = await createCheckSettlement(check.id, expectedVersion);
    const next = await fetchCheckoutPaymentState(settlement.id);
    setPaymentState(next);
    await onCheckChanged();
    return next;
  }

  async function handleTender(tender: CheckoutTender) {
    if (!preview || paymentBusy) return;
    setPaymentError(null);
    setCloseError(null);

    if (tender !== "Split") {
      setPendingTender(tender);
      setSplitOpen(false);
      setMergeOpen(false);
      return;
    }

    setPendingTender(null);
    setPaymentBusy(true);
    try {
      const state = await ensureSettlement();
      if (state.state === "PAID" || isZeroAmount(state.amountDue)) return;
      setSplitOpen(true);
      setMergeOpen(false);
    } catch (error) {
      setPaymentError(errorDetail(error) ?? "Unable to prepare split payment.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function confirmPendingTender() {
    if (!pendingTender || !preview || paymentBusy) return;
    const method = tenderMethod(pendingTender);
    if (!method) return;

    setPaymentBusy(true);
    setPaymentError(null);
    setCloseError(null);
    try {
      const state = await ensureSettlement();
      if (state.state === "PAID" || isZeroAmount(state.amountDue)) {
        setPendingTender(null);
        return;
      }

      const groups = await previewPaymentGroups(state.settlementId, {
        mode: "REMAINING",
      });
      const group = groups.groups[0];
      if (!group) throw new Error("No remaining payment group was returned.");

      const next = await createCheckoutPayment(state.settlementId, {
        expectedCheckVersion: state.guestCheckVersion,
        method,
        allocationKind: "REMAINING",
        allocations: group.allocations.map((allocation) => ({
          snapshotId: allocation.snapshotId,
          amount: allocation.amount,
        })),
      });
      setPaymentState(next);
      setPendingTender(null);
      await onCheckChanged();
      await loadPreview(false);
    } catch (error) {
      setPaymentError(errorDetail(error) ?? "Unable to record payment.");
    } finally {
      setPaymentBusy(false);
    }
  }

  async function handleSplitPaymentRecorded(next: CheckoutPaymentState) {
    setPaymentState(next);
    setPaymentError(null);
    setCloseError(null);
    await onCheckChanged();
    await loadPreview(false);
  }

  async function handleMergeChanged() {
    setPaymentState(null);
    setSplitOpen(false);
    setPendingTender(null);
    setPaymentError(null);
    setCloseError(null);
    await onCheckChanged();
    await loadPreview(false);
  }

  async function refreshCheckout() {
    setCloseError(null);
    setPaymentError(null);
    await onCheckChanged();
    await loadPreview(false);
    if (check.currentSettlementId) {
      await loadPaymentState(check.currentSettlementId);
    }
  }

  const blockingIssue =
    issue === "offline" ||
    issue === "disabled" ||
    issue === "unauthorized" ||
    issue === "error";

  const displayName =
    check.label?.trim() || check.guestName?.trim() || "Guest check";
  const paymentStarted = hasPositiveAmount(paymentState?.paidAmount);
  const zeroValueBill =
    Boolean(preview && preview.lines.length > 0) && isZeroAmount(preview?.amountDue);
  const fullyPaid = paymentState
    ? paymentState.state === "PAID" ||
      paymentState.state === "CLOSED" ||
      isZeroAmount(paymentState.amountDue)
    : zeroValueBill;
  const blockers = checkoutOperationalBlockers(check);
  const billEditable = canWrite && !paymentStarted && !fullyPaid;
  const paymentsEnabled =
    canWrite &&
    !blockingIssue &&
    !fullyPaid &&
    hasPositiveAmount(paymentState?.amountDue ?? preview?.amountDue);
  const pendingMethod = pendingTender ? tenderMethod(pendingTender) : null;
  const pendingAmount = paymentState?.amountDue ?? preview?.amountDue ?? "0.0000";
  const paymentCurrency = paymentState?.currency ?? preview?.currency ?? check.currency ?? "PLN";

  async function finishCheck() {
    if (!fullyPaid || closingCheck) return;
    if (blockers.length > 0) {
      setCloseError(
        "Payment is complete, but a live order or play session is still open. Finish it first; do not charge the customer again.",
      );
      return;
    }

    setClosingCheck(true);
    setCloseError(null);
    try {
      await ensureSettlement();
      await closeCheckoutCheck(check.id);
      await onCheckChanged();
    } catch (error) {
      setCloseError(checkoutCloseErrorMessage(error));
    } finally {
      setClosingCheck(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950/20">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-white sm:text-lg">
              {displayName}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {check.guestName?.trim()
                ? `${check.guestName} · ${check.partySize} guest${check.partySize === 1 ? "" : "s"}`
                : `Check #${check.id.slice(0, 8)} · ${check.partySize} guest${check.partySize === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {billEditable ? (
            <button
              type="button"
              onClick={() => {
                setMergeOpen((current) => !current);
                setSplitOpen(false);
                setPendingTender(null);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-sky-400/30 hover:bg-sky-400/10"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Merge / move
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void refreshCheckout()}
            disabled={loading || paymentBusy || closingCheck}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-white/8 p-3 sm:p-4">
        <CheckoutFlowStatus
          check={check}
          lineCount={preview?.lines.length ?? 0}
          paymentStarted={paymentStarted}
          fullyPaid={fullyPaid}
          locale={locale}
        />
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_22rem] xl:overflow-hidden">
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-y-contain p-3 sm:p-4">
          {mergeOpen ? (
            <CheckMergePanel
              currentCheck={check}
              locked={paymentStarted || fullyPaid}
              locale={locale}
              onChanged={handleMergeChanged}
              onClose={() => setMergeOpen(false)}
            />
          ) : null}

          {splitOpen && paymentState ? (
            <SplitPaymentPanel
              settlementId={paymentState.settlementId}
              initialVersion={paymentState.guestCheckVersion}
              initialState={paymentState}
              locale={locale}
              onPaymentRecorded={handleSplitPaymentRecorded}
              onClose={() => setSplitOpen(false)}
            />
          ) : null}

          {paymentStarted && !fullyPaid ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100">
              Partially paid. The bill is now locked so already-recorded payment allocations cannot drift or be moved.
            </div>
          ) : null}

          {!fullyPaid ? (
            <CheckoutSourcePicker
              check={check}
              canWrite={billEditable}
              locale={locale}
              onChanged={handleSourceChanged}
            />
          ) : null}

          <SettlementStatus
            loading={loading && !preview}
            issue={issue}
            detail={detail}
          />

          {paymentError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-400/[0.07] px-3 py-2.5 text-xs leading-5 text-red-200">
              {paymentError}
            </div>
          ) : null}

          {preview ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Current bill
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    This is the exact bill GoSpots will use for payment.
                  </p>
                </div>
                <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                  {preview.lines.length} line{preview.lines.length === 1 ? "" : "s"}
                </span>
              </div>
              <ChargeGroups
                lines={preview.lines}
                currency={preview.currency}
                locale={locale}
              />
            </section>
          ) : null}
        </div>

        <aside className="border-t border-white/8 bg-black/15 p-3 xl:min-h-0 xl:overflow-y-auto xl:overscroll-y-contain xl:border-l xl:border-t-0 xl:p-4">
          <div className="space-y-3 pb-1">
            {preview ? (
              <CheckoutTotals
                preview={preview}
                paymentState={paymentState}
                locale={locale}
              />
            ) : null}

            {paymentState?.payments.length ? (
              <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Recorded payments
                </p>
                <div className="mt-2 divide-y divide-white/7">
                  {paymentState.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span className="font-medium text-zinc-300">
                        {paymentMethodLabel(payment.method)}
                      </span>
                      <span className="font-bold tabular-nums text-emerald-300">
                        {formatCheckoutMoney(payment.amount, payment.currency, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {pendingMethod && preview && !fullyPaid ? (
              <PaymentConfirmation
                method={pendingMethod}
                amount={pendingAmount}
                currency={paymentCurrency}
                locale={locale}
                busy={paymentBusy}
                onCancel={() => setPendingTender(null)}
                onConfirm={() => void confirmPendingTender()}
              />
            ) : preview && !blockingIssue && !fullyPaid ? (
              <TenderButtons
                canWrite={canWrite}
                busy={loading || paymentBusy}
                paymentsEnabled={paymentsEnabled}
                onSelect={(tender) => void handleTender(tender)}
              />
            ) : null}

            {fullyPaid ? (
              blockers.length > 0 ? (
                <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-3">
                  <p className="text-sm font-bold text-amber-200">Paid — activity still open</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Do not charge again. Finish the live order or play session shown above, then refresh Checkout.
                  </p>
                  {closeError ? (
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-black/15 px-3 py-2 text-xs leading-5 text-amber-100">
                      {closeError}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={loading || closingCheck}
                    onClick={() => void refreshCheckout()}
                    className="mt-3 min-h-11 w-full rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/15 disabled:opacity-45"
                  >
                    Refresh after finishing activity
                  </button>
                </section>
              ) : (
                <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-3">
                  <p className="text-sm font-bold text-emerald-200">Ready to close</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Payment is complete. Closing does not charge the customer again; it only finalizes and archives this guest check.
                  </p>
                  {closeError ? (
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-xs leading-5 text-amber-100">
                      {closeError}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canWrite || closingCheck}
                    onClick={() => void finishCheck()}
                    className="mt-3 min-h-11 w-full rounded-xl bg-emerald-400 px-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-45"
                  >
                    {closingCheck ? "Closing…" : "Close paid check"}
                  </button>
                </section>
              )
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
