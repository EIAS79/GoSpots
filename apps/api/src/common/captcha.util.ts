/**
 * Public-abuse CAPTCHA verify.
 *
 * Default: CAPTCHA_PROVIDER=off → no-op (rate limits only).
 * When turnstile|hcaptcha + secret are set, callers can require a token
 * (mode=always) or only after throttle escalation (mode=after_throttle + escalated).
 *
 * Wired on publicThrottle creates via `assertCaptchaOrThrow`. Token sources:
 * JSON body `captchaToken` (preferred for browser CORS) or header `X-Captcha-Token`.
 * Escalation: `CaptchaAwareThrottlerGuard` + `captcha-escalation.util` set `escalated`
 * after public-create 429s (process-local; Redis later for multi-instance).
 */

import { ApiDomainErrorCode } from './api-error.codes';
import { apiForbiddenException } from './api-error.util';

/** Lowercase; Express normalizes incoming header names. */
export const CAPTCHA_TOKEN_HEADER = 'x-captcha-token';

export type CaptchaProvider = 'off' | 'turnstile' | 'hcaptcha';
export type CaptchaMode = 'after_throttle' | 'always';

export type CaptchaConfig = {
  provider: CaptchaProvider;
  mode: CaptchaMode;
  siteKey: string | null;
  secretKey: string | null;
};

export type CaptchaVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

export type CaptchaFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  json: () => Promise<{ success?: boolean; 'error-codes'?: string[] }>;
}>;

const TURNSTILE_VERIFY =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const HCAPTCHA_VERIFY = 'https://api.hcaptcha.com/siteverify';

function blankToNull(raw: string | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/** Resolve CAPTCHA env (or a test double). Defaults keep Friday behavior (limits only). */
export function resolveCaptchaConfig(
  env: Record<string, string | undefined> = process.env,
): CaptchaConfig {
  const providerRaw = (env.CAPTCHA_PROVIDER ?? 'off').trim().toLowerCase();
  const provider: CaptchaProvider =
    providerRaw === 'turnstile' || providerRaw === 'hcaptcha'
      ? providerRaw
      : 'off';

  const modeRaw = (env.CAPTCHA_MODE ?? 'after_throttle').trim().toLowerCase();
  const mode: CaptchaMode = modeRaw === 'always' ? 'always' : 'after_throttle';

  const siteKey =
    provider === 'hcaptcha'
      ? blankToNull(env.HCAPTCHA_SITE_KEY)
      : blankToNull(env.TURNSTILE_SITE_KEY);
  const secretKey =
    provider === 'hcaptcha'
      ? blankToNull(env.HCAPTCHA_SECRET_KEY)
      : blankToNull(env.TURNSTILE_SECRET_KEY);

  return { provider, mode, siteKey, secretKey };
}

/** True when a vendor is selected and a secret is present (verify can run). */
export function captchaEnforcementActive(config: CaptchaConfig): boolean {
  return config.provider !== 'off' && Boolean(config.secretKey);
}

/**
 * Prefer body `captchaToken`, then `X-Captcha-Token` header.
 * Empty / whitespace-only values are treated as absent.
 */
export function readCaptchaToken(opts: {
  bodyToken?: string | null;
  headerToken?: string | string[] | null;
}): string | null {
  const fromBody = opts.bodyToken?.trim();
  if (fromBody) return fromBody;

  const raw = opts.headerToken;
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = fromHeader?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Whether this request must present a token.
 * Escalation map (`isCaptchaEscalated`) is caller-owned; pass `escalated: true`.
 */
export function captchaTokenRequired(
  config: CaptchaConfig,
  opts?: { escalated?: boolean },
): boolean {
  if (!captchaEnforcementActive(config)) return false;
  if (config.mode === 'always') return true;
  return Boolean(opts?.escalated);
}

export async function verifyCaptchaToken(opts: {
  config: CaptchaConfig;
  token: string | null | undefined;
  remoteIp?: string | null;
  fetchImpl?: CaptchaFetch;
}): Promise<CaptchaVerifyResult> {
  const { config, remoteIp } = opts;
  if (!captchaEnforcementActive(config)) {
    return { ok: true };
  }

  const token = opts.token?.trim() ?? '';
  if (!token) {
    return { ok: false, reason: 'missing_token' };
  }

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as CaptchaFetch);
  const endpoint =
    config.provider === 'hcaptcha' ? HCAPTCHA_VERIFY : TURNSTILE_VERIFY;

  const body = new URLSearchParams();
  body.set('secret', config.secretKey!);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      return { ok: false, reason: 'provider_http' };
    }
    const data = await res.json();
    if (data.success === true) return { ok: true };
    const codes = data['error-codes']?.join(',') ?? 'rejected';
    return { ok: false, reason: codes };
  } catch {
    return { ok: false, reason: 'provider_error' };
  }
}

/**
 * Fail-closed when a token is required and verify fails.
 * No-op when provider is off / secret unset (today's throttle-only path).
 */
export async function assertCaptchaOrThrow(opts: {
  config?: CaptchaConfig;
  token: string | null | undefined;
  remoteIp?: string | null;
  escalated?: boolean;
  fetchImpl?: CaptchaFetch;
}): Promise<void> {
  const config = opts.config ?? resolveCaptchaConfig();
  if (!captchaTokenRequired(config, { escalated: opts.escalated })) {
    return;
  }

  const result = await verifyCaptchaToken({
    config,
    token: opts.token,
    remoteIp: opts.remoteIp,
    fetchImpl: opts.fetchImpl,
  });
  if (result.ok) return;

  const missing = result.reason === 'missing_token';
  throw apiForbiddenException(
    missing
      ? ApiDomainErrorCode.CAPTCHA_REQUIRED
      : ApiDomainErrorCode.CAPTCHA_FAILED,
    missing
      ? 'Complete the CAPTCHA challenge to continue.'
      : 'CAPTCHA verification failed.',
  );
}
