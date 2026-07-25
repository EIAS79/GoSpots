/**
 * Venue type (pack) + billable features catalog.
 * Signup picks venue type only (no prices).
 * Subscription page picks features — each has its own monthly price.
 * Access = CORE ∪ selected feature modules (while trial/active).
 */

export const TRIAL_DURATION_DAYS = 90;

/** Always included with any active trial/subscription */
export const CORE_MODULES = ['hours', 'gallery', 'notes'] as const;

export type ModuleKey =
  | 'menu'
  | 'resource'
  | 'reservation'
  | 'transaction'
  | 'gallery'
  | 'hours'
  | 'notes'
  | 'bar'
  | 'reports'
  | 'roles'
  | 'memberships'
  | 'multi_shop'
  | 'integrations'
  | 'audit'
  | 'notifications'
  | 'reviews'
  | 'messaging'
  | 'marketing';

export type VenuePackId =
  | 'gaming'
  | 'dining'
  | 'bar'
  | 'hotel_fb'
  | 'mixed';

/** Billable features (stored in Subscription.addOns) */
export type AddOnId =
  | 'ops_alerts'
  | 'gaming_suite'
  | 'menu_orders'
  | 'dining_floor'
  | 'venue_presence'
  | 'guest_chat'
  | 'team_accounts';

export type VenuePack = {
  id: VenuePackId;
  name: string;
  tagline: string;
  /** Venue type is free — pricing is feature-based */
  monthlyPrice: 0;
  currency: 'EUR';
  /** Soft suggestions shown on the subscription page */
  recommendedFeatures: readonly AddOnId[];
  categorySlugs: readonly string[];
  showsGaming: boolean;
  showsDining: boolean;
};

export type VenueAddOn = {
  id: AddOnId;
  name: string;
  tagline: string;
  /** Longer copy for the (i) hover tip */
  details: string;
  monthlyPrice: number;
  currency: 'EUR';
  modules: readonly ModuleKey[];
  /** If true, monthlyPrice is multiplied by staffSeatQuantity */
  pricedPerSeat?: boolean;
  unlocksGaming?: boolean;
  unlocksDining?: boolean;
  recommendedFor?: readonly VenuePackId[];
};

export const VENUE_PACKS: Record<VenuePackId, VenuePack> = {
  gaming: {
    id: 'gaming',
    name: 'Gaming venue',
    tagline: 'Stations, live map bookings, and play billing.',
    monthlyPrice: 0,
    currency: 'EUR',
    recommendedFeatures: ['gaming_suite', 'venue_presence'],
    categorySlugs: [
      'gaming-center',
      'gaming-lounge',
      'esports-cafe',
      'billiard-hall',
      'arcade',
      'bowling',
      'vr-experience',
    ],
    showsGaming: true,
    showsDining: false,
  },
  dining: {
    id: 'dining',
    name: 'Restaurant',
    tagline: 'Tables, digital booking, menu, and kitchen tickets.',
    monthlyPrice: 0,
    currency: 'EUR',
    recommendedFeatures: ['dining_floor', 'menu_orders', 'venue_presence'],
    categorySlugs: ['restaurant', 'cafe'],
    showsGaming: false,
    showsDining: true,
  },
  bar: {
    id: 'bar',
    name: 'Bar & lounge',
    tagline: 'Menu, light reservations, and counter sales.',
    monthlyPrice: 0,
    currency: 'EUR',
    recommendedFeatures: ['menu_orders', 'venue_presence'],
    categorySlugs: [
      'bar',
      'lounge',
      'pub',
      'sports-bar',
      'club',
      'night-club',
      'karaoke',
    ],
    showsGaming: false,
    showsDining: true,
  },
  hotel_fb: {
    id: 'hotel_fb',
    name: 'Hotel F&B',
    tagline: 'Restaurant ops plus staff seats for hotel teams.',
    monthlyPrice: 0,
    currency: 'EUR',
    recommendedFeatures: [
      'dining_floor',
      'menu_orders',
      'team_accounts',
      'venue_presence',
    ],
    categorySlugs: ['restaurant', 'lounge', 'bar'],
    showsGaming: false,
    showsDining: true,
  },
  mixed: {
    id: 'mixed',
    name: 'Mixed venue',
    tagline: 'Gaming floor and dining under one roof.',
    monthlyPrice: 0,
    currency: 'EUR',
    recommendedFeatures: [
      'gaming_suite',
      'dining_floor',
      'menu_orders',
      'venue_presence',
    ],
    categorySlugs: [
      'family-entertainment',
      'cinema',
      'gaming-lounge',
      'restaurant',
    ],
    showsGaming: true,
    showsDining: true,
  },
};

export const VENUE_ADD_ONS: Record<AddOnId, VenueAddOn> = {
  ops_alerts: {
    id: 'ops_alerts',
    name: 'Ops alerts, audit & reviews',
    tagline: 'Notifications, activity log, and guest review inbox.',
    details:
      'Unlocks Notifications, Audit log, and Reviews. See booking alerts, staff actions, and guest ratings in one ops suite — filter and manage reviews from the dashboard.',
    /** Early-market EUR list — sized for EU / PL / MENA SMB venues */
    monthlyPrice: 5,
    currency: 'EUR',
    modules: ['notifications', 'audit', 'reviews'],
    recommendedFor: [],
  },
  gaming_suite: {
    id: 'gaming_suite',
    name: 'Gaming floor suite',
    tagline: 'Layout, setup, play billing, and game reservations.',
    details:
      'For gaming venues: design the floor map, configure stations/tables, take gaming reservations, and run play billing / session charges from the dashboard.',
    monthlyPrice: 12,
    currency: 'EUR',
    modules: ['resource', 'reservation', 'transaction', 'reports'],
    unlocksGaming: true,
    recommendedFor: ['gaming', 'mixed'],
  },
  menu_orders: {
    id: 'menu_orders',
    name: 'Menu & kitchen orders',
    tagline: 'Catalog, sections, and kitchen tickets.',
    details:
      'Build food and drink menus, manage stock and sections, and process menu orders / kitchen tickets. Ideal for restaurants, bars, and cafés.',
    monthlyPrice: 9,
    currency: 'EUR',
    /** `bar` included so pack-only authz never shrinks STANDARD+ legacy access */
    modules: ['menu', 'transaction', 'reports', 'bar'],
    recommendedFor: ['dining', 'bar', 'hotel_fb', 'mixed'],
  },
  dining_floor: {
    id: 'dining_floor',
    name: 'Dining floor & bookings',
    tagline: 'Table layout and restaurant reservations.',
    details:
      'Design dining rooms and table layouts, then take and manage restaurant reservations. Works alongside Menu & kitchen orders when you serve food.',
    monthlyPrice: 9,
    currency: 'EUR',
    modules: ['resource', 'reservation'],
    unlocksDining: true,
    recommendedFor: ['dining', 'hotel_fb', 'mixed'],
  },
  venue_presence: {
    id: 'venue_presence',
    name: 'Venue page & discovery',
    tagline: 'Public venue page plus directory placement.',
    details:
      'Publish your venue on GoSpots with a dedicated public page, and unlock advertising / promoted placement in the venues directory so more guests can find you.',
    monthlyPrice: 4,
    currency: 'EUR',
    modules: ['marketing'],
    recommendedFor: ['gaming', 'dining', 'bar', 'hotel_fb', 'mixed'],
  },
  guest_chat: {
    id: 'guest_chat',
    name: 'Guest messaging',
    tagline: 'Live chat with guests on your venue page.',
    details:
      'Guests start a private Uber-style chat from your public page, wait until staff joins, then message in real time. Staff can pause, end, reopen, or delete; guests can ping for attention.',
    monthlyPrice: 6,
    currency: 'EUR',
    modules: ['messaging'],
    recommendedFor: [],
  },
  team_accounts: {
    id: 'team_accounts',
    name: 'Team accounts',
    tagline: 'Employee seats — priced per seat / month.',
    details:
      'Buy how many employee seats you need (starts at 0). Then create one login per seat with roles and permissions. Each seat is one person.',
    monthlyPrice: 3,
    currency: 'EUR',
    /** Priced per staffSeatQuantity, not flat */
    pricedPerSeat: true,
    modules: ['roles', 'memberships'],
    recommendedFor: ['hotel_fb'],
  },
};

export const VENUE_PACK_LIST = Object.values(VENUE_PACKS);
export const VENUE_ADD_ON_LIST = Object.values(VENUE_ADD_ONS);

export function parseAddOns(raw: string | null | undefined): AddOnId[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AddOnId => s in VENUE_ADD_ONS);
}

export function serializeAddOns(ids: AddOnId[]): string {
  return [...new Set(ids)].join(',');
}

/**
 * Rows-primary add-on resolve.
 * When `addOnRows` is provided (including `[]`), join rows are SoT.
 * CSV / string[] is only a fallback when rows were never loaded.
 * Unknown ids are dropped (validated against catalog).
 */
export function resolveAddOnIds(input: {
  addOns?: string | string[] | null;
  addOnRows?: { addOnId: string }[] | null;
}): AddOnId[] {
  if (input.addOnRows != null) {
    return [
      ...new Set(
        (input.addOnRows ?? [])
          .map((r) => r.addOnId.trim())
          .filter((id): id is AddOnId => id in VENUE_ADD_ONS),
      ),
    ];
  }
  if (Array.isArray(input.addOns)) {
    return [
      ...new Set(
        input.addOns
          .map((s) => String(s).trim())
          .filter((s): s is AddOnId => s in VENUE_ADD_ONS),
      ),
    ];
  }
  return parseAddOns(input.addOns);
}

export function resolveAddOnsCsv(input: {
  addOns?: string | string[] | null;
  addOnRows?: { addOnId: string }[] | null;
}): string {
  return serializeAddOns(resolveAddOnIds(input));
}

/**
 * Map legacy SubscriptionTier → add-on set approximating FEATURE_MATRIX /
 * legacyModulesFromTier. Used so pack+empty-addOns shops on STANDARD+ do not
 * lose access during CSV→relational migration. Never used to shrink access.
 */
export function legacyAddOnsFromTier(tier: string): AddOnId[] {
  if (tier === 'ENTERPRISE') return [...(Object.keys(VENUE_ADD_ONS) as AddOnId[])];
  if (tier === 'PRO') {
    return [
      'ops_alerts',
      'gaming_suite',
      'menu_orders',
      'dining_floor',
      'guest_chat',
      'team_accounts',
    ];
  }
  if (tier === 'STANDARD') {
    return ['ops_alerts', 'gaming_suite', 'menu_orders', 'dining_floor'];
  }
  if (tier === 'STARTER') {
    return ['gaming_suite', 'menu_orders'];
  }
  return [];
}

/** Normalize CSV or id list into catalog add-on ids for row writes. */
export function addOnIdsFromInput(
  addOns: string | string[] | null | undefined,
): AddOnId[] {
  if (addOns == null) return [];
  if (Array.isArray(addOns)) {
    return [
      ...new Set(
        addOns
          .map((s) => String(s).trim())
          .filter((s): s is AddOnId => s in VENUE_ADD_ONS),
      ),
    ];
  }
  return parseAddOns(addOns);
}

/**
 * Replace SubscriptionAddOn rows (source of truth).
 * Accepts CSV string or id array — CSV is parse-only, not persisted.
 */
export async function replaceSubscriptionAddOnRows(
  db: {
    subscriptionAddOn: {
      deleteMany: (args: { where: { subscriptionId: string } }) => Promise<unknown>;
      createMany: (args: {
        data: { subscriptionId: string; addOnId: string }[];
        skipDuplicates?: boolean;
      }) => Promise<unknown>;
    };
  },
  subscriptionId: string,
  addOns: string | string[] | null | undefined,
): Promise<void> {
  const ids = addOnIdsFromInput(addOns);
  await db.subscriptionAddOn.deleteMany({ where: { subscriptionId } });
  if (!ids.length) return;
  await db.subscriptionAddOn.createMany({
    data: ids.map((addOnId) => ({ subscriptionId, addOnId })),
    skipDuplicates: true,
  });
}

/** @deprecated Prefer replaceSubscriptionAddOnRows — alias kept for call-site churn. */
export const syncSubscriptionAddOnRows = replaceSubscriptionAddOnRows;

export function resolvePackId(
  packId: string | null | undefined,
): VenuePackId {
  if (packId && packId in VENUE_PACKS) return packId as VenuePackId;
  return 'gaming';
}

export function recommendedFeaturesForPack(
  packId: string | null | undefined,
): AddOnId[] {
  return [...VENUE_PACKS[resolvePackId(packId)].recommendedFeatures];
}

/**
 * Modules unlocked by selected features only.
 * Venue type does not grant modules — it only suggests features.
 */
export function modulesForPackAndAddOns(
  _packId: string | null | undefined,
  addOnsRaw: string | null | undefined,
): Set<ModuleKey> {
  const modules = new Set<ModuleKey>([...CORE_MODULES]);
  for (const id of parseAddOns(addOnsRaw)) {
    for (const m of VENUE_ADD_ONS[id].modules) modules.add(m);
  }
  return modules;
}

/** Every billable feature module — used during the free trial. */
export function allFeatureModules(): Set<ModuleKey> {
  const modules = new Set<ModuleKey>([...CORE_MODULES]);
  for (const addOn of VENUE_ADD_ON_LIST) {
    for (const m of addOn.modules) modules.add(m);
  }
  return modules;
}

/** Sum of selected feature prices (venue type is free). */
export function monthlyTotal(
  _packId: string | null | undefined,
  addOnsRaw: string | null | undefined,
  staffSeatQuantity = 0,
): number {
  let total = 0;
  const seats = Math.max(0, staffSeatQuantity);
  for (const id of parseAddOns(addOnsRaw)) {
    const addOn = VENUE_ADD_ONS[id];
    if (addOn.pricedPerSeat) {
      total += addOn.monthlyPrice * seats;
    } else {
      total += addOn.monthlyPrice;
    }
  }
  return total;
}

export function featuresMonthlyTotal(
  featureIds: AddOnId[],
  staffSeatQuantity = 0,
): number {
  const seats = Math.max(0, staffSeatQuantity);
  return featureIds.reduce((sum, id) => {
    const addOn = VENUE_ADD_ONS[id];
    if (!addOn) return sum;
    if (addOn.pricedPerSeat) return sum + addOn.monthlyPrice * seats;
    return sum + addOn.monthlyPrice;
  }, 0);
}

/**
 * Purchasing-power adjust EUR catalog before FX — CEE / MENA SMB venues
 * should not see Western-EU SaaS sticker shock. Factor ≤ 1.
 * Billing must use the same helper so checkout matches the UI.
 */
export const CATALOG_PPP_BY_CURRENCY: Readonly<Record<string, number>> = {
  EUR: 1,
  USD: 1,
  GBP: 1,
  CHF: 1,
  AED: 1,
  SAR: 1,
  SEK: 0.95,
  NOK: 1,
  DKK: 1,
  PLN: 0.85,
  CZK: 0.82,
  HUF: 0.78,
  RON: 0.8,
  TRY: 0.58,
  EGP: 0.48,
  IQD: 0.52,
  PKR: 0.42,
  CNY: 0.72,
};

export function marketAdjustedCatalogEur(
  amountEur: number,
  currency?: string | null,
): number {
  const code = (currency ?? 'EUR').trim().toUpperCase();
  const factor = CATALOG_PPP_BY_CURRENCY[code] ?? 1;
  if (!(amountEur > 0) || factor >= 0.999) return amountEur;
  return Math.round(amountEur * factor * 100) / 100;
}

export function showsGamingUi(
  _packId: string | null | undefined,
  addOnsRaw: string | null | undefined,
): boolean {
  return parseAddOns(addOnsRaw).some((id) => VENUE_ADD_ONS[id].unlocksGaming);
}

export function showsDiningUi(
  _packId: string | null | undefined,
  addOnsRaw?: string | null,
): boolean {
  return parseAddOns(addOnsRaw).some((id) => VENUE_ADD_ONS[id].unlocksDining);
}

export function suggestPackFromCategory(
  slug: string | null | undefined,
): VenuePackId {
  if (!slug) return 'mixed';
  for (const pack of VENUE_PACK_LIST) {
    if (pack.categorySlugs.includes(slug)) return pack.id;
  }
  if (
    slug.includes('game') ||
    slug.includes('arcade') ||
    slug.includes('billiard')
  )
    return 'gaming';
  if (slug.includes('restaurant') || slug.includes('cafe')) return 'dining';
  if (slug.includes('bar') || slug.includes('club') || slug.includes('lounge'))
    return 'bar';
  return 'mixed';
}

/** Legacy: map old tier-only shops to a full mixed pack module set */
export function legacyModulesFromTier(tier: string): Set<ModuleKey> {
  const all: ModuleKey[] = [
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
  ];
  if (tier === 'ENTERPRISE') return new Set(all);
  if (tier === 'PRO')
    return new Set(
      all.filter(
        (m) =>
          m !== 'multi_shop' &&
          m !== 'integrations' &&
          m !== 'marketing',
      ),
    );
  if (tier === 'STANDARD')
    return new Set([
      'menu',
      'resource',
      'reservation',
      'transaction',
      'gallery',
      'hours',
      'notes',
      'bar',
      'reports',
      'notifications',
      'audit',
    ]);
  if (tier === 'STARTER')
    return new Set([
      'menu',
      'resource',
      'reservation',
      'transaction',
      'gallery',
      'hours',
      'notes',
    ]);
  return new Set();
}
