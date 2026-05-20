export const VENUE_STAFF_LOGIN_SUFFIX = ".venueflow";

export function staffLoginPreview(username: string, shopSlug: string) {
  const u = username.trim().toLowerCase() || "username";
  const s = shopSlug.trim().toLowerCase() || "your-venue";
  return `${u}@${s}${VENUE_STAFF_LOGIN_SUFFIX}`;
}
