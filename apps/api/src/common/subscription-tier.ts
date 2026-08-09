import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import {
  legacyAddOnsFromTier,
  legacyModulesFromTier,
  modulesForPackAndAddOns,
  parseAddOns,
  resolveAddOnsCsv,
  serializeAddOns,
  TRIAL_DURATION_DAYS as PACK_TRIAL_DAYS,
  type ModuleKey,
  type VenuePackId,
} from './venue-packs';

export { TRIAL_DURATION_DAYS } from './venue-packs';
export const TRIAL_DURATION_DAYS_PACK = PACK_TRIAL_DAYS;

/** Post-trial operational grace before modules are locked. */
export const TRIAL_GRACE_PERIOD_DAYS = 7;

/** Free trial employee seat cap (no purchase required during trial/grace). */
export const TRIAL_STAFF_SEAT_LIMIT = 3;

/** All feature keys referenced in the dashboard UI */
export const ALL_FEATURE_KEYS = [
  'menu',
  'resource',
  'reservation',
  'transaction',
  'gallery',
  'hours',
  'notes',
  'bar',
  'reports',
  'roles',
  'memberships',
  'multi_shop',
  'integrations',
  'audit',
  'notifications',
  'reviews',
  'messaging',
  'marketing',
] as const;

export type FeatureKey = (typeof ALL_FEATURE_KEYS)[number];

/** @deprecated Prefer pack/module access — kept for marketing + seat fallbacks */
export const FEATURE_MATRIX: Record<SubscriptionTier, Set<string>> = {
  FREE: new Set(),
  STARTER: new Set([
    'menu',
    'resource',
    'reservation',
    'transaction',
    'gallery',
    'hours',
    'notes',
  ]),
  STANDARD: new Set([
    'menu',
    'resource',
    'reservation',
    'transaction',
    'gallery',
    'hours',
    'notes',
    'bar',
    'reports',
  ]),
  PRO: new Set([
    'menu',
    'resource',
    'reservation',
    'transaction',
    'gallery',
    'hours',
    'notes',
    'bar',
    'reports',
    'memberships',
    'roles',
  ]),
  ENTERPRISE: new Set([...ALL_FEATURE_KEYS]),
};

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

export function staffSeatLimitFromModules(modules: Set<string>): number {
  if (!modules.has('roles')) return 0;
  if (modules.has('multi_shop')) return 20;
  return 5;
}

/** Purchased employee seats — source of truth for paid create limits. */
export function staffSeatLimitFromQuantity(
  quantity: number | null | undefined,
): number {
  return Math.max(0, Math.floor(quantity ?? 0));
}

type SeatSubRow = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  packId?: string | null;
  addOns?: string | null;
  addOnRows?: { addOnId: string }[] | null;
  staffSeatQuantity?: number | null;
} | null;

/**
 * Trial/grace: up to 3 seats when Team accounts is enabled.
 * Paid: purchased quantity. Locked: 0 (modules already empty).
 */
export function resolveStaffSeatLimit(subscription: SeatSubRow): number {
  const access = resolveSubscriptionAccess(subscription);
  if (!moduleHasFeature(access.enabledModules, 'roles')) return 0;
  if (access.trialActive || access.trialGraceActive) {
    return TRIAL_STAFF_SEAT_LIMIT;
  }
  return staffSeatLimitFromQuantity(subscription?.staffSeatQuantity);
}

export function tierHasFeature(
  tier: SubscriptionTier,
  feature: string,
): boolean {
  return FEATURE_MATRIX[tier].has(feature);
}

type SubRow = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  packId?: string | null;
  addOns?: string | null;
  addOnRows?: { addOnId: string }[] | null;
} | null;

export type SubscriptionAccess = {
  billedTier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  trialActive: boolean;
  /** Trial end date has passed (includes the grace window). */
  trialExpired: boolean;
  /** Trial ended, but the 7-day grace window is still operational. */
  trialGraceActive: boolean;
  /** Trial + grace have both ended; paid modules are locked. */
  trialLocked: boolean;
  trialEndsAt: Date | null;
  trialGraceEndsAt: Date | null;
  trialDaysRemaining: number;
  trialGraceDaysRemaining: number;
  packId: VenuePackId | null;
  addOns: string;
  enabledModules: Set<ModuleKey>;
};

function graceEndForTrial(trialEndsAt: Date | null): Date | null {
  if (!trialEndsAt) return null;
  return new Date(
    trialEndsAt.getTime() + TRIAL_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );
}

function syntheticTierFromModules(modules: Set<string>): SubscriptionTier {
  if (modules.has('multi_shop') || modules.has('integrations')) {
    return SubscriptionTier.ENTERPRISE;
  }
  if (modules.has('roles')) return SubscriptionTier.PRO;
  if (modules.has('reports')) return SubscriptionTier.STANDARD;
  if (modules.size > 0) return SubscriptionTier.STARTER;
  return SubscriptionTier.FREE;
}

/**
 * Effective add-ons CSV: rows-primary (CSV fallback when rows omitted), then
 * legacy tier→add-ons when pack shops still have empty add-ons but a paid
 * legacy tier (STANDARD+). Never strips intentional empty STARTER/FREE selections.
 */
export function effectiveAddOnsForSubscription(
  subscription: NonNullable<SubRow>,
): string {
  const merged = resolveAddOnsCsv({
    addOns: subscription.addOns,
    addOnRows: subscription.addOnRows,
  });
  if (parseAddOns(merged).length > 0) return merged;

  const legacyPaid =
    subscription.tier === SubscriptionTier.STANDARD ||
    subscription.tier === SubscriptionTier.PRO ||
    subscription.tier === SubscriptionTier.ENTERPRISE;
  if (legacyPaid) {
    return serializeAddOns(legacyAddOnsFromTier(subscription.tier));
  }
  return merged;
}

/**
 * Pack-only when `packId` set: modules come from pack + effective add-ons
 * (rows-primary, with runtime legacy STANDARD+ synthesis). No FEATURE_MATRIX /
 * legacyModulesFromTier union.
 *
 * Catalog gap: no add-on yet grants `multi_shop` / `integrations`. Preserve
 * those when billed tier is ENTERPRISE so legacy access never shrinks.
 * Pack-less rows still use `legacyModulesFromTier` until every shop has a packId.
 */
function resolveModules(subscription: NonNullable<SubRow>): Set<ModuleKey> {
  const hasPack =
    !!subscription.packId && subscription.packId.trim().length > 0;
  if (hasPack) {
    const modules = modulesForPackAndAddOns(
      subscription.packId,
      effectiveAddOnsForSubscription(subscription),
    );
    if (subscription.tier === SubscriptionTier.ENTERPRISE) {
      modules.add('multi_shop');
      modules.add('integrations');
    }
    return modules;
  }
  return legacyModulesFromTier(subscription.tier) as Set<ModuleKey>;
}

export function resolveSubscriptionAccess(
  subscription: SubRow,
): SubscriptionAccess {
  const empty: SubscriptionAccess = {
    billedTier: SubscriptionTier.FREE,
    effectiveTier: SubscriptionTier.FREE,
    trialActive: false,
    trialExpired: false,
    trialGraceActive: false,
    trialLocked: false,
    trialEndsAt: null,
    trialGraceEndsAt: null,
    trialDaysRemaining: 0,
    trialGraceDaysRemaining: 0,
    packId: null,
    addOns: '',
    enabledModules: new Set(),
  };

  if (!subscription) return empty;

  const { status, trialEndsAt, tier } = subscription;
  const now = Date.now();
  const trialEnded = !!trialEndsAt && trialEndsAt.getTime() < now;
  const trialGraceEndsAt = graceEndForTrial(trialEndsAt);
  const activeTrial =
    status === SubscriptionStatus.TRIAL && !!trialEndsAt && !trialEnded;
  const graceActive =
    status === SubscriptionStatus.TRIAL &&
    trialEnded &&
    !!trialGraceEndsAt &&
    trialGraceEndsAt.getTime() >= now;
  const trialLocked =
    status === SubscriptionStatus.TRIAL &&
    trialEnded &&
    (!trialGraceEndsAt || trialGraceEndsAt.getTime() < now);

  const daysRemaining =
    trialEndsAt && !trialEnded
      ? Math.max(
          0,
          Math.ceil((trialEndsAt.getTime() - now) / (24 * 60 * 60 * 1000)),
        )
      : 0;
  const graceDaysRemaining = graceActive
    ? Math.max(
        0,
        Math.ceil(
          (trialGraceEndsAt!.getTime() - now) / (24 * 60 * 60 * 1000),
        ),
      )
    : 0;

  // PAUSED locks paid modules (same as PAST_DUE) — billing UI stays reachable.
  const locked =
    status === SubscriptionStatus.CANCELED ||
    status === SubscriptionStatus.PAST_DUE ||
    status === SubscriptionStatus.PAUSED ||
    trialLocked;

  // Trial, trial grace, and paid ACTIVE: visibility follows saved features.
  // After grace / past_due / paused / canceled: modules are hidden but data is retained.
  const modules = locked
    ? new Set<ModuleKey>()
    : resolveModules(subscription);
  const effectiveTier = locked
    ? SubscriptionTier.FREE
    : syntheticTierFromModules(modules);

  return {
    billedTier: tier,
    effectiveTier,
    trialEndsAt,
    trialGraceEndsAt,
    trialActive: activeTrial,
    trialExpired:
      status === SubscriptionStatus.TRIAL && !!trialEndsAt && trialEnded,
    trialGraceActive: graceActive,
    trialLocked,
    trialDaysRemaining: daysRemaining,
    trialGraceDaysRemaining: graceDaysRemaining,
    packId: (subscription.packId as VenuePackId) ?? null,
    addOns: locked ? '' : effectiveAddOnsForSubscription(subscription),
    enabledModules: modules,
  };
}

export function resolveEffectiveTier(subscription: SubRow): SubscriptionTier {
  return resolveSubscriptionAccess(subscription).effectiveTier;
}

export function resolveEnabledModules(subscription: SubRow): Set<ModuleKey> {
  return resolveSubscriptionAccess(subscription).enabledModules;
}

export function moduleHasFeature(
  modules: Set<string>,
  feature: string,
): boolean {
  return modules.has(feature);
}

export function addTrialEndDate(from = new Date()): Date {
  const end = new Date(from);
  end.setDate(end.getDate() + PACK_TRIAL_DAYS);
  return end;
}

export function buildFeatureCatalog(modulesOrTier: Set<string> | SubscriptionTier) {
  const unlocked =
    typeof modulesOrTier === 'string'
      ? FEATURE_MATRIX[modulesOrTier]
      : modulesOrTier;
  return ALL_FEATURE_KEYS.map((key) => ({
    key,
    unlocked: unlocked.has(key),
  }));
}

/** Public /venues discovery & paid placement — separate from dashboard modules */
export const MARKETING_FEATURE_KEYS = [
  'public_listing',
  'venue_profile',
  'priority_listing',
  'homepage_spotlight',
] as const;

export type MarketingFeatureKey = (typeof MARKETING_FEATURE_KEYS)[number];

export const MARKETING_FEATURE_MATRIX: Record<SubscriptionTier, Set<string>> = {
  FREE: new Set(),
  STARTER: new Set(['public_listing']),
  STANDARD: new Set(['public_listing', 'venue_profile']),
  PRO: new Set(['public_listing', 'venue_profile', 'priority_listing']),
  ENTERPRISE: new Set([
    'public_listing',
    'venue_profile',
    'priority_listing',
    'homepage_spotlight',
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

/** Map pack → stored SubscriptionTier for seat/legacy fields */
export function tierForPack(packId: string, addOns: string): SubscriptionTier {
  const modules = modulesForPackAndAddOns(packId, addOns);
  return syntheticTierFromModules(modules);
}
