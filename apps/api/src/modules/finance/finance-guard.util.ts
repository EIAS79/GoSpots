import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiForbiddenException } from '../../common/api-error.util';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { serializeMoney, type MoneyInput } from '../../common/money.util';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.types';

export function assertFinancePerm(actor: JwtAccessPayload, perm: string) {
  if (!actor.shopId) {
    throw apiForbiddenException(
      ApiDomainErrorCode.VENUE_ACCESS_DENIED,
      'Open a venue dashboard first, then try again.',
    );
  }
  const p = actor.perms ?? '';
  if (p !== '*' && !p.split(',').includes(perm)) {
    throw apiForbiddenException(
      ApiDomainErrorCode.PERMISSION_DENIED,
      `Missing ${perm}`,
      { permission: perm },
    );
  }
}

export async function requireFinanceFeature(
  prisma: PrismaService,
  shopId: string,
  feature: string,
) {
  await assertShopFeature(prisma, shopId, feature);
}

export function serializeLoss<T extends { amount: MoneyInput }>(loss: T) {
  return { ...loss, amount: serializeMoney(loss.amount) };
}
