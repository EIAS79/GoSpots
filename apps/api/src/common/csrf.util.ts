import { randomBytes, timingSafeEqual } from 'crypto';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './csrf.constants';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time compare for equal-length UTF-8 strings. */
export function csrfTokensMatch(
  cookieToken: string | undefined,
  headerToken: string | undefined,
): boolean {
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken, 'utf8');
  const b = Buffer.from(headerToken, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isUnsafeMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

/** True when the request carries session cookies that CSRF could abuse. */
export function hasSessionCookies(cookies: Record<string, unknown> | undefined): boolean {
  if (!cookies) return false;
  return Boolean(cookies[ACCESS_COOKIE] || cookies[REFRESH_COOKIE]);
}

export function readCsrfHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = headers['x-csrf-token'] ?? headers['X-CSRF-Token'];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
