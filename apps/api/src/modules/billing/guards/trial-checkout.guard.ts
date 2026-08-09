import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { requireShopId } from '../../../common/tenant';
import { resolveSubscriptionAccess } from '../../../common/subscription-tier';
import type { JwtAccessPayload } from '../../auth/auth.service';

/**
 * A free trial must remain genuinely free: while the 90-day trial is active,
 * no hosted payment checkout may be created, even if a client bypasses the UI.
 * Checkout becomes available as soon as the trial ends (during the 7-day grace).
 */
@Injectable()
export class TrialCheckoutGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    const actor = request.user;
    if (!actor) return true; // JwtAuthGuard remains authoritative for auth.

    const shopId = requireShopId(actor);
    const subscription = await this.prisma.subscription.findUnique({
      where: { shopId },
      include: { addOnRows: true },
    });
    const access = resolveSubscriptionAccess(subscription);

    if (access.trialActive) {
      throw new ForbiddenException(
        `Your 90-day GoSpots free trial is still active (${access.trialDaysRemaining} day${access.trialDaysRemaining === 1 ? '' : 's'} remaining). No payment is required and checkout is disabled until the trial ends.`,
      );
    }

    return true;
  }
}
