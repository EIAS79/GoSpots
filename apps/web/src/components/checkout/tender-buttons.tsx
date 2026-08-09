export type CheckoutTender = "Cash" | "Card" | "Split" | "More";

const TENDERS: CheckoutTender[] = ["Cash", "Card", "Split", "More"];

export function TenderButtons({
  canWrite,
  busy = false,
  onSelect,
}: {
  canWrite: boolean;
  busy?: boolean;
  onSelect?: (tender: CheckoutTender) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TENDERS.map((tender) => (
          <button
            key={tender}
            type="button"
            disabled={!canWrite || busy}
            onClick={() => onSelect?.(tender)}
            className="min-h-14 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm font-semibold text-zinc-100 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tender}
          </button>
        ))}
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        {canWrite
          ? "Chunk 03 preview mode: tender actions refresh the authoritative server total but do not charge, allocate, or post money yet."
          : "Read-only checkout. Tender actions require checkout.write permission."}
      </p>
    </section>
  );
}
