import type { PublicCurrency, PublicLocale } from "./public-prefs";

export type DomainPublicDefaults = {
  locale: PublicLocale;
  currency: PublicCurrency;
};

const EU_DEFAULTS: DomainPublicDefaults = {
  locale: "en",
  currency: "EUR",
};

const PL_DEFAULTS: DomainPublicDefaults = {
  locale: "pl",
  currency: "PLN",
};

/**
 * Resolve the initial public-site preferences from the request host.
 *
 * This is intentionally a default only. PublicPrefsProvider lets a visitor's
 * saved/manual choice override it, and venue-owned dashboard settings remain
 * independent from the marketing/public-site domain.
 */
export function publicDefaultsForHost(
  host: string | null | undefined,
): DomainPublicDefaults {
  const hostname = (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    ?.split(":")[0];

  if (hostname === "gospots.pl" || hostname === "www.gospots.pl") {
    return PL_DEFAULTS;
  }

  return EU_DEFAULTS;
}
