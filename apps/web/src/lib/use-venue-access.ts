"use client";

import { resolveSubscriptionAccess } from "@/lib/plan";
import type { SubscriptionTier } from "@/lib/plan";
import { useCurrentMembership } from "@/lib/use-current-membership";

/** Resolves pack/add-on modules for the active venue membership. */
export function useVenueAccess() {
  const membership = useCurrentMembership();
  const sub = membership?.shop.subscription ?? null;
  return resolveSubscriptionAccess(
    sub
      ? {
          tier: sub.tier as SubscriptionTier,
          status: sub.status as "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED",
          trialEndsAt: sub.trialEndsAt,
          packId: sub.packId,
          addOns: sub.addOns,
        }
      : null,
  );
}
