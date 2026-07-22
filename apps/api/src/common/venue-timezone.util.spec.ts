import {
  calendarDayInTimeZone,
  dayBoundsInTimeZone,
  isValidIanaTimeZone,
  localeToTimeZone,
  parseDateKey,
  resolveVenueTimeZone,
  weekdayInTimeZone,
  zonedWallTimeToUtc,
} from './venue-timezone.util';

describe('venue-timezone.util', () => {
  it('validates IANA zones', () => {
    expect(isValidIanaTimeZone('Europe/Warsaw')).toBe(true);
    expect(isValidIanaTimeZone('UTC')).toBe(true);
    expect(isValidIanaTimeZone('Not/AZone')).toBe(false);
    expect(isValidIanaTimeZone('')).toBe(false);
  });

  it('maps locales and prefers explicit timezone', () => {
    expect(localeToTimeZone('pl')).toBe('Europe/Warsaw');
    expect(localeToTimeZone('de')).toBe('Europe/Berlin');
    expect(resolveVenueTimeZone({ timezone: 'Europe/Paris', locale: 'en' })).toBe(
      'Europe/Paris',
    );
    expect(resolveVenueTimeZone({ timezone: null, locale: 'pl' })).toBe(
      'Europe/Warsaw',
    );
    expect(resolveVenueTimeZone({ timezone: 'bogus', locale: 'fr' })).toBe(
      'Europe/Paris',
    );
    expect(resolveVenueTimeZone({})).toBe('UTC');
  });

  it('accepts IANA string passed as locale (backward compat)', () => {
    expect(resolveVenueTimeZone({ locale: 'America/New_York' })).toBe(
      'America/New_York',
    );
  });

  it('formats calendar day in zone', () => {
    // 2026-07-20 23:30 UTC → still 20th in New York, 21st in Tokyo
    const nearMidnightUtc = new Date('2026-07-20T23:30:00.000Z');
    expect(calendarDayInTimeZone('America/New_York', nearMidnightUtc)).toBe(
      '2026-07-20',
    );
    expect(calendarDayInTimeZone('Asia/Tokyo', nearMidnightUtc)).toBe(
      '2026-07-21',
    );
  });

  it('maps weekday and wall clock in zone', () => {
    // Monday 2026-07-20 12:00 Warsaw (CEST, UTC+2)
    const noonWarsaw = new Date('2026-07-20T10:00:00.000Z');
    expect(weekdayInTimeZone(noonWarsaw, 'Europe/Warsaw')).toBe(1);
    expect(zonedWallTimeToUtc('2026-07-20', '12:00', 'Europe/Warsaw')).toEqual(
      noonWarsaw,
    );
    expect(zonedWallTimeToUtc('2026-07-20', '10:00', 'UTC')).toEqual(
      new Date('2026-07-20T10:00:00.000Z'),
    );
  });

  it('parses date keys and day bounds in zone', () => {
    expect(parseDateKey('2026-07-20')).toEqual({
      y: 2026,
      m: 7,
      d: 20,
      key: '2026-07-20',
    });
    expect(() => parseDateKey('2026-13-01')).toThrow(/Invalid date key/);
    expect(() => parseDateKey('2026-07-20T12:00:00')).toThrow(/Invalid date key/);

    const { dayStart, dayEnd } = dayBoundsInTimeZone(
      '2026-07-20',
      'Europe/Warsaw',
    );
    expect(dayStart).toEqual(
      zonedWallTimeToUtc('2026-07-20', '00:00', 'Europe/Warsaw'),
    );
    expect(dayEnd.getTime()).toBe(
      zonedWallTimeToUtc('2026-07-21', '00:00', 'Europe/Warsaw').getTime() - 1,
    );
  });
});
