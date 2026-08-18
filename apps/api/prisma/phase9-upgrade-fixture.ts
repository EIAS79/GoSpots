import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const prefix = `p9upgrade_${Date.now()}`;
  try {
    const user = await prisma.user.create({
      data: {
        id: `${prefix}_user`,
        email: `${prefix}@gospots.invalid`,
        name: 'Phase 9 Upgrade Fixture',
        passwordHash: 'x',
      },
    });
    const shop = await prisma.shop.create({
      data: {
        id: `${prefix}_shop`,
        name: 'Phase 9 Upgrade Fixture',
        slug: prefix,
        dashboardKey: `${prefix}_key`,
        ownerId: user.id,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
    });
    const customer = await prisma.customerProfile.create({
      data: {
        id: `${prefix}_customer`,
        shopId: shop.id,
        name: 'Legacy Customer',
        email: `${prefix}.customer@gospots.invalid`,
        marketingConsentAt: new Date('2026-01-01T00:00:00.000Z'),
        consentSource: 'LEGACY_FORM',
      },
    });
    await prisma.customerIdentity.create({
      data: {
        shopId: shop.id,
        customerId: customer.id,
        kind: 'EMAIL',
        normalizedValue: customer.email!,
      },
    });
    await prisma.loyaltyLedgerEntry.create({
      data: {
        id: `${prefix}_loyalty`,
        shopId: shop.id,
        customerId: customer.id,
        type: 'EARN',
        points: 40,
        sourceType: 'LEGACY',
        sourceId: `${prefix}_sale`,
        correlationId: `${prefix}_loyalty_corr`,
      },
    });
    const wallet = await prisma.storedValueAccount.create({
      data: {
        id: `${prefix}_wallet`,
        shopId: shop.id,
        customerId: customer.id,
        codeHash: `${prefix}_hash`,
        currency: 'PLN',
      },
    });
    await prisma.storedValueLedgerEntry.create({
      data: {
        id: `${prefix}_wallet_entry`,
        shopId: shop.id,
        accountId: wallet.id,
        type: 'LOAD',
        amountMinor: 2500,
        currency: 'PLN',
        sourceType: 'LEGACY_OPENING',
        sourceId: `${prefix}_opening`,
        correlationId: `${prefix}_wallet_corr`,
      },
    });
    console.log(`PHASE9_UPGRADE_FIXTURE=${prefix}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
