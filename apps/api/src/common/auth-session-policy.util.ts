/** Default dashboard session (no remember-me): 12h absolute. */
export const DEFAULT_REFRESH_TTL_SEC = 43_200;
/** Remember-me absolute cap: 30 days. */
export const REMEMBER_REFRESH_TTL_SEC = 2_592_000;
/** Idle without remember-me: 30 minutes. */
export const DEFAULT_IDLE_TTL_SEC = 1_800;
/** Idle with remember-me: 7 days. */
export const REMEMBER_IDLE_TTL_SEC = 604_800;

export type AuthSessionTtlConfig = {
  jwtRefreshTtl?: string | number | null;
  jwtRefreshTtlRemember?: string | number | null;
  authIdleTtlSec?: string | number | null;
  authIdleTtlRememberSec?: string | number | null;
};

function parsePositiveInt(
  value: string | number | null | undefined,
  fallback: number,
): number {
  if (value == null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function resolveRefreshTtlSec(
  rememberMe: boolean,
  config: AuthSessionTtlConfig = {},
): number {
  if (rememberMe) {
    return parsePositiveInt(
      config.jwtRefreshTtlRemember,
      REMEMBER_REFRESH_TTL_SEC,
    );
  }
  return parsePositiveInt(config.jwtRefreshTtl, DEFAULT_REFRESH_TTL_SEC);
}

export function resolveIdleTtlSec(
  rememberMe: boolean,
  config: AuthSessionTtlConfig = {},
): number {
  if (rememberMe) {
    return parsePositiveInt(
      config.authIdleTtlRememberSec,
      REMEMBER_IDLE_TTL_SEC,
    );
  }
  return parsePositiveInt(config.authIdleTtlSec, DEFAULT_IDLE_TTL_SEC);
}

/** Sliding expiry capped by absolute login window. */
export function computeSessionExpiresAt(input: {
  now?: Date;
  refreshTtlSec: number;
  absoluteExpiresAt: Date | null | undefined;
}): Date {
  const now = input.now ?? new Date();
  const slid = new Date(now.getTime() + input.refreshTtlSec * 1000);
  if (!input.absoluteExpiresAt) return slid;
  return slid.getTime() <= input.absoluteExpiresAt.getTime()
    ? slid
    : new Date(input.absoluteExpiresAt);
}

export function isSessionIdleExpired(input: {
  now?: Date;
  lastActiveAt: Date;
  idleTtlSec: number;
}): boolean {
  const now = input.now ?? new Date();
  return now.getTime() - input.lastActiveAt.getTime() > input.idleTtlSec * 1000;
}

export function isSessionAbsolutelyExpired(input: {
  now?: Date;
  absoluteExpiresAt: Date | null | undefined;
}): boolean {
  if (!input.absoluteExpiresAt) return false;
  const now = input.now ?? new Date();
  return input.absoluteExpiresAt.getTime() <= now.getTime();
}
