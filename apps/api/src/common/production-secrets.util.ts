/**
 * Production boot checks for secrets that must never be absent in live.
 * Non-prod: Lemon webhook secret may be unset (local without billing) — warn only.
 */

export const PRODUCTION_REQUIRED_SECRETS = [
  'JWT_ACCESS_SECRET',
  'DATABASE_URL',
  'LEMON_SQUEEZY_WEBHOOK_SECRET',
] as const;

export type ProductionSecretKey = (typeof PRODUCTION_REQUIRED_SECRETS)[number];

export type SecretEnvReader = {
  get: (key: string) => string | undefined | null;
};

function isBlank(value: string | undefined | null): boolean {
  return value == null || !String(value).trim();
}

export function missingProductionSecrets(
  env: SecretEnvReader,
): ProductionSecretKey[] {
  return PRODUCTION_REQUIRED_SECRETS.filter((key) => isBlank(env.get(key)));
}

/**
 * Fail fast in production when critical secrets are missing.
 * In non-production, only warns about Lemon webhook secret (local without Lemon OK).
 */
export function assertCriticalSecretsAtBoot(
  env: SecretEnvReader,
  opts: {
    isProd: boolean;
    warn?: (message: string) => void;
  },
): void {
  const missing = missingProductionSecrets(env);

  if (opts.isProd) {
    if (missing.length > 0) {
      throw new Error(
        `Missing required production secrets (refusing to start): ${missing.join(', ')}. ` +
          'Set them in the host environment (see apps/api/.env.production.example).',
      );
    }
    return;
  }

  if (missing.includes('LEMON_SQUEEZY_WEBHOOK_SECRET')) {
    opts.warn?.(
      'LEMON_SQUEEZY_WEBHOOK_SECRET is unset — Lemon webhooks will be rejected until configured. Local/dev OK without Lemon.',
    );
  }
}
