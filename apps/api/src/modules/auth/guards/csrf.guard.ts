import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CSRF_COOKIE } from '../../../common/csrf.constants';
import {
  csrfTokensMatch,
  hasSessionCookies,
  isUnsafeMethod,
  readCsrfHeader,
} from '../../../common/csrf.util';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';

/** Public auth routes that still mutate cookie sessions and need CSRF. */
const PUBLIC_COOKIE_MUTATIONS = [
  '/auth/refresh',
  '/auth/logout',
] as const;

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.config.get<string>('CSRF_PROTECTION', 'true') === 'false') {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    if (!isUnsafeMethod(req.method)) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic && !this.isPublicCookieMutation(req)) {
      // Guest/public APIs ignore session cookies; don't block when a dashboard
      // session cookie is also present on the same origin.
      return true;
    }

    const cookies = req.cookies as Record<string, unknown> | undefined;
    if (!hasSessionCookies(cookies)) return true;

    const cookieToken =
      typeof cookies?.[CSRF_COOKIE] === 'string'
        ? (cookies[CSRF_COOKIE] as string)
        : undefined;
    const headerToken = readCsrfHeader(
      req.headers as Record<string, string | string[] | undefined>,
    );

    if (!csrfTokensMatch(cookieToken, headerToken)) {
      throw new ForbiddenException(
        'CSRF token missing or invalid. Send matching X-CSRF-Token header.',
      );
    }

    return true;
  }

  private isPublicCookieMutation(req: Request): boolean {
    const url = `${req.baseUrl ?? ''}${req.path ?? ''}${req.url ?? ''}`;
    return PUBLIC_COOKIE_MUTATIONS.some((p) => url.includes(p));
  }
}
