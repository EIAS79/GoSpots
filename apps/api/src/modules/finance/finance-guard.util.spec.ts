import { ForbiddenException } from '@nestjs/common';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { PERMISSIONS } from '../../common/permissions';
import { assertFinancePerm } from './finance-guard.util';

function expectForbiddenWithCode(err: unknown, code: string) {
  expect(err).toBeInstanceOf(ForbiddenException);
  expect((err as ForbiddenException).getResponse()).toMatchObject({ code });
}

describe('assertFinancePerm', () => {
  it('throws VENUE_ACCESS_DENIED when shopId missing', () => {
    try {
      assertFinancePerm({ sub: 'u1' } as never, PERMISSIONS.TRANSACTION_READ);
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.VENUE_ACCESS_DENIED);
    }
  });

  it('throws PERMISSION_DENIED with permission detail when perm missing', () => {
    try {
      assertFinancePerm(
        {
          shopId: 'shop_1',
          perms: 'transaction.read',
        } as never,
        PERMISSIONS.TRANSACTION_WRITE,
      );
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expectForbiddenWithCode(err, ApiDomainErrorCode.PERMISSION_DENIED);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        details: { permission: PERMISSIONS.TRANSACTION_WRITE },
      });
    }
  });

  it('allows wildcard perms', () => {
    expect(() =>
      assertFinancePerm(
        { shopId: 'shop_1', perms: '*' } as never,
        PERMISSIONS.TRANSACTION_WRITE,
      ),
    ).not.toThrow();
  });
});
