import { createHash } from 'crypto';

/**
 * Non-secret, read-only deployment mapping aid. Compare fingerprints across
 * Render, Vercel and the documented Neon endpoint inventory. Never print URLs,
 * connection strings, passwords, webhook signatures or merchant account names.
 */
type RuntimeEnvironment = Record<string, string | undefined>;
function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
function urlHostFingerprint(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    return url.hostname ? fingerprint(url.hostname.toLowerCase()) : null;
  } catch {
    return null;
  }
}
export type RuntimeIdentityEvidence = {
  renderServiceId: string | null;
  vercelProjectId: string | null;
  gitCommit: string | null;
  databaseHostFingerprint: string | null;
  apiTargetHostFingerprint: string | null;
  adyenMerchantFingerprint: string | null;
  adyenEnvironment: 'test' | 'live' | 'unset-or-unknown';
  ksefEnabled: boolean;
  webhookPath: '/api/v1/payments/webhooks/adyen';
};

export function collectRuntimeIdentity(
  env: RuntimeEnvironment,
): RuntimeIdentityEvidence {
  const adyenRaw = env.ADYEN_ENVIRONMENT?.trim().toLowerCase();
  const adyenEnvironment =
    adyenRaw === 'test' || adyenRaw === 'live' ? adyenRaw : 'unset-or-unknown';
  const merchant = env.ADYEN_MERCHANT_ACCOUNT?.trim();
  return {
    renderServiceId: env.RENDER_SERVICE_ID?.trim() || null,
    vercelProjectId: env.VERCEL_PROJECT_ID?.trim() || null,
    gitCommit:
      env.RENDER_GIT_COMMIT?.trim() ||
      env.VERCEL_GIT_COMMIT_SHA?.trim() ||
      null,
    databaseHostFingerprint: urlHostFingerprint(env.DATABASE_URL),
    apiTargetHostFingerprint: urlHostFingerprint(
      env.API_PROXY_TARGET ?? env.NEXT_PUBLIC_API_BASE_URL,
    ),
    adyenMerchantFingerprint: merchant ? fingerprint(merchant) : null,
    adyenEnvironment,
    ksefEnabled: env.KSEF_ENABLED?.trim().toLowerCase() === 'true',
    webhookPath: '/api/v1/payments/webhooks/adyen',
  };
}
