export const VENUE_STAFF_LOGIN_SUFFIX = ".locora";
/** Pre-rebrand staff logins still accepted */
export const LEGACY_VENUE_STAFF_LOGIN_SUFFIX = ".gospots";
export const LEGACY_VENUE_STAFF_LOGIN_SUFFIX_VENUEFLOW = ".venueflow";

export function staffLoginPreview(username: string, shopSlug: string) {
  const u = username.trim().toLowerCase() || "username";
  const s = shopSlug.trim().toLowerCase() || "your-venue";
  return `${u}@${s}${VENUE_STAFF_LOGIN_SUFFIX}`;
}
