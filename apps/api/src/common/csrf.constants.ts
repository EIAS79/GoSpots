/** Double-submit CSRF cookie (readable by JS; not httpOnly). */
export const CSRF_COOKIE = 'csrf_token';

/** Header that must match {@link CSRF_COOKIE} on cookie-authenticated mutations. */
export const CSRF_HEADER = 'x-csrf-token';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
