"use client";

import {
  Banknote,
  CheckCircle2,
  EyeOff,
  Loader2,
  LockKeyhole,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveCashVariance,
  closeCashSession,
  createCashMovement,
  fetchMyShift,
  openCashSession,
  submitCashCount,
  type CashMovementType,
  type MyShiftResponse,
} from "@/lib/cash-client";
import { formatCheckoutMoney } from "@/components/checkout/checkout-presenter";

function message(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Cash operation failed.";
}

const MANUAL_TYPES: Array<{
  value: Exclude<CashMovementType, "CASH_SALE">;
  label: string;
  hint: string;
}> = [
  { value: "PAY_IN", label: "Pay in", hint: "Add physical cash to the drawer." },
  { value: "PAY_OUT", label: "Pay out", hint: "Remove cash for an operating expense." },
  { value: "CASH_REFUND", label: "Cash refund", hint: "Cash returned to a guest." },
  { value: "SAFE_DROP", label: "Safe drop", hint: "Move excess cash from drawer to safe." },
];

export function MyShiftWorkspace({ locale = "en" }: { locale?: string }) {
  const [data, setData] = useState<MyShiftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [movementType, setMovementType] = useState<Exclude<CashMovementType, "CASH_SALE">>("PAY_IN");
  const [movementAmount, setMovementAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [countedAmount, setCountedAmount] = useState("");
  const [countResult, setCountResult] = useState<null | {
    cashCountId: string;
    countedAmount: string;
    expectedCash: string;
    variance: string;
    requiresApproval: boolean;
    approvalStatus: "PENDING" | "APPROVED" | null;
  }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMyShift());
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = data?.policy.currency ?? "PLN";
  const session = data?.session ?? null;
  const money = useCallback(
    (amount: string) => formatCheckoutMoney(amount, currency, locale),
    [currency, locale],
  );

  const selectedMovement = useMemo(
    () => MANUAL_TYPES.find((item) => item.value === movementType)!,
    [movementType],
  );

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen() {
    await run(() => openCashSession({ openingFloat }), () => {
      setOpeningFloat("0.00");
      setCountResult(null);
    });
  }

  async function handleMovement() {
    if (!session) return;
    await run(
      () =>
        createCashMovement(session.id, {
          type: movementType,
          amount: movementAmount,
          reasonCategory: reason,
          note: note || undefined,
        }),
      () => {
        setMovementAmount("");
        setReason("");
        setNote("");
        setCountResult(null);
      },
    );
  }

  async function handleCount() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitCashCount(session.id, countedAmount);
      setCountResult({
        cashCountId: result.cashCountId,
        countedAmount: result.countedAmount,
        expectedCash: result.expectedCash,
        variance: result.variance,
        requiresApproval: result.requiresApproval,
        approvalStatus: result.approvalStatus,
      });
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!session || !countResult) return;
    await run(
      () => approveCashVariance(session.id, countResult.cashCountId),
      () =>
        setCountResult((current) =>
          current ? { ...current, approvalStatus: "APPROVED" } : current,
        ),
    );
  }

  async function handleClose() {
    if (!session || !countResult) return;
    await run(
      () => closeCashSession(session.id, countResult.cashCountId),
      () => {
        setCountedAmount("");
        setCountResult(null);
      },
    );
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">My Shift</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Physical cash is reconciled separately from checkout revenue.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-300 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!session ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.045] p-5">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <Banknote className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-white">Open cash session</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">
                Enter the physical opening float. Cash checkout is {data?.policy.cashSessionRequired ? "blocked until this shift is open" : "allowed without a session by venue policy"}.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="block min-w-[13rem]">
              <span className="text-xs font-semibold text-zinc-400">Opening float · {currency}</span>
              <input
                value={openingFloat}
                onChange={(event) => setOpeningFloat(event.target.value)}
                inputMode="decimal"
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-emerald-400/50"
              />
            </label>
            <button
              type="button"
              disabled={busy || !data?.permissions.canOpen}
              onClick={() => void handleOpen()}
              className="min-h-11 rounded-xl bg-emerald-400 px-4 text-sm font-black text-emerald-950 disabled:opacity-40"
            >
              {busy ? "Opening…" : "Open shift"}
            </button>
          </div>
          {!data?.permissions.canOpen ? (
            <p className="mt-3 text-xs text-amber-300">You need cash.open permission to start a drawer session.</p>
          ) : null}
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Opening float" value={money(session.openingFloat)} />
            <Metric
              label="Expected drawer"
              value={session.expectedCash ? money(session.expectedCash) : "Hidden until count"}
              icon={session.expectedHidden ? <EyeOff className="h-4 w-4" /> : undefined}
            />
            <Metric label="Cash sales" value={money(session.movementTotals.cashSales)} />
            <Metric
              label="Cash out"
              value={money(
                String(
                  Number(session.movementTotals.payOuts) +
                    Number(session.movementTotals.cashRefunds) +
                    Number(session.movementTotals.safeDrops),
                ),
              )}
            />
          </div>

          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Open drawer</p>
                <h3 className="mt-1 font-bold text-white">{session.drawer.name}</h3>
                <p className="mt-1 text-xs text-zinc-600">Opened {new Date(session.openedAt).toLocaleString(locale)}</p>
              </div>
              {data?.policy.cashBlindCountEnabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-400/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
                  <LockKeyhole className="h-3.5 w-3.5" /> Blind count policy
                </span>
              ) : null}
            </div>
          </section>

          {data?.permissions.canMove ? (
            <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <div className="mb-4">
                <h3 className="font-bold text-white">Manual cash movement</h3>
                <p className="mt-1 text-xs text-zinc-500">Every manual movement requires a reason and is written to audit history.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label>
                  <span className="text-xs font-semibold text-zinc-400">Movement</span>
                  <select
                    value={movementType}
                    onChange={(event) => setMovementType(event.target.value as Exclude<CashMovementType, "CASH_SALE">)}
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white"
                  >
                    {MANUAL_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-xs font-semibold text-zinc-400">Amount · {currency}</span>
                  <input
                    value={movementAmount}
                    onChange={(event) => setMovementAmount(event.target.value)}
                    inputMode="decimal"
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white"
                  />
                </label>
                <label>
                  <span className="text-xs font-semibold text-zinc-400">Reason category</span>
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="petty-cash, refund…"
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white"
                  />
                </label>
                <label>
                  <span className="text-xs font-semibold text-zinc-400">Note · optional</span>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-zinc-600">{selectedMovement.hint}</p>
                <button
                  type="button"
                  disabled={busy || !movementAmount || !reason.trim()}
                  onClick={() => void handleMovement()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-xs font-black text-zinc-950 disabled:opacity-40"
                >
                  {movementType === "PAY_IN" ? <PlusCircle className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}
                  Record movement
                </button>
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <h3 className="font-bold text-white">Drawer activity</h3>
              <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                {session.movements.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-600">No cash movement yet.</p>
                ) : (
                  [...session.movements].reverse().map((movement) => (
                    <div key={movement.id} className="flex items-center gap-3 rounded-xl border border-white/7 bg-black/15 px-3 py-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-zinc-400">
                        {movement.type === "CASH_SALE" || movement.type === "PAY_IN" ? <PlusCircle className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-200">{movement.type.replaceAll("_", " ")}</p>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-600">{movement.reasonCategory}{movement.note ? ` · ${movement.note}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-zinc-100">{money(movement.amount)}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-600">{new Date(movement.occurredAt).toLocaleTimeString(locale)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.045] p-4">
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-amber-300" />
                <h3 className="font-bold text-white">Close shift</h3>
              </div>
              {data?.permissions.canClose ? (
                <>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {data.policy.cashBlindCountEnabled && !data.permissions.canViewExpected
                      ? "Enter the physical drawer count without seeing the expected amount."
                      : "Count the physical drawer, then reconcile and close."}
                  </p>
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-zinc-400">Counted cash · {currency}</span>
                    <input
                      value={countedAmount}
                      onChange={(event) => {
                        setCountedAmount(event.target.value);
                        setCountResult(null);
                      }}
                      inputMode="decimal"
                      className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !countedAmount}
                    onClick={() => void handleCount()}
                    className="mt-3 min-h-10 w-full rounded-xl border border-amber-400/30 bg-amber-400/10 text-xs font-black text-amber-200 disabled:opacity-40"
                  >
                    Submit count
                  </button>

                  {countResult ? (
                    <div className="mt-4 space-y-2 rounded-xl border border-white/8 bg-black/20 p-3 text-sm">
                      <Pair label="Expected" value={money(countResult.expectedCash)} />
                      <Pair label="Counted" value={money(countResult.countedAmount)} />
                      <Pair label="Variance" value={money(countResult.variance)} />
                      {countResult.requiresApproval && countResult.approvalStatus !== "APPROVED" ? (
                        <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-2.5 text-xs leading-5 text-amber-200">
                          Variance exceeds {money(data.policy.cashVarianceApprovalThreshold)} and needs approval.
                          {data.permissions.canApproveVariance ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleApprove()}
                              className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg bg-amber-300 px-3 font-black text-amber-950"
                            >
                              <ShieldCheck className="h-4 w-4" /> Approve variance
                            </button>
                          ) : (
                            <span className="mt-1 block text-zinc-500">A manager/owner with cash.approve_variance must approve it in Shift Reports.</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" /> Ready to close
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={
                          busy ||
                          (countResult.requiresApproval && countResult.approvalStatus !== "APPROVED")
                        }
                        onClick={() => void handleClose()}
                        className="mt-2 min-h-10 w-full rounded-xl bg-emerald-400 text-xs font-black text-emerald-950 disabled:opacity-40"
                      >
                        Close cash session
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-xs leading-5 text-amber-200">You need cash.close permission to count and close this session.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">{icon}{label}</div>
      <p className="mt-2 text-xl font-black tabular-nums text-white">{value}</p>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}
