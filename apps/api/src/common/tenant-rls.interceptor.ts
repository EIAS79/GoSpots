import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import type { JwtAccessPayload } from '../modules/auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyTenantRlsSession,
  isTenantRlsEnabled,
  tenantRlsAls,
} from './tenant-rls.util';

/**
 * After VenueContextInterceptor binds `user.shopId`, wrap the handler in an
 * interactive Prisma transaction and SET LOCAL tenant RLS GUCs.
 *
 * Skips: TENANT_RLS off, unbound shop, SSE streams (must not hold a DB txn).
 */
@Injectable()
export class TenantRlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (!isTenantRlsEnabled()) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{
      user?: JwtAccessPayload;
      url?: string;
      path?: string;
      route?: { path?: string };
    }>();

    if (this.isLongLivedStream(req)) {
      return next.handle();
    }

    const shopId = req.user?.shopId;
    if (!shopId) {
      return next.handle();
    }

    // Already inside withTenantRls / nested interceptor — do not double-wrap.
    if (tenantRlsAls.getStore()?.tx) {
      return next.handle();
    }

    return from(
      this.prisma.$transaction(
        async (tx) => {
          await applyTenantRlsSession(tx, { shopId, mode: 'tenant' });
          return tenantRlsAls.run({ tx, shopId, mode: 'tenant' }, () =>
            lastValueFrom(next.handle(), { defaultValue: undefined }),
          );
        },
        { maxWait: 10_000, timeout: 60_000 },
      ),
    );
  }

  private isLongLivedStream(req: {
    url?: string;
    path?: string;
    route?: { path?: string };
  }): boolean {
    const routePath = req.route?.path ?? '';
    const url = req.url ?? req.path ?? '';
    return (
      routePath.includes('stream') ||
      url.includes('/notifications/stream') ||
      url.includes('/notifications/stream?')
    );
  }
}
