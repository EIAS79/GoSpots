import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const owner = await prisma.user.create({
      data: {
        email: 'phase13-upgrade-owner@gospots.invalid',
        name: 'Phase 13 Upgrade Owner',
        passwordHash: 'x',
      },
    });
    const shop = await prisma.shop.create({
      data: {
        name: 'Phase 13 Upgrade Venue',
        slug: 'phase13-upgrade-venue',
        dashboardKey: 'phase13-upgrade-venue-key',
        ownerId: owner.id,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
    });
    const organization = await prisma.organization.create({
      data: {
        name: 'Phase 13 Upgrade Organization',
        slug: 'phase13-upgrade-org',
        createdById: owner.id,
      },
    });
    await prisma.organizationShop.create({
      data: { organizationId: organization.id, shopId: shop.id, branchCode: 'WAW' },
    });
    console.log(JSON.stringify({ ok: true, ownerId: owner.id, shopId: shop.id, organizationId: organization.id }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
