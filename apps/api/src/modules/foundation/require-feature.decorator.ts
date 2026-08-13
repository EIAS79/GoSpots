import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from './feature-flag.service';

export const REQUIRED_FEATURE_KEY = 'requiredFeature';

/**
 * Declares a server-authoritative per-venue product feature requirement.
 * The corresponding FeatureFlagGuard must be in the controller guard chain.
 */
export const RequireFeature = (feature: FeatureKey) =>
  SetMetadata(REQUIRED_FEATURE_KEY, feature);
