"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FeatureKey } from "@/lib/plan";
import { useVenueHref } from "@/lib/venue-context";
import { useVenueSettings } from "@/lib/venue-settings-context";

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
  const { t } = useVenueSettings();

  if (unlocked) return <>{children}</>;

  const featureLabel = t(`featureGate.labels.${feature}`);
  const displayTitle = title ?? featureLabel;

  return (
    <div className="relative min-h-0 rounded-xl border border-amber-400/20 bg-zinc-900/40 p-5 sm:min-h-[240px] sm:p-8">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-zinc-950/80 p-6 text-center backdrop-blur-sm">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-amber-400/30 bg-amber-500/10">
          <Lock className="text-amber-300" size={22} />
        </span>
        <h2 className="text-lg font-semibold text-white">
          {t("featureGate.locked", { title: displayTitle })}
        </h2>
        <p className="max-w-md text-sm text-zinc-400">
          {t("featureGate.body", { feature: featureLabel })}
        </p>
        <Link
          href={subscriptionHref}
          className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          {t("featureGate.cta")}
        </Link>
      </div>
    </div>
  );
}
