/**
 * Central plan / entitlement resolution for the web dashboard.
 *
 * Backend source of truth: apps/api/src/common/venue-entitlements.ts
 * (`getVenueEntitlements` / `hasFeature` / seat limits).
 * Frontend call site: useVenueAccess() → resolveSubscriptionAccess (this file).
 */
import {
  legacyAddOnsFromTier,
  legacyModulesFromTier,
  modulesForPackAndAddOns,
  parseAddOns,
  resolveAddOnsCsv,
  serializeAddOns,
  TRIAL_DURATION_DAYS as PACK_TRIAL_DAYS,
  type ModuleKey,
} from "./venue-packs";

export type SubscriptionTier =
  | "FREE"
  | "STARTER"
  | "STANDARD"
  | "PRO"
  | "ENTERPRISE";

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "PAUSED";

/** Free trial employee seat cap. */
export const TRIAL_STAFF_SEAT_LIMIT = 3;
/** Operational grace after the free trial ends. */
export const TRIAL_GRACE_PERIOD_DAYS = 7;

export const ALL_FEATURES = [
  "menu",
  "resource",
  "reservation",
  "transaction",
  "gallery",
  "hours",
  "notes",
  "bar",
  "reports",
  "roles",
  "memberships",
  "multi_shop",
  "integrations",
  "audit",
  "notifications",
  "reviews",
  "messaging",
  "marketing",
] as const;

export type FeatureKey = (typeof ALL_FEATURES)[number];

const UNLOCKED: Record<SubscriptionTier, Set<FeatureKey>> = {
  FREE: new Set(),
  STARTER: new Set([
    "menu",
    "resource",
    "reservation",
    "transaction",
    "gallery",
    "hours",
    "notes",
  ]),
  STANDARD: new Set([
    "menu",
    "resource",
    "reservation",
    "transaction",
    "gallery",
    "hours",
    "notes",
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
    "notes",
    "bar",
    "reports",
    "memberships",
    "roles",
  ]),
  ENTERPRISE: new Set([...ALL_FEATURES]),
};

export const TRIAL_DURATION_DAYS = PACK_TRIAL_DAYS;

export const STAFF_LIMITS: Record<SubscriptionTier, number> = {
  FREE: 0,
  STARTER: 0,
  STANDARD: 5,
  PRO: 20,
  ENTERPRISE: 999,
};

export type SubscriptionAccess = {
  billedTier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  trialActive: boolean;
  trialExpired: boolean;
  trialGraceActive: boolean;
  trialLocked: boolean;
  trialEndsAt: string | null;
  trialGraceEndsAt: string | null;
  trialDaysRemaining: number;
  trialGraceDaysRemaining: number;
  enabledModules: Set<ModuleKey>;
  packId: string | null;
  addOns: string;
};

type SubInput = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  packId?: string | null;
  /** CSV string, API string[], or omit — merged with addOnRows via resolveAddOnsCsv */
  addOns?: string | string[] | null;
  addOnRows?: { addOnId: string }[] | null;
  staffSeatQuantity?: number | null;
} | null;

function syntheticTier(modules: Set<string>): SubscriptionTier {
  if (modules.has("multi_shop") || modules.has("integrations"))
    return "ENTERPRISE";
  if (modules.has("roles")) return "PRO";
  if (modules.has("reports")) return "STANDARD";
  if (modules.size > 0) return "STARTER";
  return "FREE";
}

function isLegacyPaidTier(tier: SubscriptionTier): boolean {
  return tier === "STANDARD" || tier === "PRO" || tier === "ENTERPRISE";
}

/** Mirror API `effectiveAddOnsForSubscription` (subscription-tier.ts). */
function effectiveAddOnsForSubscription(sub: NonNullable<SubInput>): string {
  const merged = resolveAddOnsCsv({
    addOns: sub.addOns,
    addOnRows: sub.addOnRows,
  });
  if (parseAddOns(merged).length > 0) return merged;
  if (isLegacyPaidTier(sub.tier)) {
    return serializeAddOns(legacyAddOnsFromTier(sub.tier));
  }
  return merged;
}

/**
 * Mirror API module resolution after pack-only Phase 1 (FFFFFF):
 * pack + effectiveAddOns (with legacy add-on synthesis when stored empty).
 * No FEATURE_MATRIX / legacyModulesFromTier union on pack path.
 * Catalog gap: billed ENTERPRISE keeps multi_shop/integrations until add-ons grant them.
 */
function resolveModules(
  sub: NonNullable<SubInput>,
  effectiveAddOns: string,
): Set<ModuleKey> {
  const packId = sub.packId?.trim();
  if (packId) {
    const modules = modulesForPackAndAddOns(packId, effectiveAddOns);
    if (sub.tier === "ENTERPRISE") {
      modules.add("multi_shop");
      modules.add("integrations");
    }
    return modules;
  }
  return legacyModulesFromTier(sub.tier) as Set<ModuleKey>;
}

export function resolveSubscriptionAccess(sub: SubInput): SubscriptionAccess {
  const empty: SubscriptionAccess = {
    billedTier: "FREE",
    effectiveTier: "FREE",
    trialActive: false,
    trialExpired: false,
    trialGraceActive: false,
    trialLocked: false,
    trialEndsAt: null,
    trialGraceEndsAt: null,
    trialDaysRemaining: 0,
    trialGraceDaysRemaining: 0,
    enabledModules: new Set(),
    packId: null,
    addOns: "",
  };
  if (!sub) return empty;

  const now = Date.now();
  const trialEndsMs = sub.trialEndsAt
    ? new Date(sub.trialEndsAt).getTime()
    : Number.NaN;
  const hasTrialEnd = Number.isFinite(trialEndsMs);
  const trialEnded = hasTrialEnd && trialEndsMs < now;
  const trialGraceEndsMs = hasTrialEnd
    ? trialEndsMs + TRIAL_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
    : Number.NaN;
  const trialGraceEndsAt = Number.isFinite(trialGraceEndsMs)
    ? new Date(trialGraceEndsMs).toISOString()
    : null;

  const trialActive =
    sub.status === "TRIAL" && hasTrialEnd && !trialEnded;
  const trialGraceActive =
    sub.status === "TRIAL" &&
    trialEnded &&
    Number.isFinite(trialGraceEndsMs) &&
    trialGraceEndsMs >= now;
  const trialLocked =
    sub.status === "TRIAL" &&
    trialEnded &&
    (!Number.isFinite(trialGraceEndsMs) || trialGraceEndsMs < now);

  const daysRemaining = trialActive
    ? Math.max(
        0,
        Math.ceil((trialEndsMs - now) / (24 * 60 * 60 * 1000)),
      )
    : 0;
  const trialGraceDaysRemaining = trialGraceActive
    ? Math.max(
        0,
        Math.ceil((trialGraceEndsMs - now) / (24 * 60 * 60 * 1000)),
      )
    : 0;

  const locked =
    sub.status === "CANCELED" ||
    sub.status === "PAST_DUE" ||
    sub.status === "PAUSED" ||
    trialLocked;

  const effectiveAddOns = locked ? "" : effectiveAddOnsForSubscription(sub);
  const modules = locked
    ? new Set<ModuleKey>()
    : resolveModules(sub, effectiveAddOns);

  return {
    billedTier: sub.tier,
    effectiveTier: locked ? "FREE" : syntheticTier(modules),
    trialEndsAt: sub.trialEndsAt,
    trialGraceEndsAt,
    trialActive,
    trialExpired: sub.status === "TRIAL" && hasTrialEnd && trialEnded,
    trialGraceActive,
    trialLocked,
    trialDaysRemaining: daysRemaining,
    trialGraceDaysRemaining,
    enabledModules: modules,
    packId: sub.packId ?? null,
    addOns: effectiveAddOns,
  };
}

export function resolveEffectiveTier(sub: SubInput): SubscriptionTier {
  return resolveSubscriptionAccess(sub).effectiveTier;
}

export function resolveEnabledModules(sub: SubInput): Set<ModuleKey> {
  return resolveSubscriptionAccess(sub).enabledModules;
}

export function resolveStaffSeatLimit(
  sub: SubInput & { staffSeatQuantity?: number | null },
): number {
  const access = resolveSubscriptionAccess(sub);
  if (!access.enabledModules.has("roles")) return 0;
  if (access.trialActive || access.trialGraceActive) {
    return TRIAL_STAFF_SEAT_LIMIT;
  }
  return Math.max(0, Math.floor(sub?.staffSeatQuantity ?? 0));
}

/** Prefer modules set when available; tier string still works for legacy callers. */
export function isFeatureUnlocked(
  tierOrModules: SubscriptionTier | Set<string> | readonly string[],
  feature: FeatureKey,
): boolean {
  if (typeof tierOrModules === "string") {
    return UNLOCKED[tierOrModules].has(feature);
  }
  const set =
    tierOrModules instanceof Set ? tierOrModules : new Set(tierOrModules);
  return set.has(feature);
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  menu: "Menu",
  resource: "Tables & games",
  reservation: "Reservations",
  transaction: "Sales & transactions",
  gallery: "Gallery",
  hours: "Opening hours",
  notes: "Shift notes",
  bar: "Bar service",
  reports: "Reports",
  roles: "Employee accounts",
  memberships: "Memberships",
  multi_shop: "Multiple venues",
  integrations: "Integrations",
  audit: "Audit log",
  notifications: "Notifications",
  reviews: "Reviews",
  messaging: "Guest messaging",
  marketing: "Venue page & discovery",
};

export const FEATURE_HINTS: Partial<Record<FeatureKey, string>> = {
  menu: "Sections, tags, offers, and timed pricing.",
  resource: "Billiard tables, consoles, boards — rates and live status.",
  reservation: "Guest bookings and table holds.",
  transaction: "Sessions, receipts, and daily sales.",
  gallery: "Photos on your public venue page.",
  hours: "Weekly schedule and special hours.",
  notes: "Handoff notes for the next shift — who wrote it, when, and how urgent.",
  bar: "Drinks and snacks on live sessions.",
  reports: "Revenue, losses, and shift summaries.",
  roles: "Staff logins with permissions (Pro+).",
  memberships: "Loyalty and member pricing.",
  multi_shop: "One login, many branches.",
  integrations: "POS, payments, and custom hooks.",
  audit: "Searchable trail of staff and system actions.",
  notifications: "Inbox for booking and order alerts.",
  reviews: "Guest ratings and comments on your public venue page.",
  messaging: "Live guest↔staff chat on your public venue page.",
  marketing: "Public venue page and directory ads.",
};

export const MARKETING_FEATURES = [
  "public_listing",
  "venue_profile",
  "priority_listing",
  "homepage_spotlight",
] as const;

export type MarketingFeatureKey = (typeof MARKETING_FEATURES)[number];

const MARKETING_UNLOCKED: Record<SubscriptionTier, Set<MarketingFeatureKey>> = {
  FREE: new Set(),
  STARTER: new Set(["public_listing"]),
  STANDARD: new Set(["public_listing", "venue_profile"]),
  PRO: new Set(["public_listing", "venue_profile", "priority_listing"]),
  ENTERPRISE: new Set([...MARKETING_FEATURES]),
};

export const MARKETING_LABELS: Record<MarketingFeatureKey, string> = {
  public_listing: "Listed on GoSpots",
  venue_profile: "Full public venue page",
  priority_listing: "Boosted search ranking",
  homepage_spotlight: "Homepage featured placement",
};

export const MARKETING_HINTS: Record<MarketingFeatureKey, string> = {
  public_listing: "Appear in city browse when your venue is published.",
  venue_profile: "Menu highlights, gallery, hours, and reserve CTA.",
  priority_listing: "Rank above similar venues in search and category pages.",
  homepage_spotlight: "Rotating hero placement on the marketing homepage.",
};

export function isMarketingUnlocked(
  tier: SubscriptionTier,
  feature: MarketingFeatureKey,
): boolean {
  return MARKETING_UNLOCKED[tier].has(feature);
}

export type PlanFeatureRow = { key: string; unlocked: boolean };

export type PlanCategory = {
  id: string;
  title: string;
  description: string;
  kind: "dashboard" | "marketing";
  keys: readonly string[];
};

/** Four buckets shown on the subscription page */
export const PLAN_CATEGORIES: PlanCategory[] = [
  {
    id: "operations",
    title: "Venue operations",
    description: "Run shifts, tables, bookings, and how your venue looks day to day.",
    kind: "dashboard",
    keys: ["resource", "reservation", "hours", "gallery", "notes"],
  },
  {
    id: "revenue",
    title: "Menu & revenue",
    description: "Menu, bar, sales, and the numbers that matter after close.",
    kind: "dashboard",
    keys: ["menu", "transaction", "bar", "reports"],
  },
  {
    id: "business",
    title: "Team & scale",
    description: "Staff access, loyalty, multiple locations, and integrations.",
    kind: "dashboard",
    keys: ["roles", "memberships", "multi_shop", "integrations"],
  },
  {
    id: "discovery",
    title: "Discovery & promotion",
    description:
      "How players find you on GoSpots — separate from dashboard tools. Paid placement, not day-to-day ops.",
    kind: "marketing",
    keys: [...MARKETING_FEATURES],
  },
];

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  FREE: "Free",
  STARTER: "Starter",
  STANDARD: "Standard",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

export const TIER_ORDER: SubscriptionTier[] = [
  "FREE",
  "STARTER",
  "STANDARD",
  "PRO",
  "ENTERPRISE",
];

export type PaidTier = Exclude<SubscriptionTier, "FREE" | "ENTERPRISE">;

export type SubscriptionPlanOffer = {
  tier: PaidTier | "ENTERPRISE";
  price: string;
  period: string;
  description: string;
  highlight?: boolean;
  staffSeats: number;
  unlocks: string[];
  cta: string;
};

function dashboardUnlocks(tier: SubscriptionTier): string[] {
  return ALL_FEATURES.filter((k) => UNLOCKED[tier].has(k)).map(
    (k) => FEATURE_LABELS[k],
  );
}

function marketingUnlocks(tier: SubscriptionTier): string[] {
  return MARKETING_FEATURES.filter((k) =>
    MARKETING_UNLOCKED[tier].has(k),
  ).map((k) => MARKETING_LABELS[k]);
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanOffer[] = [
  {
    tier: "STARTER",
    price: "€29",
    period: "/month",
    description: "One venue finding its rhythm — owner-only, no staff seats.",
    staffSeats: STAFF_LIMITS.STARTER,
    unlocks: [
      ...dashboardUnlocks("STARTER"),
      ...marketingUnlocks("STARTER"),
      "90-day free trial on your venue pack",
    ],
    cta: "Start with Starter",
  },
  {
    tier: "STANDARD",
    price: "€79",
    period: "/month",
    description: "Bar, reports, and a small team.",
    highlight: true,
    staffSeats: STAFF_LIMITS.STANDARD,
    unlocks: [
      ...dashboardUnlocks("STANDARD"),
      ...marketingUnlocks("STANDARD"),
      `${STAFF_LIMITS.STANDARD} employee accounts`,
    ],
    cta: "Go Standard",
  },
  {
    tier: "PRO",
    price: "€149",
    period: "/month",
    description: "Staff permissions, memberships, and growth tools.",
    staffSeats: STAFF_LIMITS.PRO,
    unlocks: [
      ...dashboardUnlocks("PRO"),
      ...marketingUnlocks("PRO"),
      `${STAFF_LIMITS.PRO} employee accounts`,
    ],
    cta: "Upgrade to Pro",
  },
  {
    tier: "ENTERPRISE",
    price: "Custom",
    period: "",
    description: "Chains, unlimited branches, and priority placement.",
    staffSeats: STAFF_LIMITS.ENTERPRISE,
    unlocks: [
      ...dashboardUnlocks("ENTERPRISE"),
      ...marketingUnlocks("ENTERPRISE"),
      "Unlimited employee accounts",
    ],
    cta: "Talk to sales",
  },
];

export function labelForFeatureKey(key: string): string {
  if (key in FEATURE_LABELS) {
    return FEATURE_LABELS[key as FeatureKey];
  }
  if (key in MARKETING_LABELS) {
    return MARKETING_LABELS[key as MarketingFeatureKey];
  }
  return key;
}

export function hintForFeatureKey(key: string): string | undefined {
  if (key in FEATURE_HINTS) {
    return FEATURE_HINTS[key as FeatureKey];
  }
  if (key in MARKETING_HINTS) {
    return MARKETING_HINTS[key as MarketingFeatureKey];
  }
  return undefined;
}

export function buildMarketingCatalogForTier(
  tier: SubscriptionTier,
): PlanFeatureRow[] {
  return MARKETING_FEATURES.map((key) => ({
    key,
    unlocked: isMarketingUnlocked(tier, key),
  }));
}

export function groupFeaturesByCategory(
  dashboardFeatures: PlanFeatureRow[],
  marketingFeatures: PlanFeatureRow[],
): {
  category: PlanCategory;
  items: (PlanFeatureRow & { label: string; hint?: string })[];
}[] {
  const byKey = new Map<string, PlanFeatureRow>();
  for (const f of dashboardFeatures) byKey.set(f.key, f);
  for (const f of marketingFeatures) byKey.set(f.key, f);

  return PLAN_CATEGORIES.map((category) => ({
    category,
    items: category.keys
      .map((key) => {
        const row = byKey.get(key);
        if (!row) return null;
        return {
          ...row,
          label: labelForFeatureKey(key),
          hint: hintForFeatureKey(key),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  }));
}
