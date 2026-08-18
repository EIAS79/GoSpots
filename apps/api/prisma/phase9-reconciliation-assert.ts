import type { JwtAccessPayload } from '../src/modules/auth/auth.service';
import { Phase9ReconciliationService } from '../src/modules/growth/phase9-reconciliation.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const shop = await prisma.shop.findFirst({
      where: { name: 'Phase 9 Pilot' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ownerId: true },
    });
    if (!shop) throw new Error('PHASE9_RECONCILIATION: pilot shop not found');
    const actor: JwtAccessPayload = {
      sub: shop.ownerId,
      shopId: shop.id,
      shopRole: 'OWNER',
      sysRole: 'USER',
    };
    const result = await new Phase9ReconciliationService(prisma).reconcile(actor);
    if (!result.ok) {
      throw new Error(`PHASE9_RECONCILIATION: ${JSON.stringify(result.issues)}`);
    }
    if (!Object.values(result.storedValue.liabilityByCurrency).some((value) => value > 0)) {
      throw new Error('PHASE9_RECONCILIATION: stored-value liability projection is empty');
    }
    if (!Object.values(result.loyalty.balancesByCustomer).some((value) => value >= 0)) {
      throw new Error('PHASE9_RECONCILIATION: loyalty projection is empty');
    }
    if (!result.packages.balances.some((row) => row.balanceUnits > 0)) {
      throw new Error('PHASE9_RECONCILIATION: package balance projection is empty');
    }
    console.log(
      `PHASE9_RECONCILIATION=PASS shop=${shop.id} issues=0 promotions=${result.promotions.redemptionCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
