import type { ShopSettings } from "./shop-settings-client";

export type ShopProfileDraft = {
  name: string;
  displayName: string;
  description: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  isPublished: boolean;
  locale: string;
  timezone: string;
  currency: string;
  floorCount: number;
};

export function shopToProfileDraft(shop: ShopSettings): ShopProfileDraft {
  return {
    name: shop.name ?? "",
    displayName: shop.displayName ?? "",
    description: shop.description ?? "",
    address: shop.address ?? "",
    city: shop.city ?? "",
    country: shop.country ?? "",
    phone: shop.phone ?? "",
    email: shop.email ?? "",
    isPublished: shop.isPublished ?? false,
    locale: shop.locale ?? "en",
    timezone: shop.timezone?.trim() || "UTC",
    currency: shop.currency ?? "EUR",
    floorCount: shop.floorCount ?? 1,
  };
}

export function profileDraftMatches(
  shop: ShopSettings,
  draft: ShopProfileDraft,
): boolean {
  return (
    shop.name === draft.name.trim() &&
    (shop.displayName?.trim() || "") === draft.displayName.trim() &&
    (shop.description?.trim() || "") === draft.description.trim() &&
    (shop.address?.trim() || "") === draft.address.trim() &&
    (shop.city?.trim() || "") === draft.city.trim() &&
    (shop.country?.trim() || "") === draft.country.trim() &&
    (shop.phone?.trim() || "") === draft.phone.trim() &&
    (shop.email?.trim() || "") === draft.email.trim() &&
    shop.isPublished === draft.isPublished &&
    shop.locale === draft.locale &&
    (shop.timezone?.trim() || "UTC") === draft.timezone.trim() &&
    shop.currency === draft.currency &&
    (shop.floorCount ?? 1) === draft.floorCount
  );
}

export function profileDraftToPayload(draft: ShopProfileDraft) {
  return {
    name: draft.name.trim(),
    displayName: draft.displayName.trim() || null,
    description: draft.description.trim() || null,
    address: draft.address.trim() || null,
    city: draft.city.trim() || null,
    country: draft.country.trim() || null,
    phone: draft.phone.trim() || null,
    email: draft.email.trim() || null,
    isPublished: draft.isPublished,
    locale: draft.locale,
    timezone: draft.timezone.trim(),
    currency: draft.currency,
    floorCount: draft.floorCount,
  };
}

export function identityChanged(
  before: ShopSettings,
  after: ShopSettings,
): boolean {
  return (
    before.name !== after.name ||
    (before.displayName?.trim() || "") !== (after.displayName?.trim() || "")
  );
}
