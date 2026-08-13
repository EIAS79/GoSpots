import type { PrismaService } from '../../prisma/prisma.service';
import { CapabilityService } from './capability.service';
import type { FeatureFlagService } from './feature-flag.service';

describe('CapabilityService', () => {
  function setup(options?: {
    subscriptionStatus?: string | null;
    enabled?: Partial<Record<string, boolean>>;
    terminals?: number;
    fiscalDevices?: number;
    complianceProfile?: boolean;
  }) {
    const subscriptionStatus = options?.subscriptionStatus;
    const prisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(
          subscriptionStatus === undefined || subscriptionStatus === null
            ? null
            : { status: subscriptionStatus, packId: 'gaming' },
        ),
      },
      shop: {
        findUnique: jest.fn().mockResolvedValue({ venueType: 'gaming' }),
      },
      paymentTerminal: {
        count: jest.fn().mockResolvedValue(options?.terminals ?? 0),
      },
      fiscalDevice: {
        count: jest.fn().mockResolvedValue(options?.fiscalDevices ?? 0),
      },
      complianceProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue(options?.complianceProfile ? { id: 'cp-1' } : null),
      },
    } as unknown as PrismaService;
    const enabled = options?.enabled ?? {};
    const features = {
      isFeatureEnabled: jest.fn(async (_shopId: string, feature: string) =>
        Boolean(enabled[feature]),
      ),
    } as unknown as FeatureFlagService;
    return {
      service: new CapabilityService(prisma, features),
      features: features as unknown as { isFeatureEnabled: jest.Mock },
    };
  }

  it('preserves legacy Shops without a subscription row while honoring the feature flag', async () => {
    const { service } = setup({ enabled: { access_v1: true } });
    await expect(service.canUseFeature('shop-1', 'access_v1')).resolves.toBe(true);
  });

  it('blocks a feature when an existing subscription is no longer entitled', async () => {
    const { service } = setup({
      subscriptionStatus: 'CANCELED',
      enabled: { access_v1: true },
    });
    await expect(service.canUseFeature('shop-1', 'access_v1')).resolves.toBe(false);
  });

  it('combines rollout, entitlement and concrete payment/fiscal readiness', async () => {
    const { service } = setup({
      subscriptionStatus: 'ACTIVE',
      terminals: 1,
      fiscalDevices: 1,
      complianceProfile: true,
      enabled: {
        payments_v1: true,
        payment_terminals: true,
        fiscal_pl: true,
        offline_lite: true,
        access_v1: true,
        automation_v1: true,
        ai_insights: true,
      },
    });

    await expect(service.snapshot('shop-1')).resolves.toMatchObject({
      canTakeCardPayment: true,
      canFiscalize: true,
      canUseOfflineLite: true,
      canUseAccess: true,
      canUseAutomation: true,
      canUseAiInsights: true,
      context: {
        subscriptionStatus: 'ACTIVE',
        subscriptionEntitled: true,
        venueType: 'gaming',
        packId: 'gaming',
        activePaymentTerminals: 1,
        enabledFiscalDevices: 1,
        complianceProfileConfigured: true,
      },
    });
  });

  it('does not report card or fiscal readiness from flags alone', async () => {
    const { service } = setup({
      subscriptionStatus: 'ACTIVE',
      enabled: {
        payments_v1: true,
        payment_terminals: true,
        fiscal_pl: true,
      },
    });

    const snapshot = await service.snapshot('shop-1');
    expect(snapshot.canTakeCardPayment).toBe(false);
    expect(snapshot.canFiscalize).toBe(false);
  });
});
