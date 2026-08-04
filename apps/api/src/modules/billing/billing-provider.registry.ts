import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BillingProviderAdapter } from './billing-provider.adapter';
import {
  isBillingProviderConfigured,
  readBillingConfig,
  type BillingProviderChoice,
} from './billing-config';
import type { BillingProviderId } from './billing.types';
import { MollieBillingAdapter } from './providers/mollie.adapter';
import { StripeBillingAdapter } from './providers/stripe.adapter';

@Injectable()
export class BillingProviderRegistry {
  constructor(
    private readonly config: ConfigService,
    private readonly stripe: StripeBillingAdapter,
    private readonly mollie: MollieBillingAdapter,
  ) {}

  get(provider: BillingProviderId | BillingProviderChoice): BillingProviderAdapter {
    const id = String(provider).toUpperCase() as BillingProviderId;
    if (id === 'STRIPE') {
      if (!isBillingProviderConfigured(this.config, 'STRIPE')) {
        throw new ServiceUnavailableException(
          'Stripe billing is not enabled or STRIPE_SECRET_KEY is missing.',
        );
      }
      return this.stripe;
    }
    if (id === 'MOLLIE') {
      if (!isBillingProviderConfigured(this.config, 'MOLLIE')) {
        throw new ServiceUnavailableException(
          'Mollie billing is not enabled or MOLLIE_API_KEY is missing.',
        );
      }
      return this.mollie;
    }
    throw new NotFoundException(`Unknown billing provider: ${provider}`);
  }

  /** Enabled + credentialed adapters (order: default first when set). */
  listEnabled(): BillingProviderAdapter[] {
    const cfg = readBillingConfig(this.config);
    if (!cfg.enabled) return [];

    const out: BillingProviderAdapter[] = [];
    const push = (id: BillingProviderChoice) => {
      if (!isBillingProviderConfigured(this.config, id)) return;
      const adapter = id === 'STRIPE' ? this.stripe : this.mollie;
      if (!out.includes(adapter)) out.push(adapter);
    };

    if (cfg.defaultProvider) push(cfg.defaultProvider);
    if (cfg.stripeEnabled) push('STRIPE');
    if (cfg.mollieEnabled) push('MOLLIE');
    return out;
  }

  defaultProvider(): BillingProviderAdapter | null {
    const cfg = readBillingConfig(this.config);
    if (!cfg.enabled || !cfg.defaultProvider) {
      const enabled = this.listEnabled();
      return enabled[0] ?? null;
    }
    try {
      return this.get(cfg.defaultProvider);
    } catch {
      return this.listEnabled()[0] ?? null;
    }
  }
}
