/**
 * Auth / CSRF cookie flags.
 *
 * Prefer SameSite=lax + same-origin Vercel `/api/v1` proxy.
 * SameSite=none is only for cross-site API calls (browser requires Secure).
 * CSRF double-submit remains required whenever session cookies are present.
 */

export type CookieSameSite = 'lax' | 'strict' | 'none';

export type AuthCookieFlags = {
  httpOnly: true;
  secure: boolean;
  sameSite: CookieSameSite;
};

export type ResolveCookieFlagsInput = {
  nodeEnv?: string | null;
  cookieSecure?: string | null;
  cookieSameSite?: string | null;
};

/** Access + CSRF cookies (site-wide). */
export const ACCESS_COOKIE_PATH = '/';

/** Refresh scoped to auth routes (login/refresh/logout). */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Resolve Secure / SameSite for Set-Cookie.
 *
 * - Local HTTP (`NODE_ENV` ≠ production): Secure off unless `COOKIE_SECURE=true`.
 * - Production: Secure on by default (even if `COOKIE_SECURE` unset).
 * - Explicit `COOKIE_SECURE=false` disables Secure except when SameSite=none.
 * - SameSite=none always forces Secure (browser requirement).
 */
export function resolveAuthCookieFlags(
  input: ResolveCookieFlagsInput = {},
): AuthCookieFlags {
  const sameSiteRaw = (input.cookieSameSite ?? 'lax').trim().toLowerCase();
  const sameSite: CookieSameSite =
    sameSiteRaw === 'none' || sameSiteRaw === 'strict' ? sameSiteRaw : 'lax';

  const secureEnv = (input.cookieSecure ?? '').trim().toLowerCase();
  const isProd = (input.nodeEnv ?? '').trim().toLowerCase() === 'production';

  let secure =
    secureEnv === 'true' || (isProd && secureEnv !== 'false');

  if (sameSite === 'none') secure = true;

  return { httpOnly: true, secure, sameSite };
}
