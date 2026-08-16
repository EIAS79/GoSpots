import {
  notePublicThrottle429,
  isCaptchaEscalated,
  resetCaptchaEscalationStoreForTests,
  resolvePublicCreateSurface,
} from './captcha-escalation.util';

describe('Phase 8 public booking abuse protection', () => {
  afterEach(() => resetCaptchaEscalationStoreForTests());

  it('classifies growth reservation and waitlist creation as booking surfaces', () => {
    expect(
      resolvePublicCreateSurface(
        'POST',
        '/api/v1/growth/public/demo/reservations',
      ),
    ).toBe('booking');
    expect(
      resolvePublicCreateSurface('POST', '/growth/public/demo/waitlist'),
    ).toBe('booking');
    expect(
      resolvePublicCreateSurface(
        'POST',
        '/growth/public/demo/reservations/res-1/cancel',
      ),
    ).toBeNull();
  });

  it('requires CAPTCHA after a throttled growth booking create', () => {
    notePublicThrottle429('203.0.113.8', 'booking', {
      now: 1_000,
      ttlMs: 60_000,
    });
    expect(
      isCaptchaEscalated('203.0.113.8', 'booking', { now: 1_001 }),
    ).toBe(true);
    expect(
      isCaptchaEscalated('203.0.113.8', 'booking', { now: 61_001 }),
    ).toBe(false);
  });
});
