import { api, ApiError } from "./api";
import {
  idempotencyActionKey,
  type IdempotentCallOptions,
  withIdempotentFinanceCall,
} from "./idempotency-key";
import type { MoneyWire } from "./money";

export type ShopReviewsMode = "ENABLED" | "DISABLED" | "HIDDEN";

export type ShopSettings = {
  id: string;
  version: number;
  name: string;
  displayName: string | null;
  slug: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  coverImage: string | null;
  locale: string;
  /** IANA timezone for venue-local calendar days (e.g. Europe/Warsaw). */
  timezone: string;
  businessDayStartMinutes: number;
  currency: string;
  isPublished: boolean;
  advertiseOnVenuesPage: boolean;
  reviewsMode: ShopReviewsMode;
  floorCount: number;
};

export type VenueCategoryTag = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
};

export type VenueCategoryPreset = {
  slug: string;
  name: string;
  color: string;
};

export type CurrencyConversionResult = {
  from: string;
  to: string;
  rate: number;
  ratesAt: string;
  menuItems: number;
  resourceRates: number;
  resources: number;
  offerings: number;
};

export type ShopSettingsResponse = {
  shop: ShopSettings;
  locales: { code: string; label: string }[];
  currencies: { code: string; label: string; symbol: string }[];
  venueCategoryPresets?: VenueCategoryPreset[];
  venueCategories?: VenueCategoryTag[];
  currencyConversion?: CurrencyConversionResult | null;
};

export function fetchShopSettings() {
  return api<ShopSettingsResponse>("/shop/settings");
}

export function updateShopSettings(
  body: Partial<{
    expectedVersion: number;
    locale: string;
    timezone: string;
    businessDayStartMinutes: number;
    currency: string;
    /** Required true when changing shop currency (after preview). */
    confirm: boolean;
    name: string;
    displayName: string | null;
    description: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
    isPublished: boolean;
    advertiseOnVenuesPage: boolean;
    reviewsMode: ShopReviewsMode;
    floorCount: number;
  }>,
  opts?: IdempotentCallOptions,
) {
  // Currency apply is the money-mutating path — mint/reuse Idempotency-Key (Tier C optional).
  if (body.currency != null) {
    return withIdempotentFinanceCall(
      idempotencyActionKey("shop.currency.apply", {
        currency: body.currency,
        confirm: body.confirm === true,
      }),
      (idempotencyKey) =>
        api<ShopSettingsResponse>("/shop/settings", {
          method: "PATCH",
          body: JSON.stringify(body),
          headers: { "Idempotency-Key": idempotencyKey },
        }),
      opts,
    );
  }
  return api<ShopSettingsResponse>("/shop/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type CurrencyChangePreview = {
  from: string;
  to: string;
  rate: number;
  ratesAt: string;
  historicalOrdersUntouched: true;
  summary: {
    menuItems: number;
    resourceRates: number;
    resources: number;
    offerings: number;
  };
  menuItems: {
    id: string;
    name: string;
    priceBefore: number;
    priceAfter: number;
  }[];
  resourceRates: {
    id: string;
    label: string;
    categoryId: string;
    priceBefore: number;
    priceAfter: number;
  }[];
  resources: {
    id: string;
    name: string;
    hourlyRateBefore: number;
    hourlyRateAfter: number;
  }[];
  offerings: {
    id: string;
    name: string;
    offeringConfigBefore: unknown;
    offeringConfigAfter: object;
  }[];
};

/** Proposed catalog FX reprice (no writes). Apply via updateShopSettings + confirm. */
export function previewCurrencyChange(currency: string) {
  return api<CurrencyChangePreview>("/shop/currency/preview", {
    method: "POST",
    body: JSON.stringify({ currency }),
  });
}

export type CurrencyHistoryItem = {
  id: string;
  createdAt: string;
  from: string;
  to: string;
  rate: number | null;
  ratesAt: string | null;
  menuItems: number | null;
  resourceRates: number | null;
  resources: number | null;
  offerings: number | null;
  actorName: string | null;
  actorEmail: string | null;
  summary: string;
};

/** Past catalog FX conversions (audit-backed). */
export function fetchCurrencyHistory(take = 20) {
  const q = new URLSearchParams({ take: String(take) });
  return api<{ items: CurrencyHistoryItem[] }>(
    `/shop/currency/history?${q.toString()}`,
  );
}

export function convertCurrency(body: {
  amount: number;
  from: string;
  to?: string;
  toCurrencies?: string[];
}) {
  return api<{
    amount: number;
    from: string;
    ratesAt: string;
    conversions: { currency: string; amount: number; rate: number }[];
  }>("/shop/currency/convert", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Live FX: 1 `from` = `rate` of shop currency (or `to`). */
export function fetchCurrencyRate(from = "EUR", to?: string) {
  const q = new URLSearchParams({ from });
  if (to) q.set("to", to);
  return api<{ from: string; to: string; rate: number; ratesAt: string }>(
    `/shop/currency/rate?${q.toString()}`,
  );
}

export type PublicOpeningHour = {
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

export type PublicVenueReview = {
  id: string;
  guestName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type PublicVenue = {
  id: string;
  slug: string;
  name: string;
  displayName: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  coverImage: string | null;
  locale: string;
  timezone?: string;
  currency: string;
  gameOfferingCount?: number;
  averageRating?: number | null;
  reviewCount?: number;
  reviewsMode?: ShopReviewsMode;
  canSubmitReview?: boolean;
  showReviews?: boolean;
  tags?: VenueCategoryTag[];
  openingHours?: PublicOpeningHour[];
  scheduleExceptions?: PublicScheduleException[];
};

export type PublicVenuesResponse = {
  items: PublicVenue[];
  total: number;
  facets: {
    countries: string[];
    cities: string[];
  };
};

export type PublicGamingOffering = {
  id: string;
  type: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  bookingMode: "TIME" | "GAME" | "PERSON" | "MIXED";
  playstationGames: string[];
  offeringConfig: Record<string, unknown> | null;
  slotMinutes: number;
  unitCount: number;
  rates: {
    label: string;
    price: MoneyWire;
    durationMinutes: number | null;
  }[];
};

export type PublicScheduleException = {
  id: string;
  date: string;
  label: string | null;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export type PublicMenuSection = {
  id: string;
  name: string;
  sortOrder: number;
  mealPeriod: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  availableDays: string;
  imageUrl: string | null;
};

export type PublicMenuItem = {
  id: string;
  sectionId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageUrl2: string | null;
  price: MoneyWire;
  trackStock: boolean;
  inStock: boolean;
  useSectionTiming: boolean;
  availableFrom: string | null;
  availableTo: string | null;
  availableDays: string;
  tags: VenueCategoryTag[];
};

export type PublicVenueMenu = {
  sections: PublicMenuSection[];
  items: PublicMenuItem[];
};

export type PublicVenueFeatures = {
  hasMenu: boolean;
  hasGaming: boolean;
  hasDigitalDining?: boolean;
  hasTableReservations: boolean;
  hasGuestChat?: boolean;
};

export type PublicVenueDetail = PublicVenue & {
  address: string | null;
  phone: string | null;
  email: string | null;
  reviews?: PublicVenueReview[];
  reviewsMode?: ShopReviewsMode;
  canSubmitReview?: boolean;
  showReviews?: boolean;
  galleryItems: {
    id: string;
    imageUrl: string;
    caption: string | null;
    sortOrder: number;
  }[];
  gamingOfferings?: PublicGamingOffering[];
  diningOfferings?: PublicGamingOffering[];
  scheduleExceptions?: PublicScheduleException[];
  menu?: PublicVenueMenu | null;
  features?: PublicVenueFeatures;
};

export function syncVenueCategories(body: {
  presetSlugs: string[];
  custom?: { name: string; color?: string }[];
}) {
  return api<ShopSettingsResponse>("/shop/venue-categories", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchPublicVenues(params?: {
  q?: string;
  city?: string;
  country?: string;
  categories?: string[];
}) {
  const sp = new URLSearchParams();
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.city?.trim()) sp.set("city", params.city.trim());
  if (params?.country?.trim()) sp.set("country", params.country.trim());
  if (params?.categories?.length) {
    sp.set("categories", params.categories.join(","));
  }
  const qs = sp.toString();
  return api<PublicVenuesResponse>(`/public/venues${qs ? `?${qs}` : ""}`);
}

export function fetchPublicVenue(slug: string) {
  return api<PublicVenueDetail>(`/public/venues/${encodeURIComponent(slug)}`);
}

export type RotateDashboardKeyResult = {
  slug: string;
  dashboardPath: string;
};

/** Owner-only; requires account password. Rewrites sessionStorage on success. */
export function rotateDashboardKey(body: { password: string }) {
  return api<RotateDashboardKeyResult>("/shop/dashboard-key/rotate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function rotateDashboardKeyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Could not regenerate dashboard key.";
}
