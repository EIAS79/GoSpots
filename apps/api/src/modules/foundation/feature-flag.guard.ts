import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiForbiddenException } from '../../common/api-error.util';
import type { JwtAccessPayload } from '../auth/auth.types';
import { CapabilityService } from './capability.service';
import type { FeatureKey } from './feature-flag.service';
import { REQUIRED_FEATURE_KEY } from './require-feature.decorator';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly capabilities: CapabilityService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureKey>(
      REQUIRED_FEATURE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!feature) return true;

    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: JwtAccessPayload }>();
    const user = request.user;
    if (!user?.shopId) {
      throw apiForbiddenException(
        ApiDomainErrorCode.VENUE_ACCESS_DENIED,
        'No venue context.',
      );
    }

    if (!(await this.capabilities.canUseFeature(user.shopId, feature))) {
      throw apiForbiddenException(
        ApiDomainErrorCode.FEATURE_DISABLED,
        'Feature is disabled for this venue.',
        { feature },
      );
    }

    return true;
  }
}
