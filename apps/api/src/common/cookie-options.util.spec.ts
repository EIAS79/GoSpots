import {
  ACCESS_COOKIE_PATH,
  REFRESH_COOKIE_PATH,
  resolveAuthCookieFlags,
} from './cookie-options.util';

describe('resolveAuthCookieFlags', () => {
  it('defaults to lax + insecure for local development', () => {
    expect(resolveAuthCookieFlags({ nodeEnv: 'development' })).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });
  });

  it('enables Secure in production even when COOKIE_SECURE unset', () => {
    expect(resolveAuthCookieFlags({ nodeEnv: 'production' })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
  });

  it('honors COOKIE_SECURE=true on localhost', () => {
    expect(
      resolveAuthCookieFlags({
        nodeEnv: 'development',
        cookieSecure: 'true',
      }),
    ).toMatchObject({ secure: true });
  });

  it('allows COOKIE_SECURE=false override in production (except none)', () => {
    expect(
      resolveAuthCookieFlags({
        nodeEnv: 'production',
        cookieSecure: 'false',
        cookieSameSite: 'lax',
      }),
    ).toMatchObject({ secure: false, sameSite: 'lax' });
  });

  it('forces Secure when SameSite=none', () => {
    expect(
      resolveAuthCookieFlags({
        nodeEnv: 'development',
        cookieSecure: 'false',
        cookieSameSite: 'none',
      }),
    ).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
  });

  it('normalizes SameSite case and falls back to lax', () => {
    expect(
      resolveAuthCookieFlags({ cookieSameSite: 'Strict' }).sameSite,
    ).toBe('strict');
    expect(
      resolveAuthCookieFlags({ cookieSameSite: 'bogus' }).sameSite,
    ).toBe('lax');
  });

  it('exports intentional cookie paths', () => {
    expect(ACCESS_COOKIE_PATH).toBe('/');
    expect(REFRESH_COOKIE_PATH).toBe('/api/v1/auth');
  });
});
