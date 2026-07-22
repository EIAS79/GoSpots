/**
 * Nest Throttler limits — env-configurable so local smoke can raise or disable.
 * Production defaults harden auth + public create abuse without touching CSRF cookie semantics.
 *
 * CAPTCHA: `assertCaptchaOrThrow` on publicThrottle creates (default provider off).
 * After public-create 429s, in-memory escalation feeds `escalated` (mode=after_throttle).
 * Per-route `@Throttle` still sits under the global limiter.
 */

export type AuthThrottleKind = 'strict' | 'login' | 'refresh' | 'csrf';

/** Public create / spam surfaces (layered under global THROTTLE_GLOBAL_LIMIT). */
export type PublicThrottleKind =
  | 'booking'
  | 'event'
  | 'contact'
  | 'review'
  | 'chatOpen';

export type ThrottleConfig = {
  disabled: boolean;
  ttlMs: number;
  globalLimit: number;
  auth: Record<AuthThrottleKind, { limit: number; ttl: number }>;
  public: Record<PublicThrottleKind, { limit: number; ttl: number }>;
};

export function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isThrottleDisabled(raw: string | undefined): boolean {
  return raw === 'true' || raw === '1';
}

/** Resolve limits from env (or a test double). Defaults are production-safe. */
export function resolveThrottleConfig(
  env: Record<string, string | undefined> = process.env,
): ThrottleConfig {
  const ttlMs = parsePositiveInt(env.THROTTLE_TTL_MS, 60_000);
  const strictLimit = parsePositiveInt(env.AUTH_THROTTLE_STRICT_LIMIT, 5);
  const loginLimit = parsePositiveInt(env.AUTH_THROTTLE_LOGIN_LIMIT, 10);
  const refreshLimit = parsePositiveInt(env.AUTH_THROTTLE_REFRESH_LIMIT, 30);
  const csrfLimit = parsePositiveInt(env.AUTH_THROTTLE_CSRF_LIMIT, 60);

  /** Stricter than prior hardcoded 10–15/min public creates. */
  const bookingLimit = parsePositiveInt(env.PUBLIC_THROTTLE_BOOKING_LIMIT, 5);
  const eventLimit = parsePositiveInt(env.PUBLIC_THROTTLE_EVENT_LIMIT, 5);
  const contactLimit = parsePositiveInt(env.PUBLIC_THROTTLE_CONTACT_LIMIT, 5);
  const reviewLimit = parsePositiveInt(env.PUBLIC_THROTTLE_REVIEW_LIMIT, 5);
  const chatOpenLimit = parsePositiveInt(
    env.PUBLIC_THROTTLE_CHAT_OPEN_LIMIT,
    5,
  );

  return {
    disabled: isThrottleDisabled(env.THROTTLE_DISABLED),
    ttlMs,
    globalLimit: parsePositiveInt(env.THROTTLE_GLOBAL_LIMIT, 100),
    auth: {
      /** register, forgot-password, staff forgot-password */
      strict: { limit: strictLimit, ttl: ttlMs },
      /** login, reset-password, staff activate, password re-checks */
      login: { limit: loginLimit, ttl: ttlMs },
      refresh: { limit: refreshLimit, ttl: ttlMs },
      csrf: { limit: csrfLimit, ttl: ttlMs },
    },
    public: {
      /** POST dining/gaming reservations */
      booking: { limit: bookingLimit, ttl: ttlMs },
      /** POST event-requests */
      event: { limit: eventLimit, ttl: ttlMs },
      /** POST contact */
      contact: { limit: contactLimit, ttl: ttlMs },
      /** POST reviews */
      review: { limit: reviewLimit, ttl: ttlMs },
      /** POST guest chat open (not message/ping) */
      chatOpen: { limit: chatOpenLimit, ttl: ttlMs },
    },
  };
}

/**
 * `@Throttle(...)` override that re-reads env per request
 * (after ConfigModule has loaded `.env`).
 */
export function authThrottle(kind: AuthThrottleKind) {
  return {
    default: {
      limit: () => resolveThrottleConfig().auth[kind].limit,
      ttl: () => resolveThrottleConfig().ttlMs,
    },
  };
}

/** Public create surfaces — same Resolvable pattern as `authThrottle`. */
export function publicThrottle(kind: PublicThrottleKind) {
  return {
    default: {
      limit: () => resolveThrottleConfig().public[kind].limit,
      ttl: () => resolveThrottleConfig().ttlMs,
    },
  };
}
