import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { FeatureFlagGuard } from './feature-flag.guard';
import type { FeatureFlagService } from './feature-flag.service';

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
    const featureFlags = {
      isFeatureEnabled: jest.fn().mockResolvedValue(enabled),
    } as unknown as FeatureFlagService;
    return {
      guard: new FeatureFlagGuard(reflector, featureFlags),
      featureFlags: featureFlags as unknown as {
        isFeatureEnabled: jest.Mock;
      },
    };
  }

  it('does nothing when a route declares no product feature', async () => {
    const { guard, featureFlags } = setup(undefined);

    await expect(
      guard.canActivate(contextFor({ shopId: 'shop-1' })),
    ).resolves.toBe(true);
    expect(featureFlags.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it('allows the request when the venue feature is enabled', async () => {
    const { guard, featureFlags } = setup('access_v1', true);

    await expect(
      guard.canActivate(contextFor({ shopId: 'shop-1' })),
    ).resolves.toBe(true);
    expect(featureFlags.isFeatureEnabled).toHaveBeenCalledWith(
      'shop-1',
      'access_v1',
    );
  });

  it('denies an OWNER when the venue feature is disabled', async () => {
    const { guard } = setup('access_v1', false);

    await expect(
      guard.canActivate(
        contextFor({ shopId: 'shop-1', shopRole: 'OWNER' }),
      ),
    ).rejects.toMatchObject({
      response: {
        code: ApiDomainErrorCode.FEATURE_DISABLED,
        details: { feature: 'access_v1' },
      },
    });
  });

  it('requires an authenticated venue context before evaluating a feature', async () => {
    const { guard, featureFlags } = setup('automation_v1', true);

    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({
      response: { code: ApiDomainErrorCode.VENUE_ACCESS_DENIED },
    });
    expect(featureFlags.isFeatureEnabled).not.toHaveBeenCalled();
  });
});
