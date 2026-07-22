/**
 * City-first marketplace pilot cities (bible #35 Phase A).
 * Add a city here + i18n keys before launching a second metro.
 * Live cohort execution is operator work — see MARKETPLACE_GTM_CHECKLIST.md.
 */

export type PilotCity = {
  /** URL slug under `/venues/[citySlug]` (ASCII). */
  slug: string;
  /** Display name (may include diacritics). */
  name: string;
  /** Value passed to `GET /public/venues?city=` (match Shop.city). */
  cityQuery: string;
  /** ISO country hint for directory filter. */
  country: string;
  /** Country display for copy. */
  countryName: string;
  /** IANA timezone for operator notes (not rendered as product clock). */
  timezone: string;
};

/** Active pilot — one city until S2 density gate. */
export const PILOT_CITIES: readonly PilotCity[] = [
  {
    slug: "wroclaw",
    name: "Wrocław",
    cityQuery: "Wrocław",
    country: "PL",
    countryName: "Poland",
    timezone: "Europe/Warsaw",
  },
] as const;

export const DEFAULT_PILOT_CITY = PILOT_CITIES[0]!;

export function getPilotCityBySlug(slug: string): PilotCity | undefined {
  const normalized = slug.trim().toLowerCase();
  return PILOT_CITIES.find((c) => c.slug === normalized);
}

export function pilotCityDirectoryHref(city: PilotCity): string {
  const sp = new URLSearchParams();
  sp.set("city", city.cityQuery);
  sp.set("country", city.country);
  return `/venues?${sp.toString()}`;
}

export function pilotCityLandingHref(city: PilotCity = DEFAULT_PILOT_CITY): string {
  return `/venues/${city.slug}`;
}
