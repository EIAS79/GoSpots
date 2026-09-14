"use client";

import { CheckCircle2, CreditCard, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fetchDevices, type VenueDevice } from "@/lib/device-client";

type PaymentOperationState =
  | "CREATED"
  | "PROCESSING"
  | "REQUIRES_ACTION"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "CANCELED"
  | "UNKNOWN"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

type PaymentOperation = {
  id: string;
  provider: string;
  providerPaymentId: string | null;
  state: PaymentOperationState;
  amount: string;
  currency: string;
  errorCode: string | null;
  errorMessage: string | null;
  capturedAt: string | null;
};

function isTerminalState(state: PaymentOperationState) {
  return state === "CAPTURED" || state === "FAILED" || state === "CANCELED";
}

function operationMessage(operation: PaymentOperation) {
  if (operation.state === "CAPTURED") {
    return "Adyen captured the €1.00 test payment on the physical terminal.";
  }
  if (operation.state === "FAILED") {
    return operation.errorMessage || "Adyen rejected the test payment.";
  }
  if (operation.state === "CANCELED") {
    return "The terminal payment was canceled.";
  }
  if (operation.state === "UNKNOWN") {
    return "The provider outcome is uncertain. Reconcile this operation before trying another payment.";
  }
  if (operation.state === "PROCESSING") {
    return "The same Adyen payment is still processing. Do not start another payment.";
  }
  return `Terminal payment state: ${operation.state}.`;
}

export function PaymentTerminalCertificationPanel({
  canWrite = true,
}: {
  canWrite?: boolean;
}) {
  const [devices, setDevices] = useState<VenueDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<PaymentOperation | null>(null);
  const attemptKey = useRef<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDevices();
      setDevices(result.devices);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load payment terminals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const terminal = devices.find(
    (device) =>
      device.type === "PAYMENT_TERMINAL" &&
      device.status === "ACTIVE" &&
      device.provider?.toLowerCase() === "adyen" &&
      device.terminal?.enabled &&
      Boolean(device.terminal.id),
  );
  const hasActiveAttempt = Boolean(operation && !isTerminalState(operation.state));

  function applyOperation(result: PaymentOperation) {
    setOperation(result);
    if (isTerminalState(result.state)) attemptKey.current = null;
  }

  async function startTestPayment() {
    if (!terminal?.terminal?.id || busy || hasActiveAttempt) return;
    setBusy(true);
    setError(null);
    try {
      const key = attemptKey.current ?? crypto.randomUUID();
      attemptKey.current = key;
      const result = await api<PaymentOperation>("/payments/operations", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          provider: "adyen",
          terminalId: terminal.terminal.id,
          amount: "1.00",
          currency: "EUR",
          metadata: {
            purpose: "phase17_terminal_certification",
            deviceId: terminal.id,
          },
        }),
      });
      applyOperation(result);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Could not start the Adyen terminal payment.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshOperation() {
    if (!operation || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<PaymentOperation>(`/payments/operations/${operation.id}`);
      applyOperation(result);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh the terminal payment.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcile() {
    if (!operation || operation.state !== "UNKNOWN" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<PaymentOperation>(`/payments/operations/${operation.id}/reconcile`, {
        method: "POST",
      });
      applyOperation(result);
    } catch (reconcileError) {
      setError(reconcileError instanceof Error ? reconcileError.message : "Could not reconcile the terminal payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <CreditCard className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold text-white">Payment terminal certification</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
              Phase 17 provider test. Sends a real €1.00 TEST transaction from GoSpots to the registered Adyen terminal.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh terminal
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading terminal…
          </div>
        ) : terminal ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">{terminal.label}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Adyen · {terminal.claimState === "CLAIMED" ? "Claimed" : "Unclaimed"}
              </p>
            </div>
            {canWrite ? (
              <button
                type="button"
                onClick={() => void startTestPayment()}
                disabled={busy || hasActiveAttempt}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-xs font-bold text-zinc-950 hover:bg-emerald-300 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {hasActiveAttempt ? "Payment already in progress" : "Send €1.00 test payment"}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-amber-200">No active Adyen payment terminal is registered for this venue.</p>
        )}
      </div>

      {operation ? (
        <div
          className={`mt-3 rounded-xl border px-3 py-3 text-xs leading-5 ${
            operation.state === "CAPTURED"
              ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"
              : operation.state === "FAILED" || operation.state === "CANCELED"
                ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-200"
                : "border-amber-400/20 bg-amber-400/[0.06] text-amber-200"
          }`}
        >
          <div className="flex items-start gap-2">
            {operation.state === "CAPTURED" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : operation.state === "FAILED" || operation.state === "CANCELED" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              <p className="font-semibold">{operationMessage(operation)}</p>
              <p className="mt-1 opacity-70">Operation {operation.id}</p>
              {operation.state === "UNKNOWN" && canWrite ? (
                <button
                  type="button"
                  onClick={() => void reconcile()}
                  disabled={busy}
                  className="mt-2 rounded-lg border border-current/20 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  Reconcile outcome
                </button>
              ) : null}
              {operation.state !== "UNKNOWN" && !isTerminalState(operation.state) ? (
                <button
                  type="button"
                  onClick={() => void refreshOperation()}
                  disabled={busy}
                  className="mt-2 rounded-lg border border-current/20 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  Check current payment
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
