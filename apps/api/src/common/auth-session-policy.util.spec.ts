import {
  computeSessionExpiresAt,
  DEFAULT_IDLE_TTL_SEC,
  DEFAULT_REFRESH_TTL_SEC,
  isSessionAbsolutelyExpired,
  isSessionIdleExpired,
  REMEMBER_IDLE_TTL_SEC,
  REMEMBER_REFRESH_TTL_SEC,
  resolveIdleTtlSec,
  resolveRefreshTtlSec,
} from './auth-session-policy.util';

describe('auth-session-policy.util', () => {
  const now = new Date('2026-07-26T12:00:00.000Z');

  it('resolves default vs remember-me refresh TTLs', () => {
    expect(resolveRefreshTtlSec(false)).toBe(DEFAULT_REFRESH_TTL_SEC);
    expect(resolveRefreshTtlSec(true)).toBe(REMEMBER_REFRESH_TTL_SEC);
    expect(
      resolveRefreshTtlSec(false, { jwtRefreshTtl: '100' }),
    ).toBe(100);
    expect(
      resolveRefreshTtlSec(true, { jwtRefreshTtlRemember: '200' }),
    ).toBe(200);
  });

  it('resolves idle TTLs', () => {
    expect(resolveIdleTtlSec(false)).toBe(DEFAULT_IDLE_TTL_SEC);
    expect(resolveIdleTtlSec(true)).toBe(REMEMBER_IDLE_TTL_SEC);
  });

  it('caps sliding expiry at absoluteExpiresAt', () => {
    const absolute = new Date('2026-07-26T14:00:00.000Z');
    const slid = computeSessionExpiresAt({
      now,
      refreshTtlSec: 43_200,
      absoluteExpiresAt: absolute,
    });
    expect(slid.toISOString()).toBe(absolute.toISOString());
  });

  it('detects idle and absolute expiry', () => {
    expect(
      isSessionIdleExpired({
        now,
        lastActiveAt: new Date('2026-07-26T11:20:00.000Z'),
        idleTtlSec: DEFAULT_IDLE_TTL_SEC,
      }),
    ).toBe(true);
    expect(
      isSessionIdleExpired({
        now,
        lastActiveAt: new Date('2026-07-26T11:45:00.000Z'),
        idleTtlSec: DEFAULT_IDLE_TTL_SEC,
      }),
    ).toBe(false);
    expect(
      isSessionAbsolutelyExpired({
        now,
        absoluteExpiresAt: new Date('2026-07-26T11:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isSessionAbsolutelyExpired({
        now,
        absoluteExpiresAt: null,
      }),
    ).toBe(false);
  });
});
