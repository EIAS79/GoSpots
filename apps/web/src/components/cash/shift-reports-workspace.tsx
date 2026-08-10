"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatCheckoutMoney } from "@/components/checkout/checkout-presenter";
import {
  approveCashVariance,
  fetchCashPolicy,
  fetchCashReports,
  updateCashPolicy,
  type CashPolicy,
  type CashSessionView,
} from "@/lib/cash-client";

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Unable to load shift reports.";
}

export function ShiftReportsWorkspace({
  locale = "en",
  canApproveVariance,
}: {
  locale?: string;
  canApproveVariance: boolean;
}) {
  const [sessions, setSessions] = useState<CashSessionView[]>([]);
  const [policy, setPolicy] = useState<(CashPolicy & { canManage: boolean }) | null>(null);
  const [draft, setDraft] = useState<CashPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reports, currentPolicy] = await Promise.all([
        fetchCashReports(100),
        fetchCashPolicy(),
      ]);
      setSessions(reports.sessions);
      setPolicy(currentPolicy);
      setDraft({
        cashSessionRequired: currentPolicy.cashSessionRequired,
        cashBlindCountEnabled: currentPolicy.cashBlindCountEnabled,
        cashVarianceApprovalThreshold:
          currentPolicy.cashVarianceApprovalThreshold,
        currency: currentPolicy.currency,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePolicy() {
    if (!draft || !policy?.canManage) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCashPolicy({
        cashSessionRequired: draft.cashSessionRequired,
        cashBlindCountEnabled: draft.cashBlindCountEnabled,
        cashVarianceApprovalThreshold:
          draft.cashVarianceApprovalThreshold,
      });
      setPolicy(updated);
      setDraft({
        cashSessionRequired: updated.cashSessionRequired,
        cashBlindCountEnabled: updated.cashBlindCountEnabled,
        cashVarianceApprovalThreshold: updated.cashVarianceApprovalThreshold,
        currency: updated.currency,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve(session: CashSessionView) {
    const count = session.latestCount;
    if (!count?.approval || count.approval.status !== "PENDING") return;
    setBusy(true);
    setError(null);
    try {
      await approveCashVariance(session.id, count.id, "Approved from Shift Reports");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const money = (value: string, currency: string) =>
    formatCheckoutMoney(value, currency, locale);

  if (loading && !policy) {
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
          <h2 className="text-xl font-black text-white">Shift Reports</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Expected cash, submitted counts, variances, approvals, and drawer movements.
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

      {policy && draft ? (
        <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-white">Cash policy</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Venue-wide rules for requiring shifts, blind counts, and variance approval.
              </p>
            </div>
            {policy.canManage ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePolicy()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-400 px-3 text-xs font-black text-emerald-950 disabled:opacity-40"
              >
                <Save className="h-4 w-4" /> Save policy
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="rounded-xl border border-white/8 bg-black/15 p-3">
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-zinc-200">
                Require open cash shift
                <input
                  type="checkbox"
                  disabled={!policy.canManage}
                  checked={draft.cashSessionRequired}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, cashSessionRequired: event.target.checked }
                        : current,
                    )
                  }
                  className="h-4 w-4 accent-emerald-400"
                />
              </span>
              <span className="mt-1 block text-xs leading-5 text-zinc-600">
                Block CASH checkout until the cashier opens My Shift.
              </span>
            </label>

            <label className="rounded-xl border border-white/8 bg-black/15 p-3">
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-zinc-200">
                Blind count
                <input
                  type="checkbox"
                  disabled={!policy.canManage}
                  checked={draft.cashBlindCountEnabled}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, cashBlindCountEnabled: event.target.checked }
                        : current,
                    )
                  }
                  className="h-4 w-4 accent-emerald-400"
                />
              </span>
              <span className="mt-1 block text-xs leading-5 text-zinc-600">
                Hide expected drawer cash from cashiers before count submission.
              </span>
            </label>

            <label className="rounded-xl border border-white/8 bg-black/15 p-3">
              <span className="text-sm font-semibold text-zinc-200">
                Approval threshold · {draft.currency}
              </span>
              <input
                value={draft.cashVarianceApprovalThreshold}
                disabled={!policy.canManage}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          cashVarianceApprovalThreshold: event.target.value,
                        }
                      : current,
                  )
                }
                inputMode="decimal"
                className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-white disabled:text-zinc-600"
              />
              <span className="mt-1 block text-xs leading-5 text-zinc-600">
                Absolute variance above this amount needs approval before close.
              </span>
            </label>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-zinc-600">
            No cash sessions have been opened yet.
          </div>
        ) : (
          sessions.map((session) => {
            const count = session.latestCount;
            const pendingApproval =
              count?.approval?.status === "PENDING" ? count.approval : null;
            return (
              <article
                key={session.id}
                className="rounded-2xl border border-white/8 bg-white/[0.025] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-white">{session.drawer.name}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          session.status === "OPEN"
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-white/[0.06] text-zinc-500"
                        }`}
                      >
                        {session.status}
                      </span>
                      {pendingApproval ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> Approval pending
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">
                      Opened {new Date(session.openedAt).toLocaleString(locale)} · cashier {session.openedById.slice(0, 8)}
                    </p>
                  </div>

                  {pendingApproval && canApproveVariance ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approve(session)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-300 px-3 text-xs font-black text-amber-950 disabled:opacity-40"
                    >
                      <ShieldCheck className="h-4 w-4" /> Approve variance
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                  <ReportMetric label="Opening" value={money(session.openingFloat, session.currency)} />
                  <ReportMetric label="Cash sales" value={money(session.movementTotals.cashSales, session.currency)} />
                  <ReportMetric label="Pay-ins" value={money(session.movementTotals.payIns, session.currency)} />
                  <ReportMetric label="Refunds" value={money(session.movementTotals.cashRefunds, session.currency)} />
                  <ReportMetric label="Pay-outs" value={money(session.movementTotals.payOuts, session.currency)} />
                  <ReportMetric label="Safe drops" value={money(session.movementTotals.safeDrops, session.currency)} />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <ReportMetric
                    strong
                    label="Expected drawer"
                    value={money(
                      session.closedExpectedCash ?? session.expectedCash ?? "0",
                      session.currency,
                    )}
                  />
                  <ReportMetric
                    strong
                    label="Counted"
                    value={
                      count
                        ? money(count.countedAmount, session.currency)
                        : session.countedCash
                          ? money(session.countedCash, session.currency)
                          : "Not counted"
                    }
                  />
                  <ReportMetric
                    strong
                    label="Variance"
                    value={
                      count
                        ? money(count.variance, session.currency)
                        : session.variance
                          ? money(session.variance, session.currency)
                          : "—"
                    }
                  />
                </div>

                {count ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {count.approval?.status === "APPROVED" ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" /> Variance approved
                      </span>
                    ) : count.approval?.status === "PENDING" ? (
                      <span className="text-amber-300">
                        Approval requested after count {new Date(count.submittedAt).toLocaleString(locale)}
                      </span>
                    ) : (
                      <span>Count submitted {new Date(count.submittedAt).toLocaleString(locale)}</span>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/7 bg-black/15 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </p>
      <p className={`mt-1 tabular-nums ${strong ? "text-base font-black text-white" : "text-sm font-bold text-zinc-200"}`}>
        {value}
      </p>
    </div>
  );
}
