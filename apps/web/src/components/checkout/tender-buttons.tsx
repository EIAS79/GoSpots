"use client";

import { useConnectivityOptional } from "@/lib/connectivity-context";

export type CheckoutTender = "Cash" | "ManualCard" | "Split" | "Other";

const TENDERS: Array<{
  key: CheckoutTender;
  label: string;
  hint: string;
}> = [
  { key: "Cash", label: "Cash", hint: "Customer pays the remaining balance in cash" },
  {
    key: "ManualCard",
    label: "Card · external terminal",
    hint: "The card was approved on a separate terminal; record it in GoSpots",
  },
  { key: "Split", label: "Split payment", hint: "Use more than one payment method or split the amount" },
  { key: "Other", label: "Other received", hint: "Record another payment method that was already received" },
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
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Take payment
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">Choose how the customer actually paid.</p>
        </div>
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
          ? "Payments and final checkout are disabled offline. Reconnect before taking money."
          : paymentsEnabled
            ? "Cash posts to the open cash shift. Card · external terminal only records a card payment that was already approved elsewhere; GoSpots does not charge the card itself."
            : "Add at least one non-zero charge before taking payment."}
      </p>
    </section>
  );
}
