import {
  csrfTokensMatch,
  generateCsrfToken,
  hasSessionCookies,
  isUnsafeMethod,
  readCsrfHeader,
} from './csrf.util';

describe('csrf.util', () => {
  it('generateCsrfToken returns opaque base64url', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
  });

  it('csrfTokensMatch accepts equal tokens and rejects mismatch/missing', () => {
    expect(csrfTokensMatch('abc', 'abc')).toBe(true);
    expect(csrfTokensMatch('abc', 'abd')).toBe(false);
    expect(csrfTokensMatch('abc', 'ab')).toBe(false);
    expect(csrfTokensMatch(undefined, 'abc')).toBe(false);
    expect(csrfTokensMatch('abc', undefined)).toBe(false);
  });

  it('isUnsafeMethod flags mutations only', () => {
    expect(isUnsafeMethod('GET')).toBe(false);
    expect(isUnsafeMethod('head')).toBe(false);
    expect(isUnsafeMethod('OPTIONS')).toBe(false);
    expect(isUnsafeMethod('POST')).toBe(true);
    expect(isUnsafeMethod('DELETE')).toBe(true);
    expect(isUnsafeMethod('patch')).toBe(true);
  });

  it('hasSessionCookies detects access or refresh', () => {
    expect(hasSessionCookies(undefined)).toBe(false);
    expect(hasSessionCookies({})).toBe(false);
    expect(hasSessionCookies({ access_token: 'x' })).toBe(true);
    expect(hasSessionCookies({ refresh_token: 'y' })).toBe(true);
  });

  it('readCsrfHeader is case-tolerant', () => {
    expect(readCsrfHeader({ 'x-csrf-token': 't1' })).toBe('t1');
    expect(readCsrfHeader({ 'X-CSRF-Token': 't2' })).toBe('t2');
    expect(readCsrfHeader({ 'x-csrf-token': ['t3', 't4'] })).toBe('t3');
  });
});
