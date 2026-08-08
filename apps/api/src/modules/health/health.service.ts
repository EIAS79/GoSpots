import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { readBillingConfig } from '../billing/billing-config';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  live() {
    return {
      status: 'ok' as const,
      check: 'live',
      service: 'GoSpots-api',
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const started = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'database check failed';
      return {
        status: 'error' as const,
        check: 'ready',
        service: 'GoSpots-api',
        database: 'down' as const,
        latencyMs: Date.now() - started,
        error: message,
        timestamp: new Date().toISOString(),
      };
    }

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const webApp = (
      this.config.get<string>('WEB_APP_URL') ??
      this.config.get<string>('WEB_ORIGIN') ??
      ''
    ).trim();
    if (isProd) {
      let validWebApp = false;
      try {
        const parsed = new URL(webApp);
        validWebApp =
          parsed.protocol === 'https:' &&
          parsed.hostname !== 'localhost' &&
          parsed.hostname !== '127.0.0.1';
      } catch {
        validWebApp = false;
      }
      if (!validWebApp) {
        return {
          status: 'error' as const,
          check: 'ready',
          service: 'GoSpots-api',
          database: 'up' as const,
          webApp: 'misconfigured' as const,
          latencyMs: Date.now() - started,
          error:
            'WEB_APP_URL (or WEB_ORIGIN) must be a non-localhost HTTPS URL in production.',
          timestamp: new Date().toISOString(),
        };
      }
    }

    const billing = readBillingConfig(this.config);
    if (billing.enabled) {
      try {
        // This is intentionally a real billing-model query, not only SELECT 1.
        // A deployment with unapplied billing migrations must not report ready.
        await this.prisma.billingOperation.count();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'billing schema check failed';
        return {
          status: 'error' as const,
          check: 'ready',
          service: 'GoSpots-api',
          database: 'up' as const,
          billing: 'schema_error' as const,
          latencyMs: Date.now() - started,
          error: message,
          timestamp: new Date().toISOString(),
        };
      }

      const stripeReady =
        billing.stripeEnabled &&
        Boolean(this.config.get<string>('STRIPE_SECRET_KEY')?.trim()) &&
        Boolean(this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim());
      const mollieReady =
        billing.mollieEnabled &&
        Boolean(this.config.get<string>('MOLLIE_API_KEY')?.trim());
      const defaultReady =
        billing.defaultProvider === 'STRIPE'
          ? stripeReady
          : billing.defaultProvider === 'MOLLIE'
            ? mollieReady
            : false;

      if (!defaultReady) {
        return {
          status: 'error' as const,
          check: 'ready',
          service: 'GoSpots-api',
          database: 'up' as const,
          billing: 'misconfigured' as const,
          defaultProvider: billing.defaultProvider,
          latencyMs: Date.now() - started,
          error:
            'Billing is enabled but the default provider is not fully configured.',
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      status: 'ok' as const,
      check: 'ready',
      service: 'GoSpots-api',
      database: 'up' as const,
      webApp: webApp ? ('ready' as const) : ('not_required' as const),
      billing: billing.enabled ? ('ready' as const) : ('disabled' as const),
      defaultProvider: billing.defaultProvider,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
  }
}
