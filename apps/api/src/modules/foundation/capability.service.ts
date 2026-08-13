import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagService, type FeatureKey } from './feature-flag.service';

const ENTITLED_SUBSCRIPTION_STATUSES = new Set(['TRIAL', 'ACTIVE']);

export type CapabilitySnapshot = {
  canTakeCardPayment: boolean;
  canFiscalize: boolean;
  canUseOfflineLite: boolean;
  canUseAccess: boolean;
  canUseAutomation: boolean;
  canUseAiInsights: boolean;
  context: {
    subscriptionStatus: string | null;
    subscriptionEntitled: boolean;
    venueType: string | null;
    packId: string | null;
    activePaymentTerminals: number;
    enabledFiscalDevices: number;
    complianceProfileConfigured: boolean;
  };
};

/**
 * Canonical server-side capability query.
 *
 * FeatureFlagService remains the rollout source of truth. This service composes
 * those flags with commercial entitlement and concrete provider/device readiness
 * where the capability requires them. Permission/role enforcement remains in the
 * existing RequirePermissions guard so capability availability cannot grant a
 * permission the actor does not have.
 */
@Injectable()
export class CapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureFlagService,
  ) {}

  private async entitlement(shopId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { shopId },
      select: { status: true, packId: true },
    });

    // Legacy Shops created before subscription rows existed retain their current
    // behavior. Once a subscription row exists, its lifecycle is authoritative.
    const entitled =
      !subscription || ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status);

    return {
      status: subscription?.status ?? null,
      packId: subscription?.packId ?? null,
      entitled,
    };
  }

  async canUseFeature(shopId: string, feature: FeatureKey): Promise<boolean> {
    if (!shopId?.trim()) return false;
    const [enabled, entitlement] = await Promise.all([
      this.features.isFeatureEnabled(shopId, feature),
      this.entitlement(shopId),
    ]);
    return enabled && entitlement.entitled;
  }

  async snapshot(shopId: string): Promise<CapabilitySnapshot> {
    const [
      entitlement,
      shop,
      paymentFeature,
      terminalFeature,
      fiscalFeature,
      offlineFeature,
      accessFeature,
      automationFeature,
      aiFeature,
      activePaymentTerminals,
      enabledFiscalDevices,
      complianceProfile,
    ] = await Promise.all([
      this.entitlement(shopId),
      this.prisma.shop.findUnique({
        where: { id: shopId },
        select: { venueType: true },
      }),
      this.features.isFeatureEnabled(shopId, 'payments_v1'),
      this.features.isFeatureEnabled(shopId, 'payment_terminals'),
      this.features.isFeatureEnabled(shopId, 'fiscal_pl'),
      this.features.isFeatureEnabled(shopId, 'offline_lite'),
      this.features.isFeatureEnabled(shopId, 'access_v1'),
      this.features.isFeatureEnabled(shopId, 'automation_v1'),
      this.features.isFeatureEnabled(shopId, 'ai_insights'),
      this.prisma.paymentTerminal.count({
        where: { shopId, enabled: true, device: { status: 'ACTIVE' } },
      }),
      this.prisma.fiscalDevice.count({ where: { shopId, enabled: true } }),
      this.prisma.complianceProfile.findUnique({
        where: { shopId },
        select: { id: true },
      }),
    ]);

    const entitled = entitlement.entitled;
    const complianceProfileConfigured = Boolean(complianceProfile);

    return {
      canTakeCardPayment:
        entitled &&
        paymentFeature &&
        terminalFeature &&
        activePaymentTerminals > 0,
      canFiscalize:
        entitled &&
        fiscalFeature &&
        enabledFiscalDevices > 0 &&
        complianceProfileConfigured,
      canUseOfflineLite: entitled && offlineFeature,
      canUseAccess: entitled && accessFeature,
      canUseAutomation: entitled && automationFeature,
      canUseAiInsights: entitled && aiFeature,
      context: {
        subscriptionStatus: entitlement.status,
        subscriptionEntitled: entitled,
        venueType: shop?.venueType ?? null,
        packId: entitlement.packId,
        activePaymentTerminals,
        enabledFiscalDevices,
        complianceProfileConfigured,
      },
    };
  }
}
