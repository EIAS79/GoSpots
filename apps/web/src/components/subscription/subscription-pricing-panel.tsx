"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  SUBSCRIPTION_PLANS,
  TRIAL_DURATION_DAYS,
  TIER_LABELS,
  type SubscriptionTier,
} from "@/lib/plan";

type Props = {
  currentTier?: SubscriptionTier;
  defaultOpen?: boolean;
};

export function SubscriptionPricingPanel({
  currentTier,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.03]"
      >
        <div>
          <p className="font-medium text-white">Plans & pricing</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Compare tiers, prices, and what each plan unlocks
          </p>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 text-zinc-500 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-white/5 px-5 pb-5 pt-4">
          <p className="mb-4 text-xs text-zinc-500">
            New venues get a {TRIAL_DURATION_DAYS}-day Starter trial (full
            Starter features, 0
            staff seats). After the trial, features lock until you subscribe.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {SUBSCRIPTION_PLANS.map((plan) => {
              const isCurrent = currentTier === plan.tier;
              return (
                <article
                  key={plan.tier}
                  className={cn(
                    "rounded-lg border p-4",
                    plan.highlight
                      ? "border-emerald-400/30 bg-emerald-500/[0.06]"
                      : "border-white/10 bg-zinc-900/30",
                    isCurrent && "ring-1 ring-amber-400/40",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-semibold text-white">
                      {TIER_LABELS[plan.tier]}
                    </h4>
                    {isCurrent ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
                        Your billed plan
                      </span>
                    ) : null}
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white">
                        {plan.price}
                      </span>
                      {plan.period ? (
                        <span className="text-sm text-zinc-500">
                          {plan.period}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{plan.description}</p>
                  <p className="mt-2 text-xs text-zinc-600">
                    Employee seats:{" "}
                    <span className="text-zinc-400">
                      {plan.staffSeats === 0
                        ? "Owner only"
                        : plan.staffSeats >= 999
                          ? "Unlimited"
                          : plan.staffSeats}
                    </span>
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {plan.unlocks.map((line) => (
                      <li
                        key={line}
                        className="flex items-start gap-2 text-xs text-zinc-300"
                      >
                        <Check
                          size={12}
                          className="mt-0.5 shrink-0 text-emerald-400"
                        />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled
                    className={cn(
                      "mt-4 w-full rounded-lg px-3 py-2 text-xs font-semibold",
                      plan.highlight
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "border border-white/10 bg-white/5 text-zinc-400",
                    )}
                  >
                    {plan.cta} — checkout soon
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
