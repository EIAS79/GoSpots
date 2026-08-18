import { getOperatorAttributionHeaders } from "./operator-session";

export const VENUE_PATH_STORAGE_KEY = "gospots.venuePath";
const LEGACY_VENUE_PATH_STORAGE_KEY = "Locora.venuePath";

/** Persist public venue slug for API `x-venue-path` (membership-only bind). */
export function setStoredVenuePath(venuePath: string | null) {
  if (typeof window === "undefined") return;
  if (venuePath) {
    sessionStorage.setItem(VENUE_PATH_STORAGE_KEY, venuePath);
    sessionStorage.removeItem(LEGACY_VENUE_PATH_STORAGE_KEY);
  } else {
    sessionStorage.removeItem(VENUE_PATH_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_VENUE_PATH_STORAGE_KEY);
  }
}

/**
 * Shared tenant/request headers. Phase 10 operator attribution is attached to
 * the same authenticated API origin and is server-validated before it can
 * influence action attribution. The short-lived raw token remains session-only.
 */
export function getVenuePathHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const path =
    sessionStorage.getItem(VENUE_PATH_STORAGE_KEY) ||
    sessionStorage.getItem(LEGACY_VENUE_PATH_STORAGE_KEY);
  return {
    ...(path ? { "x-venue-path": path } : {}),
    ...getOperatorAttributionHeaders(),
  };
}
