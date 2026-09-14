"use client";

import {
  ArrowLeftRight,
  RefreshCw,
  ReceiptText,
  Trash2,
} from "lucide-react";
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
import { fetchDevices } from "@/lib/device-client";
import {
  cancelProviderCheckoutPayment,
  collectProviderCheckoutPayment,
  fetchActiveProviderCheckoutPayment,
  reconcileProviderCheckoutPayment,
  type ProviderCheckoutIntent,
  type ProviderCheckoutPaymentOperation,
  type ProviderCheckoutResult,
} from "@/lib/provider-checkout-client";
import {
  updateGuestCheck,
  voidGuestCheck,
  type GuestCheck,
} from "@/lib/guest-check-client";
import { ApiError } from "@/lib/api";
import { ChargeGroups } from "./charge-groups";
import { CheckMergePanel } from "./check-merge-panel";
import { CheckoutFlowStatus } from "./checkout-flow-status";
import { CheckoutSourcePicker } from "./checkout-source-picker";
import { CheckoutTotals } from "./checkout-totals";
import {
  checkoutBillBlockers,
  checkoutCloseErrorMessage,
  checkoutErrorMessage,
  checkoutOperationalBlockers,
  classifyCheckoutError,
  formatCheckoutMoney,
  type CheckoutIssueKind,
} from "./checkout-presenter";
import { PaymentConfirmation } from "./payment-confirmation";
import { ProviderPaymentRecoveryPanel } from "./provider-payment-recovery";
import { SettlementStatus } from "./settlement-status";
import { SplitPaymentPanel } from "./split-payment-panel";
import {
  TenderButtons,
  type CheckoutTender,
} from "./tender-buttons";

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
  if (tender === "Card") return "MANUAL_CARD";
  if (tender === "Other") return "OTHER";
  return null;
}

function paymentMethodLabel(method: string) {
  if (method === "CASH") return "Cash";
  if (method === "MANUAL_CARD") return "Card";
  if (method === "OTHER") return "Other recorded payment";
  return method.replaceAll("_", " ").toLowerCase();
}

type ProviderAttempt = {
  operation: ProviderCheckoutPaymentOperation;
  intent: ProviderCheckoutIntent | null;
};

type TerminalOption = { id: string; label: string };

function providerNeedsRecovery(operation: ProviderCheckoutPaymentOperation) {
  return (
    operation.reconciliationRequired ||
    operation.state === "CREATED" ||
    operation.state === "PROCESSING" ||
    operation.state === "REQUIRES_ACTION" ||
    operation.state === "AUTHORIZED" ||
    (operation.state === "CAPTURED" && !operation.checkoutPaymentId)
  );
}

function providerCanCancel(operation: ProviderCheckoutPaymentOperation) {
  return (
    operation.state === "CREATED" ||
    operation.state === "PROCESSING" ||
    operation.state === "REQUIRES_ACTION" ||
    operation.state === "AUTHORIZED"
  );
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
  const [voidingCheck, setVoidingCheck] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [issue, setIssue] = useState<CheckoutIssueKind | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [providerAttempt, setProviderAttempt] = useState<ProviderAttempt | null>(
    null,
  );
  const [terminalOptions, setTerminalOptions] = useState<TerminalOption[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [terminalError, setTerminalError] = useState<string | null>(null);

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
      try {
        const next = await fetchCheckoutPaymentState(settlementId);
        setPaymentState(next);
        return next;
      } catch (error) {
        setPaymentState(null);
        setPaymentError(
          checkoutErrorMessage(error, "Could not load recorded payment state."),
        );
        return null;
      }
    },
    [],
  );

  const loadProviderAttempt = useCallback(async (settlementId: string) => {
    try {
      const active = await fetchActiveProviderCheckoutPayment(settlementId);
      if (!active) {
        setProviderAttempt(null);
        return null;
      }
      setPaymentState(active.paymentState);
      setProviderAttempt({
        operation: active.operation,
        intent: active.intent,
      });
      return active;
    } catch (error) {
      setPaymentError(
        checkoutErrorMessage(
          error,
          "Could not load the active terminal payment. Do not retry the card until the payment state is known.",
        ),
      );
      return null;
    }
  }, []);

  const loadTerminals = useCallback(async () => {
    try {
      const result = await fetchDevices();
      const options = result.devices
        .filter(
          (device) =>
            device.type === "PAYMENT_TERMINAL" &&
            device.status === "ACTIVE" &&
            device.claimState === "CLAIMED" &&
            device.terminal?.enabled === true &&
            device.terminal.provider.trim().toLowerCase() === "adyen" &&
            Boolean(device.terminal.externalTerminalId?.trim()),
        )
        .map((device) => ({
          id: device.terminal!.id,
          label: device.label,
        }));
      setTerminalOptions(options);
      setSelectedTerminalId((current) => {
        if (current && options.some((option) => option.id === current)) {
          return current;
        }
        return options.length === 1 ? options[0].id : "";
      });
      setTerminalError(
        options.length === 0
          ? "No claimed, enabled Adyen terminal is available. Configure the terminal under Settings → Devices before taking card payment."
          : null,
      );
      return options;
    } catch (error) {
      setTerminalOptions([]);
      setSelectedTerminalId("");
      setTerminalError(
        checkoutErrorMessage(error, "Could not load payment terminals."),
      );
      return [];
    }
  }, []);

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
    setProviderAttempt(null);
    setPaymentError(null);
    setCloseError(null);
    if (check.currentSettlementId) {
      void Promise.all([
        loadPaymentState(check.currentSettlementId),
        loadProviderAttempt(check.currentSettlementId),
      ]);
    } else {
      setPaymentState(null);
    }
  }, [
    check.id,
    check.currentSettlementId,
    loadPaymentState,
    loadProviderAttempt,
  ]);

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

  async function recoverStaleUnpaidSettlement(error: unknown) {
    if (
      !(error instanceof ApiError) ||
      error.code !== "VERSION_CONFLICT" ||
      !check.currentSettlementId ||
      !paymentState ||
      hasPositiveAmount(paymentState.paidAmount) ||
      providerAttempt
    ) {
      return false;
    }

    try {
      await updateGuestCheck(check.id, {});
      setPaymentState(null);
      setPendingTender(null);
      await onCheckChanged();
      await loadPreview(false);
      setPaymentError(
        "The bill changed after it was calculated, so GoSpots discarded the old unpaid snapshot. Review the refreshed bill and take payment again only after it is final.",
      );
      return true;
    } catch {
      return false;
    }
  }

  async function handleTender(tender: CheckoutTender) {
    if (!preview || paymentBusy || providerAttempt) return;
    if (billBlockers.length > 0) {
      setPaymentError(
        "Payment is locked until every open order is handed off and every running standalone play timer is ended.",
      );
      return;
    }
    setPaymentError(null);
    setCloseError(null);

    if (tender === "Card") {
      setPaymentBusy(true);
      await loadTerminals();
      setPaymentBusy(false);
    }

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
      if (await recoverStaleUnpaidSettlement(error)) return;
      setPaymentError(
        checkoutErrorMessage(error, "Unable to prepare split payment."),
      );
    } finally {
      setPaymentBusy(false);
    }
  }

  async function applyProviderResult(
    result: ProviderCheckoutResult,
    intent: ProviderCheckoutIntent,
  ) {
    if (result.paymentState) setPaymentState(result.paymentState);

    if (
      result.operation.state === "CAPTURED" &&
      result.operation.checkoutPaymentId &&
      !result.checkoutFinalizationRequired
    ) {
      setProviderAttempt(null);
      setPendingTender(null);
      setPaymentError(null);
      await onCheckChanged();
      await loadPreview(false);
      return;
    }

    if (
      result.operation.state === "FAILED" ||
      result.operation.state === "CANCELED"
    ) {
      setProviderAttempt(null);
      setPendingTender(null);
      setPaymentError(
        result.operation.errorMessage ||
          (result.operation.state === "FAILED"
            ? "The card payment was declined or failed. No checkout payment was recorded."
            : "The terminal payment was canceled. No checkout payment was recorded."),
      );
      await onCheckChanged();
      await loadPreview(false);
      return;
    }

    if (
      providerNeedsRecovery(result.operation) ||
      result.checkoutFinalizationRequired
    ) {
      setProviderAttempt({ operation: result.operation, intent });
      setPendingTender(null);
      setPaymentError(null);
      if (result.paymentState) setPaymentState(result.paymentState);
      await onCheckChanged();
      return;
    }

    setPaymentError(
      `Terminal payment returned ${result.operation.state}. Refresh the payment state before another card attempt.`,
    );
  }

  async function confirmPendingTender() {
    if (!pendingTender || !preview || paymentBusy || providerAttempt) return;
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
      const allocations = group.allocations.map((allocation) => ({
        snapshotId: allocation.snapshotId,
        amount: allocation.amount,
      }));

      if (method === "MANUAL_CARD") {
        if (!selectedTerminalId) {
          throw new Error("Select an Adyen payment terminal before continuing.");
        }
        const intent: ProviderCheckoutIntent = {
          allocationKind: "REMAINING",
          allocations,
        };
        const result = await collectProviderCheckoutPayment(state.settlementId, {
          expectedCheckVersion: state.guestCheckVersion,
          provider: "adyen",
          terminalId: selectedTerminalId,
          allocationKind: intent.allocationKind,
          allocations: intent.allocations,
        });
        await applyProviderResult(result, intent);
        return;
      }

      const next = await createCheckoutPayment(state.settlementId, {
        expectedCheckVersion: state.guestCheckVersion,
        method,
        allocationKind: "REMAINING",
        allocations,
      });
      setPaymentState(next);
      setPendingTender(null);
      await onCheckChanged();
      await loadPreview(false);
    } catch (error) {
      if (await recoverStaleUnpaidSettlement(error)) return;
      setPaymentError(
        checkoutErrorMessage(error, "Unable to complete payment."),
      );
    } finally {
      setPaymentBusy(false);
    }
  }

  async function reconcileProviderAttempt() {
    if (!providerAttempt || paymentBusy) return;
    if (!providerAttempt.intent) {
      setPaymentError(
        "This terminal attempt predates recoverable checkout allocation metadata. Do not retry the card; resolve the provider payment manually before continuing.",
      );
      return;
    }
    const currentVersion = paymentState?.guestCheckVersion;
    if (!currentVersion) {
      setPaymentError("Reload checkout payment state before reconciliation.");
      return;
    }

    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const result = await reconcileProviderCheckoutPayment(
        providerAttempt.operation.id,
        {
          expectedCheckVersion: currentVersion,
          allocationKind: providerAttempt.intent.allocationKind,
          allocations: providerAttempt.intent.allocations,
        },
      );
      await applyProviderResult(result, providerAttempt.intent);
    } catch (error) {
      setPaymentError(
        checkoutErrorMessage(
          error,
          "Could not reconcile the terminal payment. Do not retry the card.",
        ),
      );
    } finally {
      setPaymentBusy(false);
    }
  }

  async function cancelProviderAttempt() {
    if (!providerAttempt || paymentBusy) return;
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const result = await cancelProviderCheckoutPayment(
        providerAttempt.operation.id,
      );
      await applyProviderResult(
        result,
        providerAttempt.intent ?? {
          allocationKind: "REMAINING",
          allocations: [],
        },
      );
    } catch (error) {
      setPaymentError(
        checkoutErrorMessage(
          error,
          "Could not cancel the terminal payment. Check its provider status before retrying.",
        ),
      );
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
      await Promise.all([
        loadPaymentState(check.currentSettlementId),
        loadProviderAttempt(check.currentSettlementId),
      ]);
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
  const billBlockers = checkoutBillBlockers(check);
  const blockers = checkoutOperationalBlockers(check);
  const providerBlocking = providerAttempt !== null;
  const billEditable =
    canWrite && !paymentStarted && !fullyPaid && !providerBlocking;
  const paymentsEnabled =
    canWrite &&
    !blockingIssue &&
    !fullyPaid &&
    !providerBlocking &&
    billBlockers.length === 0 &&
    hasPositiveAmount(paymentState?.amountDue ?? preview?.amountDue);
  const pendingMethod = pendingTender ? tenderMethod(pendingTender) : null;
  const pendingAmount = paymentState?.amountDue ?? preview?.amountDue ?? "0.0000";
  const paymentCurrency =
    paymentState?.currency ?? preview?.currency ?? check.currency ?? "PLN";

  async function finishCheck() {
    if (!fullyPaid || closingCheck || providerBlocking) return;
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

  async function handleVoidCheck() {
    if (
      !canWrite ||
      paymentStarted ||
      fullyPaid ||
      voidingCheck ||
      providerBlocking
    ) {
      return;
    }
    const confirmed = window.confirm(
      "Void this unpaid guest check? Its linked activity will be detached, not canceled.",
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

  return (
    <div className="min-w-0 bg-zinc-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
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
          {!paymentStarted && !fullyPaid && canWrite && !providerBlocking ? (
            <button
              type="button"
              onClick={() => void handleVoidCheck()}
              disabled={voidingCheck}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.04] px-3 py-2 text-xs font-semibold text-rose-200/80 transition hover:border-rose-400/30 hover:bg-rose-400/[0.08] disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {voidingCheck ? "Voiding…" : "Void"}
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

      <div className="border-b border-white/8 p-3 sm:p-4">
        <CheckoutFlowStatus
          check={check}
          lineCount={preview?.lines.length ?? 0}
          paymentStarted={paymentStarted}
          fullyPaid={fullyPaid}
          locale={locale}
        />
      </div>

      <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4 p-3 sm:p-4">
          {mergeOpen ? (
            <CheckMergePanel
              currentCheck={check}
              locked={paymentStarted || fullyPaid || providerBlocking}
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
              Partially paid. The bill is locked so recorded payment allocations cannot drift or be moved. Finish the remaining payment from this checkout.
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
                    This is the bill GoSpots will snapshot for payment once the open activity above is final.
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
          <div className="space-y-3 pb-1 xl:sticky xl:top-4">
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

            {providerAttempt ? (
              <ProviderPaymentRecoveryPanel
                operation={providerAttempt.operation}
                locale={locale}
                busy={paymentBusy}
                canCancel={providerCanCancel(providerAttempt.operation)}
                onReconcile={() => void reconcileProviderAttempt()}
                onCancel={() => void cancelProviderAttempt()}
              />
            ) : null}

            {!providerAttempt && pendingMethod && preview && !fullyPaid ? (
              <PaymentConfirmation
                method={pendingMethod}
                amount={pendingAmount}
                currency={paymentCurrency}
                locale={locale}
                busy={paymentBusy}
                terminalOptions={terminalOptions}
                selectedTerminalId={selectedTerminalId}
                terminalError={terminalError}
                onTerminalChange={setSelectedTerminalId}
                onCancel={() => setPendingTender(null)}
                onConfirm={() => void confirmPendingTender()}
              />
            ) : !providerAttempt && preview && !blockingIssue && !fullyPaid ? (
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
                  <p className="text-sm font-bold text-amber-200">
                    Paid — activity still open
                  </p>
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
                  <p className="text-sm font-bold text-emerald-200">
                    Ready to close
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Payment is complete. Closing does not charge the customer again; it reconciles billing state and archives this guest check.
                  </p>
                  {closeError ? (
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-xs leading-5 text-amber-100">
                      {closeError}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canWrite || closingCheck || providerBlocking}
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
