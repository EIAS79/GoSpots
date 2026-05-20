"use client";

import { Check, Lock, Megaphone, Store, TrendingUp, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  groupFeaturesByCategory,
  type PlanFeatureRow,
} from "@/lib/plan";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  operations: Store,
  revenue: TrendingUp,
  business: Users,
  discovery: Megaphone,
};

type PlanCatalogProps = {
  dashboardFeatures: PlanFeatureRow[];
  marketingFeatures: PlanFeatureRow[];
};

export function PlanCatalog({
  dashboardFeatures,
  marketingFeatures,
}: PlanCatalogProps) {
  const groups = groupFeaturesByCategory(dashboardFeatures, marketingFeatures);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {groups.map(({ category, items }) => {
        const Icon = CATEGORY_ICONS[category.id] ?? Store;
        const unlocked = items.filter((i) => i.unlocked).length;
        return (
          <section
            key={category.id}
            className={cn(
              "rounded-xl border p-5",
              category.kind === "marketing"
                ? "border-violet-400/15 bg-violet-500/[0.04]"
                : "border-white/10 bg-white/[0.02]",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                  category.kind === "marketing"
                    ? "bg-violet-500/15 text-violet-300"
                    : "bg-emerald-500/10 text-emerald-400",
                )}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white">{category.title}</h3>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {category.kind === "marketing" ? "Marketplace" : "Dashboard"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {category.description}
                </p>
                <p className="mt-2 text-xs text-zinc-600">
                  {unlocked} of {items.length} unlocked
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-2">
              {items.map((item) => (
                <li
                  key={item.key}
                  className={cn(
                    "flex gap-3 rounded-lg border px-3 py-2.5 text-sm",
                    item.unlocked
                      ? "border-emerald-400/15 bg-emerald-500/[0.04]"
                      : "border-white/5 bg-zinc-900/40",
                  )}
                >
                  {item.unlocked ? (
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-emerald-400"
                    />
                  ) : (
                    <Lock
                      size={16}
                      className="mt-0.5 shrink-0 text-amber-500/70"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "font-medium",
                        item.unlocked ? "text-zinc-200" : "text-zinc-500",
                      )}
                    >
                      {item.label}
                    </p>
                    {item.hint ? (
                      <p className="mt-0.5 text-xs leading-snug text-zinc-600">
                        {item.hint}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 self-start text-[10px] uppercase tracking-wide text-zinc-600">
                    {item.unlocked ? "On" : "Locked"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
