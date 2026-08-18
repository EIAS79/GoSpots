import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const prefix = 'phase11_upgrade_fixture';
  try {
    const owner = await prisma.user.upsert({
      where: { email: `${prefix}.owner@gospots.invalid` },
      create: {
        id: `${prefix}_owner`,
        email: `${prefix}.owner@gospots.invalid`,
        name: 'Phase 11 Upgrade Owner',
        passwordHash: 'x',
      },
      update: {},
    });
    const shop = await prisma.shop.upsert({
      where: { slug: prefix },
      create: {
        id: `${prefix}_shop`,
        name: 'Phase 11 Upgrade Shop',
        slug: prefix,
        dashboardKey: `${prefix}_key`,
        ownerId: owner.id,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
      update: {},
    });

    const productId = `${prefix}_product`;
    const orderId = `${prefix}_order`;
    const walletId = `${prefix}_wallet`;
    const credentialId = `${prefix}_credential`;

    // Use raw SQL because this fixture runs before the Phase 11 migration while
    // the generated client already knows the post-Phase-11 schema.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TicketProduct" ("id","shopId","name","sku","priceMinor","currency","validityMinutes","maxScans","active","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      productId,
      shop.id,
      'Legacy admission',
      'LEGACY-P11',
      2500,
      'PLN',
      180,
      1,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TicketOrder" ("id","shopId","idempotencyKey","status","totalMinor","currency","createdAt","updatedAt")
       VALUES ($1,$2,$3,'PAID',$4,'PLN',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      orderId,
      shop.id,
      `${prefix}:legacy-order`,
      2500,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RfidWallet" ("id","shopId","label","currency","balanceMinor","version","active","createdAt","updatedAt")
       VALUES ($1,$2,'Legacy wristband','PLN',4200,1,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      walletId,
      shop.id,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RfidCredential" ("id","shopId","uidHash","walletId","status","version","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,'ACTIVE',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      credentialId,
      shop.id,
      `${prefix}_uid_hash`,
      walletId,
    );

    console.log(JSON.stringify({ shopId: shop.id, productId, orderId, walletId, credentialId }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
