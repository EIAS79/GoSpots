import {
  isValidIanaTimeZone,
  parseDateKey,
  zonedWallTimeToUtc,
} from './venue-timezone.util';

export type BusinessDayContext = {
  timezone: string;
  startMinutes: number;
};

export function assertBusinessDayStartMinutes(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value >= 1440) {
    throw new RangeError('Business day start must be an integer from 0 to 1439');
  }
  return value;
}

function addDateKeyDays(dateKey: string, delta: number): string {
  const { y, m, d } = parseDateKey(dateKey);
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return next.toISOString().slice(0, 10);
}

function localDateAndMinutes(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '0';
  const dateKey = `${part('year')}-${part('month')}-${part('day')}`;
  const hour = Number(part('hour')) % 24;
  return { dateKey, minutes: hour * 60 + Number(part('minute')) };
}

/** Venue business-day key for an authoritative UTC instant. */
export function businessDayKeyAt(at: Date, context: BusinessDayContext): string {
  const timezone = isValidIanaTimeZone(context.timezone) ? context.timezone : 'UTC';
  const startMinutes = assertBusinessDayStartMinutes(context.startMinutes);
  const local = localDateAndMinutes(at, timezone);
  return local.minutes < startMinutes
    ? addDateKeyDays(local.dateKey, -1)
    : local.dateKey;
}

/** UTC half-open range [start, end) for one venue business day. */
export function businessDayBounds(
  businessDayKey: string,
  context: BusinessDayContext,
): { start: Date; end: Date } {
  const timezone = isValidIanaTimeZone(context.timezone) ? context.timezone : 'UTC';
  const startMinutes = assertBusinessDayStartMinutes(context.startMinutes);
  const time = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(
    startMinutes % 60,
  ).padStart(2, '0')}`;
  const start = zonedWallTimeToUtc(businessDayKey, time, timezone);
  const end = zonedWallTimeToUtc(addDateKeyDays(businessDayKey, 1), time, timezone);
  return { start, end };
}
