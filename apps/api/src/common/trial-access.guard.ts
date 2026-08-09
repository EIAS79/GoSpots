import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSubscriptionAccess } from './subscription-tier';
import type { JwtAccessPayload } from '../modules/auth/auth.service';

/**
 * Routes that must remain available after a free trial + grace period expires.
 * They let an owner sign in, see the account, configure the venue, activate
 * billing, and satisfy privacy obligations without exposing paid operations.
 */
const LOCKED_TRIAL_ALLOWED_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/billing',
  '/api/v1/dashboard/overview',
  '/api/v1/dashboard/subscription',
  '/api/v1/shop',
  '/api/v1/gdpr',
  '/api/v1/health',
  '/api/v1/metrics',
] as const;

function allowedWhileLocked(rawUrl: string): boolean {
  const path = rawUrl.split('?')[0] ?? rawUrl;
  return LOCKED_TRIAL_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Global paid-feature gate.
 *
 * - Active 90-day trial: full selected modules.
 * - 7-day trial grace: full selected modules, checkout available.
 * - Trial + grace expired: operational API is locked, but data is retained.
 * - Public/unauthenticated and platform-super-admin traffic is unaffected.
 */
@Injectable()
export class TrialAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: JwtAccessPayload;
      originalUrl?: string;
      url?: string;
    }>();
    const actor = request.user;
    if (!actor?.shopId || actor.sysRole === 'SUPER_ADMIN') return true;

    const rawUrl = request.originalUrl ?? request.url ?? '';
    if (allowedWhileLocked(rawUrl)) return true;

    const subscription = await this.prisma.subscription.findUnique({
      where: { shopId: actor.shopId },
      include: { addOnRows: true },
    });
    const access = resolveSubscriptionAccess(subscription);
    if (!access.trialLocked) return true;

    throw new ForbiddenException({
      code: 'SUBSCRIPTION_REQUIRED',
      message:
        'Your free trial and 7-day grace period have ended. Activate a subscription to restore GoSpots operational features. Your venue data is retained and will return after activation.',
      details: {
        reason: 'TRIAL_GRACE_EXPIRED',
        trialEndsAt: access.trialEndsAt,
        trialGraceEndsAt: access.trialGraceEndsAt,
      },
    });
  }
}
