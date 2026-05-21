/** Staff login domain — not valid for public /register */
export const VENUE_STAFF_EMAIL_SUFFIX = ".gospots";
/** Pre-rebrand logins still accepted */
export const LEGACY_VENUE_STAFF_EMAIL_SUFFIX = ".venueflow";

export function buildStaffLoginEmail(handle: string, shopSlug: string): string {
  const h = handle.trim().toLowerCase();
  const slug = shopSlug.trim().toLowerCase();
  return `${h}@${slug}${VENUE_STAFF_EMAIL_SUFFIX}`;
}

export function isVenueStaffLoginEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith(VENUE_STAFF_EMAIL_SUFFIX) ||
    lower.endsWith(LEGACY_VENUE_STAFF_EMAIL_SUFFIX)
  );
}

export function parseStaffHandleFromEmail(email: string): string | null {
  const lower = email.trim().toLowerCase();
  if (!isVenueStaffLoginEmail(lower)) return null;
  const at = lower.indexOf("@");
  if (at <= 0) return null;
  return lower.slice(0, at);
}

export function normalizeLoginIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidStaffHandle(handle: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/i.test(handle);
}

export function isValidOwnerEmail(email: string): boolean {
  if (isVenueStaffLoginEmail(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
