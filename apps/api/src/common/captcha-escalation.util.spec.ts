import {
  isCaptchaEscalated,
  notePublicThrottle429,
  resetCaptchaEscalationStoreForTests,
  resolvePublicCreateSurface,
  resolvePublicCreateSurfaceFromRequest,
} from './captcha-escalation.util';

describe('captcha-escalation.util', () => {
  beforeEach(() => {
    resetCaptchaEscalationStoreForTests();
  });

  describe('resolvePublicCreateSurface', () => {
    it('maps public create POSTs (with and without api prefix)', () => {
      expect(
        resolvePublicCreateSurface(
          'POST',
          '/api/v1/public/venues/acme/reviews',
        ),
      ).toBe('review');
      expect(
        resolvePublicCreateSurface('POST', '/public/venues/acme/contact'),
      ).toBe('contact');
      expect(
        resolvePublicCreateSurface(
          'POST',
          '/api/v1/public/venues/acme/event-requests?x=1',
        ),
      ).toBe('event');
      expect(
        resolvePublicCreateSurface(
          'POST',
          '/public/venues/acme/dining/reservations',
        ),
      ).toBe('booking');
      expect(
        resolvePublicCreateSurface(
          'POST',
          '/public/venues/acme/gaming/reservations/',
        ),
      ).toBe('booking');
      expect(
        resolvePublicCreateSurface('POST', '/public/venues/acme/chats'),
      ).toBe('chatOpen');
    });

    it('ignores non-create / non-POST / chat message paths', () => {
      expect(
        resolvePublicCreateSurface('GET', '/public/venues/acme/reviews'),
      ).toBeNull();
      expect(
        resolvePublicCreateSurface(
          'POST',
          '/public/venues/acme/chats/tok/messages',
        ),
      ).toBeNull();
      expect(
        resolvePublicCreateSurface(
          'POST',
          '/public/venues/acme/gaming/schedule',
        ),
      ).toBeNull();
    });

    it('resolvePublicCreateSurfaceFromRequest prefers originalUrl', () => {
      expect(
        resolvePublicCreateSurfaceFromRequest({
          method: 'POST',
          originalUrl: '/api/v1/public/venues/x/contact',
          path: '/ignored',
        }),
      ).toBe('contact');
    });
  });

  describe('notePublicThrottle429 / isCaptchaEscalated', () => {
    const ttlMs = 60_000;
    const t0 = 1_700_000_000_000;

    it('blank ip never escalates', () => {
      notePublicThrottle429('  ', 'booking', { now: t0, ttlMs });
      expect(isCaptchaEscalated('', 'booking', { now: t0 + 1 })).toBe(false);
    });

    it('single-surface 429 escalates that surface until TTL', () => {
      notePublicThrottle429('1.2.3.4', 'booking', { now: t0, ttlMs });
      expect(isCaptchaEscalated('1.2.3.4', 'booking', { now: t0 + 1 })).toBe(
        true,
      );
      expect(isCaptchaEscalated('1.2.3.4', 'contact', { now: t0 + 1 })).toBe(
        false,
      );
      expect(
        isCaptchaEscalated('1.2.3.4', 'booking', { now: t0 + ttlMs + 1 }),
      ).toBe(false);
    });

    it('cross-surface burst escalates all public creates', () => {
      notePublicThrottle429('9.9.9.9', 'booking', { now: t0, ttlMs });
      notePublicThrottle429('9.9.9.9', 'review', { now: t0 + 100, ttlMs });
      expect(isCaptchaEscalated('9.9.9.9', 'contact', { now: t0 + 200 })).toBe(
        true,
      );
      expect(isCaptchaEscalated('9.9.9.9', 'chatOpen', { now: t0 + 200 })).toBe(
        true,
      );
      expect(
        isCaptchaEscalated('9.9.9.9', 'contact', { now: t0 + ttlMs + 200 }),
      ).toBe(false);
    });

    it('extends until on repeated 429 for same surface', () => {
      notePublicThrottle429('5.5.5.5', 'event', { now: t0, ttlMs });
      notePublicThrottle429('5.5.5.5', 'event', {
        now: t0 + 10_000,
        ttlMs,
      });
      expect(
        isCaptchaEscalated('5.5.5.5', 'event', { now: t0 + ttlMs - 1 }),
      ).toBe(true);
      expect(
        isCaptchaEscalated('5.5.5.5', 'event', {
          now: t0 + 10_000 + ttlMs - 1,
        }),
      ).toBe(true);
      expect(
        isCaptchaEscalated('5.5.5.5', 'event', {
          now: t0 + 10_000 + ttlMs + 1,
        }),
      ).toBe(false);
    });
  });
});
