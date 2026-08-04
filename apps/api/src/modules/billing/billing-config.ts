import { ConfigService } from '@nestjs/config';

export type BillingProviderChoice = 'STRIPE' | 'MOLLIE';

export type BillingRuntimeConfig = {
  enabled: boolean;
  stripeEnabled: boolean;
  mollieEnabled: boolean;
  /** Soft-deprecated Lemon path; default false. */
  lemonEnabled: boolean;
  defaultProvider: BillingProviderChoice | null;
  gracePeriodDays: number;
  /** Max webhook processing attempts before DEAD. */
  webhookMaxAttempts: number;
};

function envFlag(
  config: ConfigService,
  key: string,
  defaultValue = false,
): boolean {
  const raw = config.get<string>(key);
  if (raw == null || raw === '') return defaultValue;
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

function envInt(
  config: ConfigService,
  key: string,
  defaultValue: number,
): number {
  const raw = config.get<string>(key);
  if (raw == null || raw === '') return defaultValue;
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultValue;
}

function parseDefaultProvider(
  config: ConfigService,
): BillingProviderChoice | null {
  const raw = (config.get<string>('BILLING_DEFAULT_PROVIDER') ?? '')
    .trim()
    .toUpperCase();
  if (raw === 'STRIPE' || raw === 'MOLLIE') return raw;
  return null;
}

/** Read dual-provider billing flags from ConfigService / env. */
export function readBillingConfig(
  config: ConfigService,
): BillingRuntimeConfig {
  const stripeEnabled = envFlag(config, 'BILLING_STRIPE_ENABLED', false);
  const mollieEnabled = envFlag(config, 'BILLING_MOLLIE_ENABLED', false);
  let defaultProvider = parseDefaultProvider(config);

  if (defaultProvider === 'STRIPE' && !stripeEnabled) defaultProvider = null;
  if (defaultProvider === 'MOLLIE' && !mollieEnabled) defaultProvider = null;
  if (!defaultProvider) {
    if (stripeEnabled) defaultProvider = 'STRIPE';
    else if (mollieEnabled) defaultProvider = 'MOLLIE';
  }

  return {
    enabled: envFlag(config, 'BILLING_ENABLED', false),
    stripeEnabled,
    mollieEnabled,
    lemonEnabled: envFlag(config, 'BILLING_LEMON_ENABLED', false),
    defaultProvider,
    gracePeriodDays: envInt(config, 'BILLING_GRACE_PERIOD_DAYS', 3),
    webhookMaxAttempts: envInt(config, 'BILLING_WEBHOOK_MAX_ATTEMPTS', 8),
  };
}

export function isBillingProviderConfigured(
  config: ConfigService,
  provider: BillingProviderChoice,
): boolean {
  const cfg = readBillingConfig(config);
  if (!cfg.enabled) return false;
  if (provider === 'STRIPE') {
    return (
      cfg.stripeEnabled &&
      Boolean(config.get<string>('STRIPE_SECRET_KEY')?.trim())
    );
  }
  return (
    cfg.mollieEnabled &&
    Boolean(config.get<string>('MOLLIE_API_KEY')?.trim())
  );
}

/** Dual-provider path (Stripe / Mollie). */
export function isDualBillingEnabled(config: ConfigService): boolean {
  return readBillingConfig(config).enabled;
}

/** Soft-deprecated Lemon path. */
export function isLemonBillingEnabled(config: ConfigService): boolean {
  return readBillingConfig(config).lemonEnabled;
}

/**
 * Allow Lemon checkout/portal when Lemon is enabled, or when the explicit
 * legacy escape hatch is on (migration / emergency).
 */
export function isLemonCheckoutAllowed(config: ConfigService): boolean {
  if (isLemonBillingEnabled(config)) return true;
  return envFlag(config, 'BILLING_LEMON_LEGACY_CHECKOUT', false);
}
