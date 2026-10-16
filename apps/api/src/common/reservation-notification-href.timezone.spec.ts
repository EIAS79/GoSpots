import { isSafeAppRelativeHref, reservationSessionsHref } from './reservation-notification-href';

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
  it('keeps rejecting every ASCII control code and DEL inside relative links', () => {
    for (let code = 0; code <= 0x1f; code += 1) {
      expect(isSafeAppRelativeHref(`/sessions?name=ok${String.fromCharCode(code)}still-here`))
        .toBe(false);
    }
    expect(isSafeAppRelativeHref(`/sessions?name=ok${String.fromCharCode(0x7f)}still-here`))
      .toBe(false);
  });

  it('rejects external and traversal-style notification redirects after the lint fix', () => {
    for (const href of [
      'https://external.example/path',
      '//external.example/path',
      '/sessions/../admin',
      '/sessions\\external',
    ]) {
      expect(isSafeAppRelativeHref(href)).toBe(false);
    }
    expect(isSafeAppRelativeHref('/sessions?tab=dining')).toBe(true);
  });
});
