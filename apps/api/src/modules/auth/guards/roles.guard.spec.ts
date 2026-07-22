import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiDomainErrorCode } from '../../../common/api-error.codes';
import { PERMISSIONS } from '../../../common/permissions';
import { RolesGuard } from './roles.guard';

function expectForbiddenWithCode(err: unknown, code: string) {
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getResponse()).toMatchObject({ code });
}

function mockCtx(user: unknown) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  };
}

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows when no role or permission metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(mockCtx({}) as never)).toBe(true);
  });

  it('throws PERMISSION_DENIED when auth context missing', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === 'perms') return [PERMISSIONS.MENU_READ];
      return undefined;
    });

    try {
      guard.canActivate(mockCtx(undefined) as never);
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.PERMISSION_DENIED);
    }
  });

  it('throws PERMISSION_DENIED on insufficient shop role', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === 'shopRoles') return ['OWNER'];
      return undefined;
    });

    try {
      guard.canActivate(
        mockCtx({ shopRole: 'STAFF', perms: '*' }) as never,
      );
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.PERMISSION_DENIED);
    }
  });

  it('throws PERMISSION_DENIED with required permissions on missing perm', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === 'perms') return [PERMISSIONS.MENU_WRITE];
      return undefined;
    });

    try {
      guard.canActivate(
        mockCtx({ shopRole: 'MANAGER', perms: 'menu.read' }) as never,
      );
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.PERMISSION_DENIED);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        details: { permissions: [PERMISSIONS.MENU_WRITE] },
      });
    }
  });
});
