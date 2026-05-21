export type SubscriptionTier =
  | "FREE"
  | "STARTER"
  | "STANDARD"
  | "PRO"
  | "ENTERPRISE";

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export const ALL_FEATURES = [
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
  ENTERPRISE: new Set([...ALL_FEATURES]),
};

export const TRIAL_DURATION_DAYS = 7;

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
  trialEndsAt: string | null;
  trialDaysRemaining: number;
};

type SubInput = {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
} | null;

function trialExpiredAt(trialEndsAt: string | null): boolean {
  return !!trialEndsAt && new Date(trialEndsAt).getTime() < Date.now();
}

export function resolveSubscriptionAccess(sub: SubInput): SubscriptionAccess {
  const empty: SubscriptionAccess = {
    billedTier: "FREE",
    effectiveTier: "FREE",
    trialActive: false,
    trialExpired: false,
    trialEndsAt: null,
    trialDaysRemaining: 0,
  };
  if (!sub) return empty;

  const expired = trialExpiredAt(sub.trialEndsAt);
  const trialActive = sub.status === "TRIAL" && !!sub.trialEndsAt && !expired;
  const daysRemaining =
    sub.trialEndsAt && !expired
      ? Math.max(
          0,
          Math.ceil(
            (new Date(sub.trialEndsAt).getTime() - Date.now()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : 0;

  const base = {
    billedTier: sub.tier,
    trialEndsAt: sub.trialEndsAt,
    trialActive,
    trialExpired: sub.status === "TRIAL" && !!sub.trialEndsAt && expired,
    trialDaysRemaining: daysRemaining,
  };

  if (sub.status === "CANCELED" || sub.status === "PAST_DUE") {
    return { ...base, effectiveTier: "FREE" };
  }
  if (base.trialExpired) {
    return { ...base, effectiveTier: "FREE" };
  }
  if (trialActive || sub.status === "ACTIVE") {
    return { ...base, effectiveTier: sub.tier };
  }
  return { ...base, effectiveTier: sub.tier };
}

export function resolveEffectiveTier(sub: SubInput): SubscriptionTier {
  return resolveSubscriptionAccess(sub).effectiveTier;
}

export function isFeatureUnlocked(
  tier: SubscriptionTier,
  feature: FeatureKey,
): boolean {
  return UNLOCKED[tier].has(feature);
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  menu: "Menu",
  resource: "Tables & games",
  reservation: "Reservations",
  transaction: "Sales & transactions",
  gallery: "Gallery",
  hours: "Opening hours",
  bar: "Bar service",
  reports: "Reports",
  roles: "Employee accounts",
  memberships: "Memberships",
  multi_shop: "Multiple venues",
  integrations: "Integrations",
};

export const FEATURE_HINTS: Partial<Record<FeatureKey, string>> = {
  menu: "Sections, tags, offers, and timed pricing.",
  resource: "Billiard tables, consoles, boards — rates and live status.",
  reservation: "Guest bookings and table holds.",
  transaction: "Sessions, receipts, and daily sales.",
  gallery: "Photos on your public venue page.",
  hours: "Weekly schedule and special hours.",
  bar: "Drinks and snacks on live sessions.",
  reports: "Revenue, losses, and shift summaries.",
  roles: "Staff logins with permissions (Pro+).",
  memberships: "Loyalty and member pricing.",
  multi_shop: "One login, many branches.",
  integrations: "POS, payments, and custom hooks.",
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
    keys: ["resource", "reservation", "hours", "gallery"],
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
      "7-day full Starter trial on signup",
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
