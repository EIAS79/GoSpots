import { api } from "./api";

export type ShopSettings = {
  id: string;
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
  currency: string;
  isPublished: boolean;
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

export type ShopSettingsResponse = {
  shop: ShopSettings;
  locales: { code: string; label: string }[];
  currencies: { code: string; label: string; symbol: string }[];
  venueCategoryPresets?: VenueCategoryPreset[];
  venueCategories?: VenueCategoryTag[];
};

export function fetchShopSettings() {
  return api<ShopSettingsResponse>("/shop/settings");
}

export function updateShopSettings(body: Partial<{
  locale: string;
  currency: string;
  name: string;
  displayName: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  isPublished: boolean;
  floorCount: number;
}>) {
  return api<ShopSettingsResponse>("/shop/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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

export type PublicVenue = {
  id: string;
  slug: string;
  name: string;
  displayName: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  coverImage: string | null;
  locale: string;
  currency: string;
  tags?: VenueCategoryTag[];
};

export type PublicVenueDetail = PublicVenue & {
  address: string | null;
  phone: string | null;
  email: string | null;
  galleryItems: {
    id: string;
    imageUrl: string;
    caption: string | null;
    sortOrder: number;
  }[];
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
  return api<PublicVenue[]>(`/public/venues${qs ? `?${qs}` : ""}`);
}

export function fetchPublicVenue(slug: string) {
  return api<PublicVenueDetail>(`/public/venues/${encodeURIComponent(slug)}`);
}
