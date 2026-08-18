import { PrismaClient } from '@prisma/client';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE9_UPGRADE_ASSERT: ${message}`);
}

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    const customer = await prisma.customerProfile.findFirst({
      where: { name: 'Legacy Customer' },
      orderBy: { createdAt: 'desc' },
    });
    assert(customer, 'legacy customer was lost during migration');
    const loyalty = await prisma.loyaltyLedgerEntry.findMany({
      where: { shopId: customer.shopId, customerId: customer.id },
    });
    assert(
      loyalty.reduce((sum, row) => sum + row.points, 0) === 40,
      'legacy loyalty value changed during migration',
    );
    const wallet = await prisma.storedValueAccount.findFirst({
      where: { shopId: customer.shopId, customerId: customer.id },
    });
    assert(wallet, 'legacy stored-value account was lost during migration');
    const walletEntries = await prisma.storedValueLedgerEntry.findMany({
      where: { shopId: customer.shopId, accountId: wallet.id },
    });
    assert(
      walletEntries.reduce((sum, row) => sum + row.amountMinor, 0) === 2500,
      'legacy stored-value liability changed during migration',
    );

    await prisma.customerConsentEvent.create({
      data: {
        shopId: customer.shopId,
        customerId: customer.id,
        purpose: 'MARKETING',
        state: 'GRANTED',
        source: customer.consentSource ?? 'LEGACY_MIGRATION',
        occurredAt: customer.marketingConsentAt ?? new Date(),
      },
    });
    assert(
      (await prisma.customerConsentEvent.count({
        where: { shopId: customer.shopId, customerId: customer.id },
      })) === 1,
      'new Phase 9 consent evidence table is unusable after upgrade',
    );
    console.log(
      `PHASE9_UPGRADE_ASSERT=PASS customer=${customer.id} loyalty=40 storedValue=2500`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
