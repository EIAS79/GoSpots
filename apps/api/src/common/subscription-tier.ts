import { SubscriptionStatus, SubscriptionTier } from "@prisma/client";

/** All feature keys referenced in the dashboard UI */
export const ALL_FEATURE_KEYS = [
  "menu",
  "resource",
  "reservation",
  "transaction",
  "gallery",
  "hours",
  "bar",
  "reports",
  "roles",
  "memberships",
  "multi_shop",
  "integrations",
] as const;

export type FeatureKey = (typeof ALL_FEATURE_KEYS)[number];

export const FEATURE_MATRIX: Record<SubscriptionTier, Set<string>> = {
  FREE: new Set(),
  STARTER: new Set([
    "menu",
    "resource",
    "reservation",
    "transaction",
    "gallery",
    "hours",
  ]),
  STANDARD: new Set([
    "menu",
    "resource",
    "reservation",
    "transaction",
    "gallery",
    "hours",
    "bar",
    "reports",
  ]),
  PRO: new Set([
    "menu",
    "resource",
    "reservation",
    "transaction",
    "gallery",
    "hours",
    "bar",
    "reports",
    "memberships",
    "roles",
  ]),
  ENTERPRISE: new Set([
    "menu",
    "resource",
    "reservation",
    "transaction",
    "gallery",
    "hours",
    "bar",
    "reports",
    "memberships",
    "roles",
    "multi_shop",
    "integrations",
  ]),
};

export const TRIAL_DURATION_DAYS = 7;

export const STAFF_SEAT_LIMITS: Record<SubscriptionTier, number> = {
  FREE: 0,
  STARTER: 0,
  STANDARD: 5,
  PRO: 20,
  ENTERPRISE: 999,
};

export function staffSeatLimit(tier: SubscriptionTier): number {
  return STAFF_SEAT_LIMITS[tier];
}

export function tierHasFeature(tier: SubscriptionTier, feature: string): boolean {
  return FEATURE_MATRIX[tier].has(feature);
}

type SubRow = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
} | null;

export type SubscriptionAccess = {
  billedTier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  trialActive: boolean;
  trialExpired: boolean;
  trialEndsAt: Date | null;
  trialDaysRemaining: number;
};

function trialExpiredAt(trialEndsAt: Date | null): boolean {
  return !!trialEndsAt && trialEndsAt.getTime() < Date.now();
}

export function resolveSubscriptionAccess(
  subscription: SubRow,
): SubscriptionAccess {
  const empty: SubscriptionAccess = {
    billedTier: SubscriptionTier.FREE,
    effectiveTier: SubscriptionTier.FREE,
    trialActive: false,
    trialExpired: false,
    trialEndsAt: null,
    trialDaysRemaining: 0,
  };

  if (!subscription) return empty;

  const { status, trialEndsAt, tier } = subscription;
  const expired = trialExpiredAt(trialEndsAt);
  const activeTrial =
    status === SubscriptionStatus.TRIAL && !!trialEndsAt && !expired;

  const daysRemaining =
    trialEndsAt && !expired
      ? Math.max(
          0,
          Math.ceil(
            (trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
          ),
        )
      : 0;

  const base = {
    billedTier: tier,
    trialEndsAt,
    trialActive: activeTrial,
    trialExpired:
      status === SubscriptionStatus.TRIAL && !!trialEndsAt && expired,
    trialDaysRemaining: daysRemaining,
  };

  if (
    status === SubscriptionStatus.CANCELED ||
    status === SubscriptionStatus.PAST_DUE
  ) {
    return { ...base, effectiveTier: SubscriptionTier.FREE };
  }

  if (base.trialExpired) {
    return { ...base, effectiveTier: SubscriptionTier.FREE };
  }

  if (activeTrial || status === SubscriptionStatus.ACTIVE) {
    return { ...base, effectiveTier: tier };
  }

  return { ...base, effectiveTier: tier };
}

/** No subscription or expired trial/canceled → FREE (see-only, nothing unlocked). */
export function resolveEffectiveTier(subscription: SubRow): SubscriptionTier {
  return resolveSubscriptionAccess(subscription).effectiveTier;
}

export function addTrialEndDate(from = new Date()): Date {
  const end = new Date(from);
  end.setDate(end.getDate() + TRIAL_DURATION_DAYS);
  return end;
}

export function buildFeatureCatalog(effectiveTier: SubscriptionTier) {
  return ALL_FEATURE_KEYS.map((key) => ({
    key,
    unlocked: tierHasFeature(effectiveTier, key),
  }));
}

/** Public /venues discovery & paid placement — separate from dashboard modules */
export const MARKETING_FEATURE_KEYS = [
  "public_listing",
  "venue_profile",
  "priority_listing",
  "homepage_spotlight",
] as const;

export type MarketingFeatureKey = (typeof MARKETING_FEATURE_KEYS)[number];

export const MARKETING_FEATURE_MATRIX: Record<
  SubscriptionTier,
  Set<string>
> = {
  FREE: new Set(),
  STARTER: new Set(["public_listing"]),
  STANDARD: new Set(["public_listing", "venue_profile"]),
  PRO: new Set(["public_listing", "venue_profile", "priority_listing"]),
  ENTERPRISE: new Set([
    "public_listing",
    "venue_profile",
    "priority_listing",
    "homepage_spotlight",
  ]),
};

export function tierHasMarketingFeature(
  tier: SubscriptionTier,
  feature: string,
): boolean {
  return MARKETING_FEATURE_MATRIX[tier].has(feature);
}

export function buildMarketingCatalog(effectiveTier: SubscriptionTier) {
  return MARKETING_FEATURE_KEYS.map((key) => ({
    key,
    unlocked: tierHasMarketingFeature(effectiveTier, key),
  }));
}
