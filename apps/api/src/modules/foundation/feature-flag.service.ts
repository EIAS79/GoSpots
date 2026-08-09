import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export const FEATURE_KEYS = [
  'checkout_v2',
  'checkout_split',
  'cash_sessions',
  'payments_v1',
  'payment_terminals',
  'device_registry',
  'fiscal_pl',
  'ksef_pl',
  'offline_lite',
  'edge_hub',
  'operations_v2',
  'resource_pricing_v2',
  'menu_v2',
  'kds_v2',
  'inventory_v2',
  'workforce_v1',
  'reservations_v2',
  'promotions_v1',
  'crm_v1',
  'loyalty_v1',
  'events_v2',
  'analytics_v2',
  'organizations_v1',
  'integrations_v1',
  'access_v1',
  'automation_v1',
  'ai_insights',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

function parseDevFallback(raw: string | undefined): Set<string> {
  return new Set(
    String(raw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/**
 * Central per-Shop feature-rollout decision point.
 *
 * Database rows are authoritative. Missing rows default to disabled in production.
 * Development may opt into named flags with FEATURE_FLAGS_DEV_ENABLED=a,b,c.
 */
@Injectable()
export class FeatureFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async isFeatureEnabled(shopId: string, feature: FeatureKey): Promise<boolean> {
    if (!shopId?.trim()) return false;

    const row = await this.prisma.shopFeatureFlag.findUnique({
      where: { shopId_feature: { shopId, feature } },
      select: { enabled: true },
    });
    if (row) return row.enabled;

    if (this.config.get<string>('NODE_ENV') === 'production') return false;

    return parseDevFallback(
      this.config.get<string>('FEATURE_FLAGS_DEV_ENABLED'),
    ).has(feature);
  }
}
