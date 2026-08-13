import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import type { CapabilityService } from './capability.service';
import { FeatureFlagGuard } from './feature-flag.guard';

function contextFor(user?: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  function setup(feature: string | undefined, enabled = true) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(feature),
    } as unknown as Reflector;
    const capabilities = {
      canUseFeature: jest.fn().mockResolvedValue(enabled),
    } as unknown as CapabilityService;
    return {
      guard: new FeatureFlagGuard(reflector, capabilities),
      capabilities: capabilities as unknown as {
        canUseFeature: jest.Mock;
      },
    };
  }

  it('does nothing when a route declares no product feature', async () => {
    const { guard, capabilities } = setup(undefined);

    await expect(
      guard.canActivate(contextFor({ shopId: 'shop-1' })),
    ).resolves.toBe(true);
    expect(capabilities.canUseFeature).not.toHaveBeenCalled();
  });

  for (const shopRole of ['OWNER', 'MANAGER', 'STAFF'] as const) {
    it(`allows ${shopRole} only when the venue feature is enabled`, async () => {
      const { guard, capabilities } = setup('access_v1', true);

      await expect(
        guard.canActivate(contextFor({ shopId: 'shop-1', shopRole })),
      ).resolves.toBe(true);
      expect(capabilities.canUseFeature).toHaveBeenCalledWith(
        'shop-1',
        'access_v1',
      );
    });

    it(`denies ${shopRole} when the venue feature is disabled`, async () => {
      const { guard } = setup('access_v1', false);

      await expect(
        guard.canActivate(contextFor({ shopId: 'shop-1', shopRole })),
      ).rejects.toMatchObject({
        response: {
          code: ApiDomainErrorCode.FEATURE_DISABLED,
          details: { feature: 'access_v1' },
        },
      });
    });
  }

  it('requires an authenticated venue context before evaluating a feature', async () => {
    const { guard, capabilities } = setup('automation_v1', true);

    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({
      response: { code: ApiDomainErrorCode.VENUE_ACCESS_DENIED },
    });
    expect(capabilities.canUseFeature).not.toHaveBeenCalled();
  });
});
