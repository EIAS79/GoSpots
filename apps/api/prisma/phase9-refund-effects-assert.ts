import { AuditService } from '../src/modules/audit/audit.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.service';
import { GrowthPricingService } from '../src/modules/growth/growth-pricing.service';
import { Phase9CustomerValueService } from '../src/modules/growth/phase9-customer-value.service';
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
    if (!shop) throw new Error('PHASE9_REFUND_EFFECTS: pilot shop not found');
    const customer = await prisma.customerProfile.findFirst({
      where: { shopId: shop.id, name: 'Canonical Member' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!customer) throw new Error('PHASE9_REFUND_EFFECTS: pilot customer not found');

    const actor: JwtAccessPayload = {
      sub: shop.ownerId,
      shopId: shop.id,
      shopRole: 'OWNER',
      sysRole: 'USER',
    };
    const audit = new AuditService(prisma);
    const phase9 = new Phase9CustomerValueService(
      prisma,
      audit,
      new GrowthPricingService(prisma, audit),
    );
    const sourceId = `refund-effects-${Date.now()}`;
    await phase9.loyalty(actor, customer.id, {
      type: 'EARN',
      points: 30,
      sourceType: 'REFUND_EFFECT_TEST',
      sourceId,
      correlationId: `${sourceId}:earn`,
    });
    const reversed = await phase9.reverseRewards(actor, customer.id, {
      sourceType: 'REFUND_EFFECT_TEST',
      sourceId,
      correlationId: `${sourceId}:reverse`,
    });
    if (reversed.reversedPoints !== 30) {
      throw new Error(
        `PHASE9_REFUND_EFFECTS: expected reversal of 30 points, got ${reversed.reversedPoints}`,
      );
    }
    const replay = await phase9.reverseRewards(actor, customer.id, {
      sourceType: 'REFUND_EFFECT_TEST',
      sourceId,
      correlationId: `${sourceId}:reverse`,
    });
    if (replay.entry?.id !== reversed.entry?.id) {
      throw new Error('PHASE9_REFUND_EFFECTS: refund reversal did not replay deterministically');
    }
    const sourceRows = await prisma.loyaltyLedgerEntry.findMany({
      where: {
        shopId: shop.id,
        customerId: customer.id,
        sourceType: 'REFUND_EFFECT_TEST',
        sourceId,
      },
      select: { points: true },
    });
    const net = sourceRows.reduce((sum, row) => sum + row.points, 0);
    if (net !== 0) {
      throw new Error(`PHASE9_REFUND_EFFECTS: refund source net is ${net}, expected 0`);
    }
    console.log(
      `PHASE9_REFUND_EFFECTS=PASS customer=${customer.id} reversed=30 replay=${replay.entry?.id}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
