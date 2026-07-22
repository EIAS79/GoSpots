/** Default local Next.js origin — only applied when `NODE_ENV !== 'production'`. */
export const DEV_DEFAULT_CORS_ORIGIN = 'http://localhost:3000';

export type CorsPolicyInput = {
  /** `NODE_ENV === 'production'` */
  isProd: boolean;
  /** Preferred allowlist (comma-separated). */
  corsOrigins?: string;
  /** Legacy singular alias for `CORS_ORIGINS`. */
  corsOrigin?: string;
  webOrigin?: string;
  webAppUrl?: string;
};

export type CorsPolicy = {
  /** Explicit browser origins. Never `true` (no reflection). */
  origins: string[];
  /** `true` only when `origins` is non-empty. */
  credentials: boolean;
};

const LOCALHOST_HOST =
  /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Comma-separated origin lists → unique trimmed origins (no trailing slash). */
export function parseCorsOrigins(...values: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of values) {
    if (!raw?.trim()) continue;
    for (const part of raw.split(',')) {
      const o = part.trim().replace(/\/$/, '');
      if (o) out.add(o);
    }
  }
  return [...out];
}

export function isLocalhostOrigin(origin: string): boolean {
  return LOCALHOST_HOST.test(origin.trim().replace(/\/$/, ''));
}

/**
 * Resolve CORS allowlist for Nest `enableCors`.
 *
 * - Production: env allowlist only; localhost / loopback stripped; empty → deny
 *   (credentials false, no reflection).
 * - Non-prod: same allowlist; if empty, defaults to `http://localhost:3000`.
 * - Credentials only when at least one explicit origin remains.
 */
export function resolveCorsPolicy(input: CorsPolicyInput): CorsPolicy {
  let origins = parseCorsOrigins(
    input.corsOrigins,
    input.corsOrigin,
    input.webOrigin,
    input.webAppUrl,
  );

  if (input.isProd) {
    origins = origins.filter((o) => !isLocalhostOrigin(o));
  } else if (origins.length === 0) {
    origins = [DEV_DEFAULT_CORS_ORIGIN];
  }

  const credentials = origins.length > 0;
  return { origins, credentials };
}
