export type CheckoutTender = "Cash" | "Card" | "Split" | "More";

const TENDERS: CheckoutTender[] = ["Cash", "Card", "Split", "More"];

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
  const enabled = canWrite && !busy && paymentsEnabled;

  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Payment
        </p>
        {!paymentsEnabled ? (
          <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Not connected yet
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TENDERS.map((tender) => (
          <button
            key={tender}
            type="button"
            disabled={!enabled}
            onClick={() => onSelect?.(tender)}
            className="min-h-12 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:opacity-70"
          >
            {tender}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-600">
        {paymentsEnabled
          ? "Choose how the guest is paying."
          : "Checkout can build the bill now. Cash, card, split, and provider posting will activate with payment processing."}
      </p>
    </section>
  );
}
