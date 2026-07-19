import type { PrismaService } from '../prisma/prisma.service';

/** Raw SQL helpers — works even before Prisma client is regenerated with imageUrl. */

export async function sectionImageUrlsByShop(
  prisma: PrismaService,
  shopId: string,
): Promise<Map<string, string | null>> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; imageUrl: string | null }>
  >`
    SELECT "id", "imageUrl" FROM "MenuSection" WHERE "shopId" = ${shopId}
  `;
  return new Map(rows.map((r) => [r.id, r.imageUrl]));
}

export async function sectionImageUrl(
  prisma: PrismaService,
  shopId: string,
  sectionId: string,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ imageUrl: string | null }>>`
    SELECT "imageUrl" FROM "MenuSection"
    WHERE "id" = ${sectionId} AND "shopId" = ${shopId}
    LIMIT 1
  `;
  return rows[0]?.imageUrl ?? null;
}

export async function setSectionImageUrl(
  prisma: PrismaService,
  shopId: string,
  sectionId: string,
  imageUrl: string | null,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "MenuSection"
    SET "imageUrl" = ${imageUrl}, "updatedAt" = NOW()
    WHERE "id" = ${sectionId} AND "shopId" = ${shopId}
  `;
}
