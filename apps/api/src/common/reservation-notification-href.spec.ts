import {
  absoluteAppUrl,
  guestVenueStatusPath,
  isSafeAppRelativeHref,
  reservationSessionsHref,
  sanitizeAppRelativeHref,
} from './reservation-notification-href';

describe('isSafeAppRelativeHref', () => {
  it.each([
    '/sessions',
    '/sessions?tab=dining&date=2026-07-20',
    '/venue/my-shop/gaming-status/abc123',
    '/staff',
    '/messages?chat=cuid',
  ])('allows %s', (href) => {
    expect(isSafeAppRelativeHref(href)).toBe(true);
  });

  it.each([
    'https://evil.example/phish',
    'http://evil.example',
    '//evil.example/phish',
    '/\\evil.example',
    '\\\\evil.example',
    '/sessions/../../etc/passwd',
    'sessions',
    '',
    'javascript:alert(1)',
    'https://evil.example/sessions',
  ])('rejects %s', (href) => {
    expect(isSafeAppRelativeHref(href)).toBe(false);
  });
});

describe('sanitizeAppRelativeHref', () => {
  it('returns fallback for unsafe absolute URLs', () => {
    expect(sanitizeAppRelativeHref('https://evil.example', '/sessions')).toBe(
      '/sessions',
    );
    expect(sanitizeAppRelativeHref('//evil.example', '/staff')).toBe('/staff');
  });

  it('keeps safe relative paths', () => {
    expect(sanitizeAppRelativeHref('/finance')).toBe('/finance');
  });
});

describe('absoluteAppUrl', () => {
  it('joins only safe relative paths', () => {
    expect(absoluteAppUrl('https://app.example/', '/venue/a/gaming-status/t')).toBe(
      'https://app.example/venue/a/gaming-status/t',
    );
  });

  it('returns null for open-redirect candidates', () => {
    expect(absoluteAppUrl('https://app.example', 'https://evil.example')).toBeNull();
    expect(absoluteAppUrl('https://app.example', '//evil.example')).toBeNull();
    expect(absoluteAppUrl('https://app.example', 'venue/x')).toBeNull();
  });
});

describe('guestVenueStatusPath', () => {
  it('builds dining / gaming / event paths from DB slug', () => {
    expect(guestVenueStatusPath('acme', 'tok_1', 'dining')).toBe(
      '/venue/acme/dining-status/tok_1',
    );
    expect(guestVenueStatusPath('acme', 'tok_1', 'gaming')).toBe(
      '/venue/acme/gaming-status/tok_1',
    );
    expect(guestVenueStatusPath('acme', 'tok_1', 'event')).toBe(
      '/venue/acme/event-status/tok_1',
    );
  });

  it('rejects path-breaking slug or token', () => {
    expect(guestVenueStatusPath('../x', 'tok', 'gaming')).toBe('/');
    expect(guestVenueStatusPath('acme', 'a/b', 'gaming')).toBe('/');
    expect(guestVenueStatusPath('acme', '..', 'gaming')).toBe('/');
  });
});

describe('reservationSessionsHref', () => {
  it('returns sanitized sessions query paths', () => {
    const d = new Date(2026, 6, 20, 12, 0, 0);
    expect(reservationSessionsHref(d, 'dining')).toBe(
      '/sessions?tab=dining&date=2026-07-20',
    );
    expect(reservationSessionsHref(d, 'events')).toBe('/sessions?tab=events');
  });
});
