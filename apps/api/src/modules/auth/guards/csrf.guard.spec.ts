import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { CSRF_COOKIE } from '../../../common/csrf.constants';
import { CsrfGuard } from './csrf.guard';

function context(input: {
  path: string;
  isPublic?: boolean;
  cookies?: Record<string, string>;
  csrfHeader?: string;
}): ExecutionContext {
  const request = {
    method: 'POST',
    baseUrl: '/api/v1',
    path: input.path,
    url: input.path,
    cookies: input.cookies ?? {},
    headers: input.csrfHeader
      ? { 'x-csrf-token': input.csrfHeader }
      : {},
  };
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({ getRequest: () => request }) as never,
  } as ExecutionContext;
}

function guard(isPublic = true) {
  const reflector = {
    getAllAndOverride: jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(isPublic),
  };
  return new CsrfGuard(
    reflector as never,
    { get: jest.fn().mockReturnValue('true') } as never,
  );
}

describe('CsrfGuard public cookie mutations', () => {
  it.each([
    '/auth/register',
    '/auth/staff/activate',
    '/auth/login',
    '/auth/mfa/verify',
    '/auth/refresh',
    '/auth/logout',
  ])('requires a bootstrap token for %s even without a session', (path) => {
    expect(() => guard().canActivate(context({ path }))).toThrow(
      ForbiddenException,
    );
  });

  it('accepts matching double-submit tokens before login', () => {
    expect(
      guard().canActivate(
        context({
          path: '/auth/login',
          cookies: { [CSRF_COOKIE]: 'csrf-value' },
          csrfHeader: 'csrf-value',
        }),
      ),
    ).toBe(true);
  });

  it('continues to allow public endpoints that do not issue session cookies', () => {
    expect(
      guard().canActivate(context({ path: '/auth/forgot-password' })),
    ).toBe(true);
  });
});
