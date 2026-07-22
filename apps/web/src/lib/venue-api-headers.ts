export const VENUE_PATH_STORAGE_KEY = "Locora.venuePath";

/** Persist public venue slug for API `x-venue-path` (membership-only bind). */
export function setStoredVenuePath(venuePath: string | null) {
  if (typeof window === "undefined") return;
  if (venuePath) {
    sessionStorage.setItem(VENUE_PATH_STORAGE_KEY, venuePath);
  } else {
    sessionStorage.removeItem(VENUE_PATH_STORAGE_KEY);
  }
}

export function getVenuePathHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const path = sessionStorage.getItem(VENUE_PATH_STORAGE_KEY);
  return path ? { "x-venue-path": path } : {};
}
