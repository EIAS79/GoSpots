import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CSRF_COOKIE } from '../../../common/csrf.constants';
import { CsrfGuard } from './csrf.guard';

function mockCtx(req: {
  method: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string | string[]>;
  path?: string;
  url?: string;
  baseUrl?: string;
}) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        path: '',
        url: '',
        baseUrl: '',
        ...req,
      }),
    }),
  } as never;
}

describe('CsrfGuard', () => {
  function build(opts?: {
    csrfProtection?: string;
    skip?: boolean;
  }) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(opts?.skip ?? false),
    } as unknown as Reflector;
    const config = {
      get: jest.fn((_key: string, def?: string) =>
        opts?.csrfProtection !== undefined ? opts.csrfProtection : (def ?? 'true'),
      ),
    } as unknown as ConfigService;
    return new CsrfGuard(reflector, config);
  }

  it('allows safe methods without token', () => {
    const guard = build();
    expect(
      guard.canActivate(
        mockCtx({
          method: 'GET',
          cookies: { access_token: 'a' },
        }),
      ),
    ).toBe(true);
  });

  it('allows mutations when no session cookies (public)', () => {
    const guard = build();
    expect(
      guard.canActivate(
        mockCtx({
          method: 'POST',
          cookies: {},
          headers: {},
        }),
      ),
    ).toBe(true);
  });

  it('rejects cookie session mutation with missing CSRF header', () => {
    const guard = build();
    expect(() =>
      guard.canActivate(
        mockCtx({
          method: 'POST',
          cookies: { access_token: 'a', [CSRF_COOKIE]: 'tok' },
          headers: {},
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects cookie session mutation with invalid CSRF header', () => {
    const guard = build();
    expect(() =>
      guard.canActivate(
        mockCtx({
          method: 'DELETE',
          cookies: { refresh_token: 'r', [CSRF_COOKIE]: 'tok' },
          headers: { 'x-csrf-token': 'wrong' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows cookie session mutation with matching CSRF header', () => {
    const guard = build();
    expect(
      guard.canActivate(
        mockCtx({
          method: 'POST',
          cookies: { access_token: 'a', [CSRF_COOKIE]: 'tok' },
          headers: { 'x-csrf-token': 'tok' },
        }),
      ),
    ).toBe(true);
  });

  it('skips when @SkipCsrf()', () => {
    const guard = build({ skip: true });
    expect(
      guard.canActivate(
        mockCtx({
          method: 'POST',
          cookies: { access_token: 'a', [CSRF_COOKIE]: 'tok' },
          headers: {},
        }),
      ),
    ).toBe(true);
  });

  it('skips when CSRF_PROTECTION=false', () => {
    const guard = build({ csrfProtection: 'false' });
    expect(
      guard.canActivate(
        mockCtx({
          method: 'POST',
          cookies: { access_token: 'a', [CSRF_COOKIE]: 'tok' },
          headers: {},
        }),
      ),
    ).toBe(true);
  });

  it('allows @Public guest mutations even with session cookies (no CSRF)', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === 'skipCsrf') return false;
        if (key === 'isPublic') return true;
        return false;
      }),
    } as unknown as Reflector;
    const config = {
      get: jest.fn((_k: string, def?: string) => def ?? 'true'),
    } as unknown as ConfigService;
    const guard = new CsrfGuard(reflector, config);
    expect(
      guard.canActivate(
        mockCtx({
          method: 'POST',
          cookies: { access_token: 'a', [CSRF_COOKIE]: 'tok' },
          headers: {},
          path: '/public/venues/x/book',
          url: '/public/venues/x/book',
          baseUrl: '/api/v1',
        }),
      ),
    ).toBe(true);
  });

  it('still requires CSRF on public auth/refresh with cookies', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === 'skipCsrf') return false;
        if (key === 'isPublic') return true;
        return false;
      }),
    } as unknown as Reflector;
    const config = {
      get: jest.fn((_k: string, def?: string) => def ?? 'true'),
    } as unknown as ConfigService;
    const guard = new CsrfGuard(reflector, config);
    expect(() =>
      guard.canActivate(
        mockCtx({
          method: 'POST',
          cookies: { refresh_token: 'r', [CSRF_COOKIE]: 'tok' },
          headers: {},
          path: '/auth/refresh',
          url: '/auth/refresh',
          baseUrl: '/api/v1',
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
