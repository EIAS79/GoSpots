/** Client-side IANA timezone helpers (mirrors API `venue-timezone.util`). */

const ianaCache = new Map<string, boolean>();

/** True when `tz` is accepted by the runtime Intl IANA database. */
export function isValidIanaTimeZone(tz: string): boolean {
  const key = tz.trim();
  if (!key) return false;
  const cached = ianaCache.get(key);
  if (cached != null) return cached;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: key });
    ianaCache.set(key, true);
    return true;
  } catch {
    ianaCache.set(key, false);
    return false;
  }
}

const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Warsaw",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Africa/Cairo",
] as const;

/** IANA zone ids for a settings select (full Intl list when available). */
export function listIanaTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported?.length) return [...supported];
  } catch {
    /* ignore */
  }
  return [...FALLBACK_TIMEZONES];
}
