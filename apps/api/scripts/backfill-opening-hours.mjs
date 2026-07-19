// One-off: seed default weekly hours for shops that have none.
// Run: node scripts/backfill-opening-hours.mjs (from apps/api)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const shops = await prisma.shop.findMany({
  where: { openingHours: { none: {} } },
  select: { id: true, slug: true },
});

for (const shop of shops) {
  await prisma.openingHour.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      shopId: shop.id,
      weekday,
      opensAt: '09:00',
      closesAt: '22:00',
      isClosed: weekday === 0,
    })),
  });
  console.log(`Seeded default hours for ${shop.slug}`);
}

if (shops.length === 0) console.log('All shops already have hours.');
await prisma.$disconnect();
