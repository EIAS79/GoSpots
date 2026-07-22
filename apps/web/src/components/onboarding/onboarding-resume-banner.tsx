"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  countedDoneSteps,
  dismissOnboardingBanner,
  ONBOARDING_STEP_COUNT,
  readOnboardingProgress,
  shouldShowOnboardingBanner,
  type OnboardingProgress,
} from "@/lib/onboarding-progress";
import { useVenueHref, useVenuePath } from "@/lib/venue-context";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { useCurrentMembership } from "@/lib/use-current-membership";

export function OnboardingResumeBanner() {
  const venuePath = useVenuePath();
  const pathname = usePathname();
  const href = useVenueHref("/onboarding");
  const membership = useCurrentMembership();
  const t = useVenueSettingsOptional()?.t;
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);

  useEffect(() => {
    setProgress(readOnboardingProgress(venuePath));
  }, [venuePath, pathname]);

  if (!membership || membership.role !== "OWNER") return null;
  if (!shouldShowOnboardingBanner(progress) || !progress) return null;
  if (pathname.includes("/onboarding")) return null;

  const done = countedDoneSteps(progress);

  return (
    <div className="shrink-0 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-emerald-100">
          {t?.("onboarding.banner", {
            done,
            total: ONBOARDING_STEP_COUNT,
          }) ?? `Setup incomplete — ${done} of ${ONBOARDING_STEP_COUNT} steps`}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={href}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950"
          >
            {t?.("onboarding.bannerResume") ?? "Resume setup"}
          </Link>
          <button
            type="button"
            aria-label={t?.("onboarding.bannerDismiss") ?? "Dismiss"}
            onClick={() => setProgress(dismissOnboardingBanner(progress))}
            className="grid h-8 w-8 place-items-center rounded-md text-emerald-200/80 hover:bg-emerald-500/20"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
