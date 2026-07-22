import { ForbiddenException } from '@nestjs/common';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { serializeMoney, type MoneyInput } from '../../common/money.util';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.types';

export function assertFinancePerm(actor: JwtAccessPayload, perm: string) {
  if (!actor.shopId) throw new ForbiddenException();
  const p = actor.perms ?? '';
  if (p !== '*' && !p.split(',').includes(perm)) {
    throw new ForbiddenException(`Missing ${perm}`);
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
