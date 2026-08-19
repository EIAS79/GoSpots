import { businessDayBounds } from '../../common/business-day.util';

const hours = (start: Date, end: Date) => (end.getTime() - start.getTime()) / 3_600_000;

describe('Phase 14 analytics business-day boundaries', () => {
  it('proves Europe/Warsaw DST-forward business day is 23 elapsed hours', () => {
    const bounds = businessDayBounds({ dateKey: '2026-03-29', timeZone: 'Europe/Warsaw', startMinutes: 0 });
    expect(hours(bounds.start, bounds.end)).toBe(23);
  });

  it('proves Europe/Warsaw DST-backward business day is 25 elapsed hours', () => {
    const bounds = businessDayBounds({ dateKey: '2026-10-25', timeZone: 'Europe/Warsaw', startMinutes: 0 });
    expect(hours(bounds.start, bounds.end)).toBe(25);
  });

  it('proves an overnight 04:00 business-day boundary is not UTC midnight', () => {
    const bounds = businessDayBounds({ dateKey: '2026-08-19', timeZone: 'Europe/Warsaw', startMinutes: 240 });
    expect(bounds.start.toISOString()).toBe('2026-08-19T02:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-08-20T02:00:00.000Z');
  });

  it('keeps different branch timezone/business-day settings distinct', () => {
    const warsaw = businessDayBounds({ dateKey: '2026-08-19', timeZone: 'Europe/Warsaw', startMinutes: 240 });
    const london = businessDayBounds({ dateKey: '2026-08-19', timeZone: 'Europe/London', startMinutes: 120 });
    expect(warsaw.start.getTime()).not.toBe(london.start.getTime());
    expect(warsaw.end.getTime()).not.toBe(london.end.getTime());
  });
});
