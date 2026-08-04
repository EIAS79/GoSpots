/**
 * Production boot checks for secrets that must never be absent in live.
 * Billing provider secrets are required only when the matching feature flag is on.
 */

export const PRODUCTION_ALWAYS_REQUIRED_SECRETS = [
  'JWT_ACCESS_SECRET',
  'DATABASE_URL',
] as const;

/** @deprecated Prefer PRODUCTION_ALWAYS_REQUIRED_SECRETS + conditional billing secrets. */
export const PRODUCTION_REQUIRED_SECRETS = [
  ...PRODUCTION_ALWAYS_REQUIRED_SECRETS,
  'LEMON_SQUEEZY_WEBHOOK_SECRET',
] as const;

export type ProductionSecretKey = string;

export type SecretEnvReader = {
  get: (key: string) => string | undefined | null;
};

function isBlank(value: string | undefined | null): boolean {
  return value == null || !String(value).trim();
}

function envFlag(env: SecretEnvReader, key: string): boolean {
  const raw = env.get(key);
  if (raw == null || raw === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/** Secrets required in production given current feature flags. */
export function requiredProductionSecrets(env: SecretEnvReader): string[] {
  const required: string[] = [...PRODUCTION_ALWAYS_REQUIRED_SECRETS];

  if (envFlag(env, 'BILLING_LEMON_ENABLED')) {
    required.push('LEMON_SQUEEZY_WEBHOOK_SECRET');
  }
  if (envFlag(env, 'BILLING_STRIPE_ENABLED')) {
    required.push('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET');
  }
  if (envFlag(env, 'BILLING_MOLLIE_ENABLED')) {
    required.push('MOLLIE_API_KEY');
  }

  return required;
}

export function missingProductionSecrets(env: SecretEnvReader): string[] {
  return requiredProductionSecrets(env).filter((key) => isBlank(env.get(key)));
}

/**
 * Fail fast in production when critical secrets are missing.
 * Non-prod: warn about unset Lemon/Stripe/Mollie secrets when those flags are on.
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
  if (missing.includes('STRIPE_SECRET_KEY') || missing.includes('STRIPE_WEBHOOK_SECRET')) {
    opts.warn?.(
      'Stripe billing enabled but STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET incomplete — dual billing will fail until configured.',
    );
  }
  if (missing.includes('MOLLIE_API_KEY')) {
    opts.warn?.(
      'Mollie billing enabled but MOLLIE_API_KEY is unset — Mollie checkouts will fail until configured.',
    );
  }
}
