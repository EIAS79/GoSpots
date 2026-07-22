/**
 * ThrottlerGuard that records public-create 429s into the CAPTCHA escalation map.
 * Default CAPTCHA_PROVIDER=off → map updates are harmless (assert still no-ops).
 */

import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import {
  notePublicThrottle429,
  resolvePublicCreateSurfaceFromRequest,
} from './captcha-escalation.util';

@Injectable()
export class CaptchaAwareThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    try {
      const { req } = this.getRequestResponse(context);
      const surface = resolvePublicCreateSurfaceFromRequest(req);
      if (surface) {
        const ip = typeof req.ip === 'string' ? req.ip : '';
        notePublicThrottle429(ip, surface);
      }
    } catch {
      // Never block the 429 response on escalation bookkeeping.
    }
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
