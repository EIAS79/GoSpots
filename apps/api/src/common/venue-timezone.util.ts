/**
 * Resolve an IANA timezone for venue-local calendar days (stock reset, reports).
 * Prefer Shop.timezone when set; otherwise map BCP-47 locale → best-effort zone.
 */

const LOCALE_TO_TZ: Record<string, string> = {
  en: 'UTC',
  'en-US': 'America/New_York',
  'en-GB': 'Europe/London',
  pl: 'Europe/Warsaw',
  de: 'Europe/Berlin',
  fr: 'Europe/Paris',
  es: 'Europe/Madrid',
  ar: 'Africa/Cairo',
  'ar-EG': 'Africa/Cairo',
};

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

export function localeToTimeZone(locale: string): string {
  return (
    LOCALE_TO_TZ[locale] ?? LOCALE_TO_TZ[locale.split('-')[0] ?? ''] ?? 'UTC'
  );
}

/**
 * Prefer explicit IANA `timezone`; fall back to locale heuristic; then UTC.
 * Safe to pass either a locale code or an IANA id in `timezone`/`locale`.
 */
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

  return 'UTC';
}

/** Calendar day YYYY-MM-DD in the given IANA timezone. */
export function calendarDayInTimeZone(
  timeZone: string,
  at = new Date(),
): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
  return at.toLocaleDateString('en-CA', { timeZone: tz });
}

const WEEKDAY_SHORT_TO_JS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** JS weekday 0=Sun … 6=Sat in the given IANA timezone. */
export function weekdayInTimeZone(at: Date, timeZone: string): number {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(at);
  return WEEKDAY_SHORT_TO_JS[short] ?? at.getUTCDay();
}

/** Offset ms such that `utcMs + offset ≈ wall clock in zone` (as UTC components). */
function wallClockOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    hour,
    Number(get('minute')),
    Number(get('second')),
  );
  return asUtc - instant.getTime();
}

/**
 * Interpret `YYYY-MM-DD` + `HH:mm` as venue wall clock in `timeZone`, return UTC Date.
 */
export function zonedWallTimeToUtc(
  dateKey: string,
  timeHm: string,
  timeZone: string,
): Date {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
  const [ys, mos, ds] = dateKey.split('-');
  const [hs, mis = '0'] = timeHm.split(':');
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const h = Number(hs);
  const mi = Number(mis);
  if (![y, mo, d, h, mi].every((n) => Number.isFinite(n))) {
    throw new RangeError(`Invalid wall time ${dateKey} ${timeHm}`);
  }

  const desiredAsUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  let utcMs = desiredAsUtc;
  for (let i = 0; i < 3; i++) {
    const offset = wallClockOffsetMs(new Date(utcMs), tz);
    const next = desiredAsUtc - offset;
    if (next === utcMs) break;
    utcMs = next;
  }
  return new Date(utcMs);
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict calendar `YYYY-MM-DD` (rejects 2026-13-40). */
export function parseDateKey(dateStr: string): {
  y: number;
  m: number;
  d: number;
  key: string;
} {
  const match = DATE_KEY_RE.exec(dateStr.trim());
  if (!match) {
    throw new RangeError(`Invalid date key ${dateStr}`);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new RangeError(`Invalid date key ${dateStr}`);
  }
  return { y, m, d, key: match[0] };
}

function addUtcCalendarDays(y: number, m: number, d: number, delta: number) {
  const probe = new Date(Date.UTC(y, m - 1, d + delta));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${probe.getUTCFullYear()}-${pad(probe.getUTCMonth() + 1)}-${pad(probe.getUTCDate())}`;
}

/**
 * Inclusive UTC instants for a venue calendar day (`YYYY-MM-DD` in `timeZone`).
 * Prefer this over process-local `dayBoundsLocal` for schedule overlap queries.
 */
export function dayBoundsInTimeZone(
  dateStr: string,
  timeZone: string,
): { dayStart: Date; dayEnd: Date } {
  const { y, m, d, key } = parseDateKey(dateStr);
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
  const dayStart = zonedWallTimeToUtc(key, '00:00', tz);
  const nextKey = addUtcCalendarDays(y, m, d, 1);
  const nextStart = zonedWallTimeToUtc(nextKey, '00:00', tz);
  return { dayStart, dayEnd: new Date(nextStart.getTime() - 1) };
}
