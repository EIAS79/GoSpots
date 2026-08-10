"use client";

import { ArrowLeftRight, RefreshCw, ReceiptText } from "lucide-react";
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
import type { GuestCheck } from "@/lib/guest-check-client";
import { ChargeGroups } from "./charge-groups";
import { CheckMergePanel } from "./check-merge-panel";
import { CheckoutSourcePicker } from "./checkout-source-picker";
import { CheckoutTotals } from "./checkout-totals";
import {
  classifyCheckoutError,
  type CheckoutIssueKind,
} from "./checkout-presenter";
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
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
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
    setPaymentError(null);
    if (check.currentSettlementId) {
      void loadPaymentState(check.currentSettlementId);
    } else {
      setPaymentState(null);
    }
  }, [check.id, check.currentSettlementId, loadPaymentState]);

  async function handleSourceChanged() {
    setPaymentState(null);
    setSplitOpen(false);
    setPaymentError(null);
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
    setPaymentBusy(true);
    try {
      const state = await ensureSettlement();
      if (state.state === "PAID" || state.amountDue === "0.0000") return;

      if (tender === "Split") {
        setSplitOpen(true);
        setMergeOpen(false);
        return;
      }

      const method = tenderMethod(tender);
      if (!method) return;
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
    await onCheckChanged();
    await loadPreview(false);
  }

  async function handleMergeChanged() {
    setPaymentState(null);
    setSplitOpen(false);
    setPaymentError(null);
    await onCheckChanged();
    await loadPreview(false);
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
  const billEditable = canWrite && !paymentStarted && !fullyPaid;
  const paymentsEnabled =
    canWrite &&
    !blockingIssue &&
    !fullyPaid &&
    hasPositiveAmount(paymentState?.amountDue ?? preview?.amountDue);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950/20">
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
          <button
            type="button"
            onClick={() => {
              setMergeOpen((current) => !current);
              setSplitOpen(false);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-sky-400/30 hover:bg-sky-400/10"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Merge / move
          </button>
          <button
            type="button"
            onClick={() => void loadPreview(false)}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
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

          {paymentStarted ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100">
              Payment has started. Bill sources are locked so paid allocations cannot
              be changed or moved.
            </div>
          ) : null}

          <CheckoutSourcePicker
            check={check}
            canWrite={billEditable}
            locale={locale}
            onChanged={handleSourceChanged}
          />

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
                    Items and attached activity included in this check.
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

        <aside className="border-t border-white/8 bg-black/15 p-4 xl:border-l xl:border-t-0 xl:p-5">
          <div className="space-y-4 xl:sticky xl:top-4">
            {preview ? (
              <CheckoutTotals
                preview={preview}
                paymentState={paymentState}
                locale={locale}
              />
            ) : null}
            {preview && !blockingIssue ? (
              <TenderButtons
                canWrite={canWrite}
                busy={loading || paymentBusy}
                paymentsEnabled={paymentsEnabled}
                onSelect={(tender) => void handleTender(tender)}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
