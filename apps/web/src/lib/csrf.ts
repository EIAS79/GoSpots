/** Must match API `CSRF_COOKIE` / `CSRF_HEADER`. */
export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

/** Fallback when `document.cookie` is briefly empty after `Set-Cookie` (race). */
let cachedCsrfToken: string | null = null;

export function getCsrfTokenFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function getCsrfToken(): string | null {
  return getCsrfTokenFromDocument() ?? cachedCsrfToken;
}

export function setCachedCsrfToken(token: string | null) {
  cachedCsrfToken = token;
}

export function clearCachedCsrfToken() {
  cachedCsrfToken = null;
}

export function getCsrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { [CSRF_HEADER]: token } : {};
}
