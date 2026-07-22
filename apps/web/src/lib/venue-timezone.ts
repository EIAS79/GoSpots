/**
 * Venue calendar day keys for the web app — mirrors API `venue-timezone.util`.
 * Use for YYYY-MM-DD keys aligned with `Shop.timezone` (IANA), not browser local.
 */

import { isValidIanaTimeZone } from "./iana-timezone";

const LOCALE_TO_TZ: Record<string, string> = {
  en: "UTC",
  "en-US": "America/New_York",
  "en-GB": "Europe/London",
  pl: "Europe/Warsaw",
  de: "Europe/Berlin",
  fr: "Europe/Paris",
  es: "Europe/Madrid",
  ar: "Africa/Cairo",
  "ar-EG": "Africa/Cairo",
};

export function localeToTimeZone(locale: string): string {
  return (
    LOCALE_TO_TZ[locale] ?? LOCALE_TO_TZ[locale.split("-")[0] ?? ""] ?? "UTC"
  );
}

/** Prefer explicit IANA `timezone`; fall back to locale heuristic; then UTC. */
export function resolveVenueTimeZone(opts: {
  timezone?: string | null;
  locale?: string | null;
}): string {
  const explicit = opts.timezone?.trim();
  if (explicit && isValidIanaTimeZone(explicit)) return explicit;

  const locale = opts.locale?.trim();
  if (locale) {
    if (isValidIanaTimeZone(locale)) return locale;
    return localeToTimeZone(locale);
  }

  return "UTC";
}

/** Calendar day YYYY-MM-DD in the given IANA timezone. */
export function calendarDayInTimeZone(
  timeZone: string,
  at = new Date(),
): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  return at.toLocaleDateString("en-CA", { timeZone: tz });
}

/** Calendar day key in venue timezone (YYYY-MM-DD). Accepts IANA or locale code. */
export function venueDayKey(timezoneOrLocale: string, at = new Date()): string {
  const trimmed = timezoneOrLocale.trim();
  const timeZone =
    trimmed && isValidIanaTimeZone(trimmed)
      ? trimmed
      : resolveVenueTimeZone({ locale: trimmed || null });
  return calendarDayInTimeZone(timeZone, at);
}

/** Shift a venue/API calendar key by whole days (UTC calendar math on the key). */
export function addVenueCalendarDays(dateKey: string, delta: number): string {
  const [ys, mos, ds] = dateKey.split("-");
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const probe = new Date(Date.UTC(y, mo - 1, d + delta));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${probe.getUTCFullYear()}-${pad(probe.getUTCMonth() + 1)}-${pad(probe.getUTCDate())}`;
}

/** Format a venue day key for staff display (weekday + short date in locale). */
export function formatVenueDayKey(dateKey: string, locale: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function isVenueToday(
  dateKey: string,
  timeZone: string,
  at = new Date(),
): boolean {
  return dateKey === calendarDayInTimeZone(timeZone, at);
}
