import { businessDayBounds, businessDayKeyAt } from './business-day.util';

describe('venue business-day semantics', () => {
  const context = { timezone: 'Europe/Warsaw', startMinutes: 4 * 60 };

  it('assigns after-midnight activity to the previous business day', () => {
    expect(businessDayKeyAt(new Date('2026-08-14T00:30:00Z'), context)).toBe(
      '2026-08-13',
    );
    expect(businessDayKeyAt(new Date('2026-08-14T02:30:00Z'), context)).toBe(
      '2026-08-14',
    );
  });

  it('uses a 23-hour spring DST business day without process-local assumptions', () => {
    const bounds = businessDayBounds('2026-03-28', context);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('uses a 25-hour autumn DST business day', () => {
    const bounds = businessDayBounds('2026-10-24', context);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });
});
