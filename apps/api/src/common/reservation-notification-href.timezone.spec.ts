import { reservationSessionsHref } from './reservation-notification-href';

describe('reservation session links use venue calendar date', () => {
  it('does not derive a Warsaw date from server UTC or server locale', () => {
    const instant = new Date('2026-06-01T23:30:00Z');
    expect(reservationSessionsHref(instant, 'dining', 'Europe/Warsaw'))
      .toBe('/sessions?tab=dining&date=2026-06-02');
    expect(reservationSessionsHref(instant, 'schedule', 'America/New_York'))
      .toBe('/sessions?tab=schedule&date=2026-06-01');
  });

  it('stays on the same venue date across the autumn DST repeated hour', () => {
    expect(reservationSessionsHref(new Date('2026-10-25T00:30:00Z'), 'schedule', 'Europe/Warsaw'))
      .toBe('/sessions?tab=schedule&date=2026-10-25');
    expect(reservationSessionsHref(new Date('2026-10-25T01:30:00Z'), 'schedule', 'Europe/Warsaw'))
      .toBe('/sessions?tab=schedule&date=2026-10-25');
  });
});
