"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FeatureKey } from "@/lib/plan";
import { FEATURE_LABELS } from "@/lib/plan";
import { useVenueHref } from "@/lib/venue-context";

export function FeatureGate({
  feature,
  unlocked,
  children,
  title,
}: {
  feature: FeatureKey;
  unlocked: boolean;
  children: ReactNode;
  title?: string;
}) {
  const subscriptionHref = useVenueHref("/subscription");

  if (unlocked) return <>{children}</>;

  return (
    <div className="relative min-h-[320px] rounded-xl border border-amber-400/20 bg-zinc-900/40 p-8">
      <div className="pointer-events-none select-none opacity-40 blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-zinc-950/80 p-6 text-center backdrop-blur-sm">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-amber-400/30 bg-amber-500/10">
          <Lock className="text-amber-300" size={22} />
        </span>
        <h2 className="text-lg font-semibold text-white">
          {title ?? FEATURE_LABELS[feature]} is locked
        </h2>
        <p className="max-w-md text-sm text-zinc-400">
          Your current plan is <strong className="text-amber-200">Free</strong>.
          You can browse every section, but using{" "}
          {FEATURE_LABELS[feature].toLowerCase()} requires an upgrade.
        </p>
        <Link
          href={subscriptionHref}
          className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          View plans & upgrade
        </Link>
      </div>
    </div>
  );
}
