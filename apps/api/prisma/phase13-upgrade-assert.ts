import { PrismaService } from '../src/prisma/prisma.service';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const shop = await prisma.shop.findUnique({ where: { slug: 'phase13-upgrade-venue' } });
    const organization = await prisma.organization.findUnique({ where: { slug: 'phase13-upgrade-org' } });
    invariant(shop, 'Pre-Phase-13 Shop was lost during upgrade.');
    invariant(organization, 'Pre-Phase-13 Organization was lost during upgrade.');
    const link = await prisma.organizationShop.findUnique({
      where: { organizationId_shopId: { organizationId: organization.id, shopId: shop.id } },
    });
    invariant(link?.branchCode === 'WAW', 'Pre-Phase-13 OrganizationShop configuration changed during upgrade.');

    const importJob = await prisma.dataImportJob.create({
      data: {
        shopId: shop.id,
        kind: 'PRODUCTS',
        status: 'PREVIEW_READY',
        sourceHash: 'phase13-upgrade-source',
        rowCount: 1,
        rows: [{ name: 'Upgrade Product', price: '10.00' }],
        preview: { valid: true },
        createdById: shop.ownerId,
      },
    });
    invariant(importJob.id, 'New Phase-13 table is not writable after representative upgrade.');
    console.log(JSON.stringify({ ok: true, shopId: shop.id, organizationId: organization.id, importJobId: importJob.id }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
