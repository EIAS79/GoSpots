"use client";

import { Check, Loader2, RefreshCw, Split, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createCheckoutPayment,
  previewPaymentGroups,
  type CheckoutPaymentMethod,
  type CheckoutPaymentState,
  type PaymentAllocationKind,
  type PaymentGroupPreview,
  type PaymentGroupsPreview,
} from "@/lib/checkout-client";
import { fetchDevices } from "@/lib/device-client";
import {
  cancelProviderCheckoutPayment,
  collectProviderCheckoutPayment,
  reconcileProviderCheckoutPayment,
  type ProviderCheckoutIntent,
  type ProviderCheckoutPaymentOperation,
  type ProviderCheckoutResult,
} from "@/lib/provider-checkout-client";
import { formatCheckoutMoney } from "./checkout-presenter";
import { PaymentConfirmation } from "./payment-confirmation";
import { ProviderPaymentRecoveryPanel } from "./provider-payment-recovery";

const MODES: Array<{
  key: PaymentAllocationKind;
  label: string;
  description: string;
}> = [
  { key: "EQUAL", label: "Equal", description: "2–20 equal parts" },
  { key: "LINE", label: "By item", description: "One group per bill line" },
  { key: "SOURCE", label: "By source", description: "Order, play or booking" },
  { key: "PERCENTAGE", label: "%", description: "A percentage of remaining" },
  { key: "CUSTOM", label: "Custom", description: "Enter exact payment amounts" },
  { key: "REMAINING", label: "Remaining", description: "Everything still due" },
];

const METHODS: Array<{ key: CheckoutPaymentMethod; label: string }> = [
  { key: "CASH", label: "Cash" },
  { key: "MANUAL_CARD", label: "Card terminal" },
  { key: "OTHER", label: "Other" },
];

type ProviderAttempt = {
  operation: ProviderCheckoutPaymentOperation;
  intent: ProviderCheckoutIntent;
  groupKey: string;
};

type TerminalOption = { id: string; label: string };

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Unable to complete this checkout action.";
}

function parseCustomAmounts(raw: string): string[] {
  return raw
    .split(/[,+\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

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

export function SplitPaymentPanel({
  settlementId,
  initialVersion,
  initialState,
  locale = "en",
  onPaymentRecorded,
  onClose,
}: {
  settlementId: string;
  initialVersion: number;
  initialState: CheckoutPaymentState | null;
  locale?: string;
  onPaymentRecorded: (state: CheckoutPaymentState) => Promise<void> | void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PaymentAllocationKind>("EQUAL");
  const [parts, setParts] = useState(2);
  const [percentage, setPercentage] = useState("50");
  const [customAmounts, setCustomAmounts] = useState("");
  const [preview, setPreview] = useState<PaymentGroupsPreview | null>(null);
  const [paymentState, setPaymentState] = useState<CheckoutPaymentState | null>(
    initialState,
  );
  const [paidGroupKeys, setPaidGroupKeys] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<{
    group: PaymentGroupPreview;
    method: CheckoutPaymentMethod;
  } | null>(null);
  const [building, setBuilding] = useState(false);
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerAttempt, setProviderAttempt] = useState<ProviderAttempt | null>(
    null,
  );
  const [terminalOptions, setTerminalOptions] = useState<TerminalOption[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const currentVersion = paymentState?.guestCheckVersion ?? initialVersion;
  const amountDue = paymentState?.amountDue ?? preview?.amountDue ?? null;
  const paidAmount = paymentState?.paidAmount ?? "0.0000";
  const currency = paymentState?.currency ?? preview?.currency ?? "PLN";
  const isPaid = paymentState?.state === "PAID" || amountDue === "0.0000";

  const request = useMemo(() => {
    if (mode === "EQUAL") return { mode, parts } as const;
    if (mode === "PERCENTAGE") {
      return { mode, percentage: Number(percentage) } as const;
    }
    if (mode === "CUSTOM") {
      return { mode, customAmounts: parseCustomAmounts(customAmounts) } as const;
    }
    return { mode } as const;
  }, [customAmounts, mode, parts, percentage]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
          .map((device) => ({ id: device.terminal!.id, label: device.label }));
        if (cancelled) return;
        setTerminalOptions(options);
        setSelectedTerminalId(options.length === 1 ? options[0].id : "");
        setTerminalError(
          options.length === 0
            ? "No claimed, enabled Adyen terminal is available for card payment."
            : null,
        );
      } catch (err) {
        if (cancelled) return;
        setTerminalOptions([]);
        setSelectedTerminalId("");
        setTerminalError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function buildGroups() {
    if (providerAttempt) return;
    setBuilding(true);
    setError(null);
    setPending(null);
    try {
      const next = await previewPaymentGroups(settlementId, request);
      setPreview(next);
      setPaidGroupKeys(new Set());
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    } finally {
      setBuilding(false);
    }
  }

  async function applyProviderResult(
    result: ProviderCheckoutResult,
    intent: ProviderCheckoutIntent,
    groupKey: string,
  ) {
    if (result.paymentState) setPaymentState(result.paymentState);

    if (
      result.operation.state === "CAPTURED" &&
      result.operation.checkoutPaymentId &&
      !result.checkoutFinalizationRequired
    ) {
      setProviderAttempt(null);
      setPaidGroupKeys((current) => new Set([...current, groupKey]));
      setPending(null);
      if (result.paymentState) {
        await onPaymentRecorded(result.paymentState);
        if (result.paymentState.state === "PAID") {
          setPreview(null);
          onClose();
        }
      }
      return;
    }

    if (
      result.operation.state === "FAILED" ||
      result.operation.state === "CANCELED"
    ) {
      setProviderAttempt(null);
      setPending(null);
      setError(
        result.operation.errorMessage ||
          (result.operation.state === "FAILED"
            ? "The card payment failed or was declined. No split payment was recorded."
            : "The terminal payment was canceled. No split payment was recorded."),
      );
      return;
    }

    if (
      providerNeedsRecovery(result.operation) ||
      result.checkoutFinalizationRequired
    ) {
      setProviderAttempt({ operation: result.operation, intent, groupKey });
      setPending(null);
      setError(null);
      return;
    }

    setError(
      `Terminal payment returned ${result.operation.state}. Resolve it before another tender.`,
    );
  }

  async function payGroup(
    group: PaymentGroupPreview,
    method: CheckoutPaymentMethod,
  ) {
    if (paidGroupKeys.has(group.key) || payingKey || providerAttempt) return;
    const operationKey = `${group.key}:${method}`;
    setPayingKey(operationKey);
    setError(null);
    try {
      const allocations = group.allocations.map((allocation) => ({
        snapshotId: allocation.snapshotId,
        amount: allocation.amount,
      }));

      if (method === "MANUAL_CARD") {
        if (!selectedTerminalId) {
          throw new Error("Select an Adyen payment terminal before continuing.");
        }
        const intent: ProviderCheckoutIntent = {
          allocationKind: group.allocationKind,
          allocations,
        };
        const result = await collectProviderCheckoutPayment(settlementId, {
          expectedCheckVersion: currentVersion,
          provider: "adyen",
          terminalId: selectedTerminalId,
          allocationKind: intent.allocationKind,
          allocations: intent.allocations,
        });
        await applyProviderResult(result, intent, group.key);
        return;
      }

      const next = await createCheckoutPayment(settlementId, {
        expectedCheckVersion: currentVersion,
        method,
        allocationKind: group.allocationKind,
        allocations,
      });
      setPaymentState(next);
      setPaidGroupKeys((current) => new Set([...current, group.key]));
      setPending(null);
      await onPaymentRecorded(next);
      if (next.state === "PAID") {
        setPreview(null);
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPayingKey(null);
    }
  }

  async function reconcileProviderAttempt() {
    if (!providerAttempt || payingKey) return;
    setPayingKey(`provider:${providerAttempt.operation.id}:reconcile`);
    setError(null);
    try {
      const result = await reconcileProviderCheckoutPayment(
        providerAttempt.operation.id,
        {
          expectedCheckVersion: paymentState?.guestCheckVersion ?? currentVersion,
          allocationKind: providerAttempt.intent.allocationKind,
          allocations: providerAttempt.intent.allocations,
        },
      );
      await applyProviderResult(
        result,
        providerAttempt.intent,
        providerAttempt.groupKey,
      );
    } catch (err) {
      setError(
        `${errorMessage(err)} Do not retry the card until the provider outcome is known.`,
      );
    } finally {
      setPayingKey(null);
    }
  }

  async function cancelProviderAttempt() {
    if (!providerAttempt || payingKey) return;
    setPayingKey(`provider:${providerAttempt.operation.id}:cancel`);
    setError(null);
    try {
      const result = await cancelProviderCheckoutPayment(
        providerAttempt.operation.id,
      );
      await applyProviderResult(
        result,
        providerAttempt.intent,
        providerAttempt.groupKey,
      );
    } catch (err) {
      setError(
        `${errorMessage(err)} Check the provider status before another card attempt.`,
      );
    } finally {
      setPayingKey(null);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-400/25 bg-zinc-950 shadow-2xl shadow-black/40">
      <div className="flex items-start justify-between gap-4 border-b border-white/8 p-4">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <Split className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-bold text-white">Split & mixed payment</h3>
            <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
              Build payment groups on the server, then choose and confirm a tender
              for each group. Card groups are sent through the configured Adyen
              terminal and are recorded only after provider capture.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={Boolean(providerAttempt)}
          title={
            providerAttempt
              ? "Resolve the active terminal payment before closing split payment."
              : "Close split payment"
          }
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Close split payment"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-4">
          {providerAttempt ? (
            <ProviderPaymentRecoveryPanel
              operation={providerAttempt.operation}
              locale={locale}
              busy={payingKey !== null}
              canCancel={providerCanCancel(providerAttempt.operation)}
              onReconcile={() => void reconcileProviderAttempt()}
              onCancel={() => void cancelProviderAttempt()}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MODES.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={Boolean(providerAttempt)}
                onClick={() => {
                  setMode(item.key);
                  setPreview(null);
                  setPending(null);
                  setPaidGroupKeys(new Set());
                }}
                className={`rounded-xl border p-3 text-left transition disabled:opacity-40 ${
                  mode === item.key
                    ? "border-emerald-400/50 bg-emerald-400/10"
                    : "border-white/8 bg-white/[0.025] hover:bg-white/[0.05]"
                }`}
              >
                <span className="block text-sm font-semibold text-zinc-100">
                  {item.label}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-zinc-500">
                  {item.description}
                </span>
              </button>
            ))}
          </div>

          {mode === "EQUAL" ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <label className="text-xs font-semibold text-zinc-400">
                Number of parts
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6].map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={Boolean(providerAttempt)}
                    onClick={() => setParts(value)}
                    className={`h-10 min-w-10 rounded-lg border text-sm font-bold transition disabled:opacity-40 ${
                      parts === value
                        ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                        : "border-white/8 bg-black/20 text-zinc-300"
                    }`}
                  >
                    {value}
                  </button>
                ))}
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={parts}
                  disabled={Boolean(providerAttempt)}
                  onChange={(event) => setParts(Number(event.target.value))}
                  className="h-10 w-20 rounded-lg border border-white/8 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/50 disabled:opacity-40"
                />
              </div>
            </div>
          ) : null}

          {mode === "PERCENTAGE" ? (
            <label className="block rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <span className="text-xs font-semibold text-zinc-400">
                Percentage of remaining balance
              </span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0.0001"
                  max="100"
                  step="0.01"
                  value={percentage}
                  disabled={Boolean(providerAttempt)}
                  onChange={(event) => setPercentage(event.target.value)}
                  className="h-10 w-28 rounded-lg border border-white/8 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/50 disabled:opacity-40"
                />
                <span className="text-sm text-zinc-500">%</span>
              </div>
            </label>
          ) : null}

          {mode === "CUSTOM" ? (
            <label className="block rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <span className="text-xs font-semibold text-zinc-400">
                Custom payment amounts
              </span>
              <input
                value={customAmounts}
                disabled={Boolean(providerAttempt)}
                onChange={(event) => setCustomAmounts(event.target.value)}
                placeholder="20, 30, 15.50"
                className="mt-2 h-10 w-full rounded-lg border border-white/8 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-emerald-400/50 disabled:opacity-40"
              />
              <span className="mt-1 block text-[11px] text-zinc-600">
                Separate amounts with commas. They may cover part or all of the
                remaining balance.
              </span>
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => void buildGroups()}
            disabled={building || isPaid || Boolean(providerAttempt)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {building ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Build payment groups
          </button>

          {error ? (
            <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-3 py-2.5 text-xs leading-5 text-red-200">
              {error}
            </div>
          ) : null}

          {preview ? (
            <div className="space-y-2">
              {preview.groups.map((group, index) => {
                const paid = paidGroupKeys.has(group.key);
                const confirming = pending?.group.key === group.key;
                return (
                  <article
                    key={group.key}
                    className={`rounded-xl border p-3 ${
                      paid
                        ? "border-emerald-400/20 bg-emerald-400/[0.06]"
                        : "border-white/8 bg-white/[0.025]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="grid h-6 w-6 place-items-center rounded-md bg-white/[0.05] text-[11px] font-bold text-zinc-400">
                            {index + 1}
                          </span>
                          <h4 className="text-sm font-semibold text-zinc-100">
                            {group.label}
                          </h4>
                          {paid ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                              <Check className="h-3 w-3" /> Paid
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xl font-black tabular-nums text-white">
                          {formatCheckoutMoney(group.amount, group.currency, locale)}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-600">
                          {group.allocations.length} allocation
                          {group.allocations.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      {!paid && !confirming ? (
                        <div className="flex flex-wrap gap-1.5">
                          {METHODS.map((method) => (
                            <button
                              key={method.key}
                              type="button"
                              disabled={Boolean(payingKey || pending || providerAttempt)}
                              onClick={() => setPending({ group, method: method.key })}
                              className="min-h-9 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-semibold text-zinc-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 disabled:opacity-40"
                            >
                              {method.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {confirming && pending ? (
                      <div className="mt-3">
                        <PaymentConfirmation
                          method={pending.method}
                          amount={group.amount}
                          currency={group.currency}
                          locale={locale}
                          busy={payingKey !== null}
                          terminalOptions={terminalOptions}
                          selectedTerminalId={selectedTerminalId}
                          terminalError={terminalError}
                          onTerminalChange={setSelectedTerminalId}
                          onCancel={() => setPending(null)}
                          onConfirm={() => void payGroup(group, pending.method)}
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>

        <aside className="h-fit rounded-xl border border-white/8 bg-black/25 p-3 lg:sticky lg:top-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            Settlement
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3 text-zinc-500">
              <span>Paid</span>
              <span className="font-semibold tabular-nums text-emerald-300">
                {formatCheckoutMoney(paidAmount, currency, locale)}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-zinc-400">
              <span>Remaining</span>
              <span className="font-bold tabular-nums text-white">
                {amountDue == null
                  ? "—"
                  : formatCheckoutMoney(amountDue, currency, locale)}
              </span>
            </div>
          </div>
          {isPaid ? (
            <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
              Check fully paid
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
