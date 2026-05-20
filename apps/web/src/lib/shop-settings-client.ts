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

export type ShopSettingsResponse = {
  shop: ShopSettings;
  locales: { code: string; label: string }[];
  currencies: { code: string; label: string; symbol: string }[];
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

export function fetchPublicVenues() {
  return api<PublicVenue[]>("/public/venues");
}

export function fetchPublicVenue(slug: string) {
  return api<PublicVenueDetail>(`/public/venues/${encodeURIComponent(slug)}`);
}
