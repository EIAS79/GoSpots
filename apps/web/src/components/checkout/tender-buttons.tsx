"use client";

import { useConnectivityOptional } from "@/lib/connectivity-context";

export type CheckoutTender = "Cash" | "ManualCard" | "Split" | "Other";

const TENDERS: Array<{
  key: CheckoutTender;
  label: string;
  hint: string;
}> = [
  { key: "Cash", label: "Cash", hint: "Pay remaining balance in cash" },
  {
    key: "ManualCard",
    label: "Manual card",
    hint: "Record a card payment without a terminal connection",
  },
  { key: "Split", label: "Split", hint: "Split or mix several payments" },
  { key: "Other", label: "Other", hint: "Record another manual tender" },
];

export function TenderButtons({
  canWrite,
  busy = false,
  paymentsEnabled = false,
  onSelect,
}: {
  canWrite: boolean;
  busy?: boolean;
  paymentsEnabled?: boolean;
  onSelect?: (tender: CheckoutTender) => void;
}) {
  const connectivity = useConnectivityOptional();
  const onlineForFinance =
    connectivity == null ||
    (connectivity.browserOnline &&
      connectivity.mode !== "api_unreachable" &&
      connectivity.mode !== "api_unavailable");
  const enabled = canWrite && !busy && paymentsEnabled && onlineForFinance;

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Payment
        </p>
        {paymentsEnabled && onlineForFinance ? (
          <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            Ready
          </span>
        ) : !onlineForFinance ? (
          <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Online only
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TENDERS.map((tender) => (
          <button
            key={tender.key}
            type="button"
            disabled={!enabled}
            onClick={() => onSelect?.(tender.key)}
            title={!onlineForFinance ? "Payments are disabled while Offline Lite is active." : tender.hint}
            className="min-h-12 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:opacity-50"
          >
            {tender.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-600">
        {!onlineForFinance
          ? "Payments, final settlement and provider reconciliation are disabled offline. Continue supported check editing, then reconnect to take payment."
          : paymentsEnabled
            ? "Cash and manual tenders are recorded inside GoSpots. Manual card does not contact a terminal."
            : "Add at least one charge before taking payment."}
      </p>
    </section>
  );
}
