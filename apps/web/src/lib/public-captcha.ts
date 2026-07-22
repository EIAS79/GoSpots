/**
 * Public CAPTCHA widget config (bible #26).
 * Widget renders only when provider is turnstile|hcaptcha AND the matching site key is set.
 * Omit captchaToken from POSTs when disabled — API assert no-ops with CAPTCHA_PROVIDER=off.
 */

export type PublicCaptchaProvider = "turnstile" | "hcaptcha";

export type PublicCaptchaConfig = {
  provider: PublicCaptchaProvider;
  siteKey: string;
};

export function resolvePublicCaptchaConfig(): PublicCaptchaConfig | null {
  const raw = process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER?.trim().toLowerCase();
  if (raw !== "turnstile" && raw !== "hcaptcha") return null;

  const siteKey =
    raw === "turnstile"
      ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
      : process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim();

  if (!siteKey) return null;
  return { provider: raw, siteKey };
}

export function isPublicCaptchaEnabled(): boolean {
  return resolvePublicCaptchaConfig() != null;
}

/** Attach captchaToken only when non-empty (provider off → omit). */
export function withCaptchaToken<T extends Record<string, unknown>>(
  body: T,
  captchaToken: string | null | undefined,
): T & { captchaToken?: string } {
  const token = captchaToken?.trim();
  if (!token) return body;
  return { ...body, captchaToken: token };
}
