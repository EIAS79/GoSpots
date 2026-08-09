import type { CheckoutChargeLine } from "@/lib/checkout-client";
import {
  CHECKOUT_GROUPS,
  formatCheckoutMoney,
  groupCheckoutLines,
} from "./checkout-presenter";

export function ChargeGroups({
  lines,
  currency,
  locale = "en",
}: {
  lines: readonly CheckoutChargeLine[];
  currency: string;
  locale?: string;
}) {
  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
        <p className="text-sm font-semibold text-zinc-200">This check is empty</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-zinc-500">
          Use the controls above to add a menu item or attach an existing order,
          reservation, or play session.
        </p>
      </div>
    );
  }

  const grouped = groupCheckoutLines(lines);

  return (
    <div className="space-y-3" data-testid="checkout-charge-groups">
      {CHECKOUT_GROUPS.map((group) => {
        const groupLines = grouped[group.key];
        if (groupLines.length === 0) return null;
        return (
          <section
            key={group.key}
            className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
          >
            <div className="flex items-center justify-between border-b border-white/7 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                {group.label}
              </h3>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-500">
                {groupLines.length}
              </span>
            </div>
            <ul className="divide-y divide-white/6">
              {groupLines.map((line) => (
                <li
                  key={`${line.position}-${line.sourceType}-${line.sourceId}-${line.lineReference ?? "root"}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      {line.description}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Qty {line.quantity}
                      {line.quantity !== 1
                        ? ` × ${formatCheckoutMoney(line.unitAmount, currency, locale)}`
                        : ""}
                    </p>
                    {line.discountAmount !== "0.0000" ? (
                      <p className="mt-1 text-xs text-emerald-400">
                        Discount −
                        {formatCheckoutMoney(
                          line.discountAmount,
                          currency,
                          locale,
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="self-center text-right text-sm font-bold tabular-nums text-white">
                    {formatCheckoutMoney(line.finalAmount, currency, locale)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
