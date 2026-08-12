"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  CircleDollarSign,
  ListChecks,
  Loader2,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  TimerOff,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createCheckSettlement,
  createCheckoutPayment,
  fetchCheckoutPaymentState,
  previewCheckout,
  previewPaymentGroups,
  type CheckoutPaymentMethod,
  type CheckoutPaymentState,
  type CheckoutPreview,
} from "@/lib/checkout-client";
import {
  fetchGuestCheck,
  settleGuestCheck,
  updateGuestCheck,
  voidGuestCheck,
  type GuestCheck,
} from "@/lib/guest-check-client";
import { updateShopOrder } from "@/lib/finance-client";
import { updateWalkIn } from "@/lib/play-billing-client";
import { ChargeGroups } from "./charge-groups";
import { CheckMergePanel } from "./check-merge-panel";
import { CheckoutSourcePicker } from "./checkout-source-picker";
import { CheckoutTotals } from "./checkout-totals";
import {
  checkoutErrorMessage,
  operationalCheckoutBlockers,
  paymentMethodLabel,
  type OperationalCheckoutBlocker,
} from "./checkout-flow";
import {
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

function hasPositiveAmount(value: string | undefined | null) {
  if (!value) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function tenderMethod(tender: CheckoutTender): CheckoutPaymentMethod | null {
  if (tender === "Cash") return "CASH";
  if (tender === "ManualCard") return "MANUAL_CARD";
  if (tender === "Other") return "OTHER";
  return null;
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
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [pendingTender, setPendingTender] = useState<CheckoutTender | null>(null);
  const [closingCheck, setClosingCheck] = useState(false);
  const [voidingCheck, setVoidingCheck] = useState(false);
  const [activityBusyId, setActivityBusyId] = useState<string | null>(null);
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
            setDetail(checkoutErrorMessage(reloadError));
            return null;
          }
        }

        setPreview(null);
        setIssue(nextIssue);
        setDetail(checkoutErrorMessage(error));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [check.id, check.version],
  );

  const loadPaymentState = useCallback(
    async (settlementId: string): Promise<CheckoutPaymentState | null> => {
      setPaymentLoading(true);
      try {
        const next = await fetchCheckoutPaymentState(settlementId);
        setPaymentState(next);
        setPaymentError(null);
        return next;
      } catch (error) {
        setPaymentState(null);
        setPaymentError(
          checkoutErrorMessage(error, "Could not load recorded payment state."),
        );
        return null;
      } finally {
        setPaymentLoading(false);
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
      setPaymentLoading(false);
    }
  }, [check.id, check.currentSettlementId, loadPaymentState]);

  async function refreshEverything() {
    setCloseError(null);
    setPaymentError(null);
    try {
      const latest = await fetchGuestCheck(check.id);
      await onCheckChanged();
      await loadPreview(false);
      if (latest.currentSettlementId) {
        await loadPaymentState(latest.currentSettlementId);
      } else {
        setPaymentState(null);
      }
    } catch (error) {
      setPaymentError(checkoutErrorMessage(error, "Could not refresh checkout."));
    }
  }

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
    if (!preview || paymentBusy || operationalBlockers.length > 0) return;
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
      if (state.state === "PAID" || state.amountDue === "0.0000") return;
      setSplitOpen(true);
      setMergeOpen(false);
    } catch (error) {
      setPaymentError(
        checkoutErrorMessage(error, "Unable to prepare split payment."),
      );
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
    try {
      const state = await ensureSettlement();
      if (state.state === "PAID" || state.amountDue === "0.0000") {
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
      setPaymentError(checkoutErrorMessage(error, "Unable to record payment."));
    } finally {
      setPaymentBusy(false);
    }
  }

  async function handleSplitPaymentRecorded(next: CheckoutPaymentState) {
    setPaymentState(next);
    setPaymentError(null);
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

  async function finalizeActivity(blocker: OperationalCheckoutBlocker) {
    if (!canWrite || activityBusyId) return;
    setActivityBusyId(blocker.sourceId);
    setPaymentError(null);
    setCloseError(null);
    try {
      if (blocker.sourceType === "SHOP_ORDER") {
        await updateShopOrder(blocker.sourceId, { status: "COMPLETED" });
      } else {
        // End the timer and freeze the amount, but do not stamp this play as paid.
        // Checkout V2 writes the paid/revenue stamp from the immutable settlement
        // when the cashier closes the fully-paid check.
        await updateWalkIn(blocker.sourceId, { endSession: true });
      }

      let currentPaymentState = paymentState;
      if (!currentPaymentState && check.currentSettlementId) {
        currentPaymentState = await fetchCheckoutPaymentState(
          check.currentSettlementId,
        ).catch(() => null);
      }
      if (
        check.currentSettlementId &&
        currentPaymentState &&
        !hasPositiveAmount(currentPaymentState.paidAmount)
      ) {
        await updateGuestCheck(check.id, {});
        setPaymentState(null);
      }

      await onCheckChanged();
      await loadPreview(false);
    } catch (error) {
      setPaymentError(
        checkoutErrorMessage(error, "Could not finalize this activity."),
      );
    } finally {
      setActivityBusyId(null);
    }
  }

  async function finishCheck() {
    if (!fullyPaid || closingCheck) return;
    setClosingCheck(true);
    setCloseError(null);
    try {
      const latest = await fetchGuestCheck(check.id);
      const latestBlockers = operationalCheckoutBlockers(latest);
      if (latestBlockers.length > 0) {
        await onCheckChanged();
        setCloseError(
          `Finish ${latestBlockers.length} open ${latestBlockers.length === 1 ? "activity" : "activities"} before closing this check.`,
        );
        return;
      }
      await settleGuestCheck(check.id);
      await onCheckChanged();
    } catch (error) {
      setCloseError(
        checkoutErrorMessage(
          error,
          "Payment is complete, but the check could not be closed yet.",
        ),
      );
    } finally {
      setClosingCheck(false);
    }
  }

  async function handleVoidCheck() {
    if (!canWrite || paymentStarted || fullyPaid || voidingCheck) return;
    const confirmed = window.confirm(
      "Void this unpaid check? Linked orders, bookings and sessions will be detached, not canceled.",
    );
    if (!confirmed) return;
    setVoidingCheck(true);
    setPaymentError(null);
    try {
      await voidGuestCheck(check.id);
      await onCheckChanged();
    } catch (error) {
      setPaymentError(checkoutErrorMessage(error, "Could not void this check."));
    } finally {
      setVoidingCheck(false);
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
  const fullyPaid =
    paymentState?.state === "PAID" || paymentState?.amountDue === "0.0000";
  const hasCharges = (preview?.lines.length ?? 0) > 0;
  const operationalBlockers = operationalCheckoutBlockers(check);
  const billFinalized = operationalBlockers.length === 0;
  const unresolvedSettlement =
    Boolean(check.currentSettlementId) && paymentLoading && !paymentState;
  const billEditable =
    canWrite && !paymentStarted && !fullyPaid && !unresolvedSettlement;
  const paymentsEnabled =
    canWrite &&
    !blockingIssue &&
    !paymentLoading &&
    !fullyPaid &&
    billFinalized &&
    hasCharges &&
    hasPositiveAmount(paymentState?.amountDue ?? preview?.amountDue);
  const pendingMethod = pendingTender ? tenderMethod(pendingTender) : null;
  const pendingAmount = paymentState?.amountDue ?? preview?.amountDue ?? "0.0000";
  const paymentCurrency =
    paymentState?.currency ?? preview?.currency ?? check.currency ?? "PLN";
  const recoveryMode = paymentStarted && operationalBlockers.length > 0;

  return (
    <div className="min-w-0 bg-zinc-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-white sm:text-lg">
                {displayName}
              </h2>
              <CheckoutStateBadge
                hasCharges={hasCharges}
                paymentStarted={paymentStarted}
                fullyPaid={fullyPaid}
                blockers={operationalBlockers.length}
              />
            </div>
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
          {!paymentStarted && !fullyPaid && canWrite ? (
            <button
              type="button"
              onClick={() => void handleVoidCheck()}
              disabled={voidingCheck}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.04] px-3 py-2 text-xs font-semibold text-rose-200/80 transition hover:border-rose-400/30 hover:bg-rose-400/[0.08] disabled:opacity-50"
            >
              {voidingCheck ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Void
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void refreshEverything()}
            disabled={loading || paymentLoading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading || paymentLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <CheckoutFlowProgress
          hasCharges={hasCharges}
          blockers={operationalBlockers.length}
          paymentStarted={paymentStarted}
          fullyPaid={fullyPaid}
        />
      </div>

      <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4 px-3 pb-4 sm:px-4">
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
              <div className="flex items-start gap-2">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">Partial payment recorded</p>
                  <p className="mt-0.5 text-amber-100/70">
                    The bill is now locked. Record the remaining payment here; do not
                    edit or move paid items.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {recoveryMode ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-3 text-xs leading-5 text-amber-100">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">Payment exists on an unfinished bill</p>
                  <p className="mt-0.5 text-amber-100/75">
                    This is a recovery state from the previous checkout flow. Do not
                    charge the guest again. Finish the open activity below, then close
                    the check.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {billEditable && !paymentStarted ? (
            <CheckoutSourcePicker
              check={check}
              canWrite={billEditable}
              locale={locale}
              onChanged={handleSourceChanged}
            />
          ) : null}

          {operationalBlockers.length > 0 ? (
            <BillFinalizationPanel
              blockers={operationalBlockers}
              busyId={activityBusyId}
              canWrite={canWrite}
              recoveryMode={recoveryMode}
              onFinalize={finalizeActivity}
            />
          ) : hasCharges && !paymentStarted ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-3 text-xs leading-5 text-emerald-100">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <div>
                  <p className="font-bold text-emerald-200">Bill is final</p>
                  <p className="mt-0.5 text-emerald-100/70">
                    Open orders are handed off and standalone play timers are ended.
                    You can now take payment without the amount changing underneath
                    the cashier.
                  </p>
                </div>
              </div>
            </div>
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
                  <h3 className="text-sm font-semibold text-zinc-100">Current bill</h3>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    This is exactly what will be snapshotted for payment.
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

        <aside className="border-t border-white/8 bg-black/15 p-3 sm:p-4 xl:border-l xl:border-t-0">
          <div className="space-y-3 xl:sticky xl:top-4">
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
                    <div
                      key={payment.id}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <span className="font-medium text-zinc-300">
                        {paymentMethodLabel(payment.method)}
                      </span>
                      <span className="font-bold tabular-nums text-emerald-300">
                        {formatCheckoutMoney(
                          payment.amount,
                          payment.currency,
                          locale,
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {!fullyPaid && operationalBlockers.length > 0 ? (
              <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.055] p-3">
                <div className="flex items-start gap-2.5">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-sm font-bold text-amber-200">Payment locked</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">
                      Finish {operationalBlockers.length} open{" "}
                      {operationalBlockers.length === 1 ? "activity" : "activities"}{" "}
                      first. GoSpots will then calculate a final, stable bill.
                    </p>
                  </div>
                </div>
              </section>
            ) : pendingMethod && preview && !fullyPaid ? (
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
                busy={loading || paymentLoading || paymentBusy}
                paymentsEnabled={paymentsEnabled}
                onSelect={(tender) => void handleTender(tender)}
              />
            ) : null}

            {fullyPaid ? (
              <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <div>
                    <p className="text-sm font-bold text-emerald-200">Payment complete</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">
                      {operationalBlockers.length > 0
                        ? `Do not charge again. Finish ${operationalBlockers.length} open ${operationalBlockers.length === 1 ? "activity" : "activities"}, then close this check.`
                        : "No balance remains. Close the check to finish the transaction. Booking and ended-play billing stamps are finalized automatically."}
                    </p>
                  </div>
                </div>
                {closeError ? (
                  <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-xs leading-5 text-amber-100">
                    {closeError}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={
                    !canWrite ||
                    closingCheck ||
                    operationalBlockers.length > 0
                  }
                  onClick={() => void finishCheck()}
                  className="mt-3 min-h-11 w-full rounded-xl bg-emerald-400 px-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {closingCheck ? "Closing…" : "Close check"}
                </button>
              </section>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function CheckoutStateBadge({
  hasCharges,
  paymentStarted,
  fullyPaid,
  blockers,
}: {
  hasCharges: boolean;
  paymentStarted: boolean;
  fullyPaid: boolean;
  blockers: number;
}) {
  if (fullyPaid) {
    return (
      <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
        {blockers ? "Paid · activity open" : "Paid · ready to close"}
      </span>
    );
  }
  if (paymentStarted) {
    return (
      <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
        Partially paid
      </span>
    );
  }
  if (hasCharges && blockers === 0) {
    return (
      <span className="rounded-full bg-sky-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-300">
        Ready for payment
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
      Building bill
    </span>
  );
}

function CheckoutFlowProgress({
  hasCharges,
  blockers,
  paymentStarted,
  fullyPaid,
}: {
  hasCharges: boolean;
  blockers: number;
  paymentStarted: boolean;
  fullyPaid: boolean;
}) {
  const steps = [
    {
      icon: ListChecks,
      label: "1 · Build bill",
      detail: paymentStarted ? "Locked" : hasCharges ? "Items added" : "Add items",
      done: hasCharges,
      active: !hasCharges,
    },
    {
      icon: PackageCheck,
      label: "2 · Finalize",
      detail: blockers ? `${blockers} open` : hasCharges ? "Bill stable" : "After items",
      done: hasCharges && blockers === 0,
      active: hasCharges && blockers > 0,
    },
    {
      icon: CircleDollarSign,
      label: "3 · Payment",
      detail: fullyPaid
        ? "Paid"
        : paymentStarted
          ? "Partial"
          : blockers === 0 && hasCharges
            ? "Ready"
            : "Waiting",
      done: fullyPaid,
      active: hasCharges && blockers === 0 && !fullyPaid,
    },
    {
      icon: CheckCircle2,
      label: "4 · Close",
      detail: fullyPaid && blockers === 0 ? "Ready" : "After payment",
      done: false,
      active: fullyPaid && blockers === 0,
    },
  ];

  return (
    <section
      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Checkout workflow"
    >
      {steps.map((step) => {
        const Icon = step.icon;
        return (
          <div
            key={step.label}
            className={`rounded-xl border px-3 py-2.5 ${
              step.done
                ? "border-emerald-400/20 bg-emerald-400/[0.055]"
                : step.active
                  ? "border-sky-400/25 bg-sky-400/[0.06]"
                  : "border-white/7 bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon
                className={`h-3.5 w-3.5 ${
                  step.done
                    ? "text-emerald-300"
                    : step.active
                      ? "text-sky-300"
                      : "text-zinc-600"
                }`}
              />
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-300">
                {step.label}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{step.detail}</p>
          </div>
        );
      })}
    </section>
  );
}

function BillFinalizationPanel({
  blockers,
  busyId,
  canWrite,
  recoveryMode,
  onFinalize,
}: {
  blockers: OperationalCheckoutBlocker[];
  busyId: string | null;
  canWrite: boolean;
  recoveryMode: boolean;
  onFinalize: (blocker: OperationalCheckoutBlocker) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-400/20 bg-amber-400/[0.045]">
      <div className="border-b border-amber-400/10 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-bold text-amber-100">
              {recoveryMode
                ? "Finish activity — do not charge again"
                : "Finalize the bill before payment"}
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {recoveryMode
                ? "These items were left open by the previous checkout flow. Closing them here does not create another checkout payment."
                : "GoSpots blocks payment while an order or play timer can still change the final amount."}
            </p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-white/6">
        {blockers.map((blocker) => {
          const isOrder = blocker.sourceType === "SHOP_ORDER";
          const Icon = isOrder ? PackageCheck : TimerOff;
          const busy = busyId === blocker.sourceId;
          return (
            <div
              key={`${blocker.sourceType}-${blocker.sourceId}`}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-amber-300">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">
                    {blocker.label}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {isOrder
                      ? `Order is ${blocker.status.toLowerCase()} · confirm it was handed off`
                      : `Play timer is ${blocker.status.toLowerCase()} · end the timer to freeze the bill`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={!canWrite || busyId !== null}
                onClick={() => void onFinalize(blocker)}
                className="min-h-10 shrink-0 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-400/15 disabled:opacity-45"
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </span>
                ) : isOrder ? (
                  "Mark handed off"
                ) : (
                  "End session"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
