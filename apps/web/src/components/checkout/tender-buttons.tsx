"use client";

import {
  Banknote,
  CreditCard,
  SplitSquareHorizontal,
  WalletCards,
} from "lucide-react";
import { useConnectivityOptional } from "@/lib/connectivity-context";

export type CheckoutTender = "Cash" | "Card" | "Split" | "Other";

const TENDERS = [
  {
    key: "Card" as const,
    label: "Card · terminal",
    detail:
      "Sends the charge through the configured venue payment terminal (Adyen). GoSpots only records payment after provider capture.",
    icon: CreditCard,
  },
  {
    key: "Cash" as const,
    label: "Cash",
    detail: "Receive cash and post it to the active cash shift.",
    icon: Banknote,
  },
  {
    key: "Split" as const,
    label: "Split payment",
    detail: "Combine card, cash or other tenders across one bill.",
    icon: SplitSquareHorizontal,
  },
  {
    key: "Other" as const,
    label: "Other received",
    detail: "Record money already received through another channel.",
    icon: WalletCards,
  },
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
    <section className="rounded-2xl border border-white/8 bg-zinc-950/65 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">
            Take payment
          </p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-600">
            Choose the method the guest is using now.
          </p>
        </div>
        {paymentsEnabled && onlineForFinance ? (
          <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
            Bill final
          </span>
        ) : !onlineForFinance ? (
          <span className="rounded-full border border-amber-400/15 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
            Online only
          </span>
        ) : (
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Locked
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {TENDERS.map((tender) => {
          const Icon = tender.icon;
          const primary = tender.key === "Card";
          return (
            <button
              key={tender.key}
              type="button"
              disabled={!enabled}
              onClick={() => onSelect?.(tender.key)}
              title={
                !onlineForFinance
                  ? "Payments are disabled while Offline Lite is active."
                  : tender.detail
              }
              className={`group min-h-[4.75rem] rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                primary
                  ? "border-emerald-400/20 bg-emerald-400/[0.055] hover:border-emerald-400/40 hover:bg-emerald-400/[0.09]"
                  : "border-white/8 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    primary
                      ? "bg-emerald-400/12 text-emerald-300"
                      : "bg-white/[0.05] text-zinc-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-zinc-100">
                    {tender.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-zinc-500">
                    {tender.detail}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {!enabled ? (
        <p className="mt-3 rounded-lg border border-white/7 bg-black/20 px-2.5 py-2 text-[11px] leading-4 text-zinc-500">
          {!onlineForFinance
            ? "Reconnect before taking payment."
            : "Payment unlocks only when the bill has a positive balance and all charge-changing activity is final."}
        </p>
      ) : null}
    </section>
  );
}
