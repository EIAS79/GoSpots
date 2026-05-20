/** Name shown on marketing pages and public venue profile. */
export function venueMarketingName(venue: {
  name: string;
  displayName?: string | null;
}) {
  return venue.displayName?.trim() || venue.name;
}

export function formatVenueLocation(venue: {
  address?: string | null;
  city?: string | null;
  country?: string | null;
}) {
  const parts = [
    venue.address?.trim(),
    venue.city?.trim(),
    venue.country?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
