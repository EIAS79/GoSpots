/**
 * Phase 1 upload security — inventory + static-serve gate for legacy `/uploads/…`.
 *
 * New uploads already go to `StoredImage` (`/media/:id`). Disk static serve remains
 * only for pre-migration URLs; disable via `LEGACY_UPLOADS_STATIC=false` after
 * inventory reports zero refs (see `scripts/inventory-legacy-uploads.ts`).
 */
import { isAbsolute, relative, resolve } from 'path';
import type { Prisma, PrismaClient } from '@prisma/client';
import { isLegacyUploadPath } from './image-media.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Env `LEGACY_UPLOADS_STATIC` — default ON (serve) for backward compatibility. */
export function isLegacyUploadsStaticEnabled(env: {
  LEGACY_UPLOADS_STATIC?: string | undefined | null;
}): boolean {
  const raw = env.LEGACY_UPLOADS_STATIC?.trim().toLowerCase();
  if (raw == null || raw === '') return true;
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') {
    return false;
  }
  return true;
}

export type LegacyUploadTargetKey =
  | 'shop.coverImage'
  | 'menuSection.imageUrl'
  | 'menuItem.imageUrl'
  | 'menuItem.imageUrl2'
  | 'resourceCategory.imageUrl'
  | 'resourceCategory.imageUrl2'
  | 'gamingSection.imageUrl'
  | 'diningTableGroup.imageUrl'
  | 'resource.imageUrl'
  | 'galleryItem.imageUrl';

export type LegacyUploadInventoryCounts = Record<LegacyUploadTargetKey, number> & {
  total: number;
};

const LEGACY_PREFIX_FILTER = { startsWith: '/uploads/' } as const;

/**
 * Map disk path `/uploads/a/b.png` → absolute file under `uploadsRoot`.
 * Rejects traversal / paths outside the uploads root.
 */
export function resolveLegacyUploadDiskPath(
  legacyPath: string,
  uploadsRoot: string,
): string | null {
  if (!isLegacyUploadPath(legacyPath)) return null;
  const relativePart = legacyPath.slice('/uploads/'.length);
  if (!relativePart || relativePart.includes('\0')) return null;

  const root = resolve(uploadsRoot);
  const full = resolve(root, relativePart);
  const rel = relative(root, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  // Reject odd separators that resolve still somehow escaping on Windows.
  if (rel.split(/[/\\]/).includes('..')) return null;
  return full;
}

/** Normalize Windows/POSIX for tests comparing under a root. */
export function isPathInsideRoot(candidate: string, root: string): boolean {
  const absRoot = resolve(root);
  const abs = resolve(candidate);
  const rel = relative(absRoot, abs);
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

export async function countLegacyUploadPaths(
  db: DbClient,
): Promise<LegacyUploadInventoryCounts> {
  const [
    shopCover,
    menuSection,
    menuItem1,
    menuItem2,
    resourceCategory1,
    resourceCategory2,
    gamingSection,
    diningTableGroup,
    resource,
    galleryItem,
  ] = await Promise.all([
    db.shop.count({ where: { coverImage: LEGACY_PREFIX_FILTER } }),
    db.menuSection.count({ where: { imageUrl: LEGACY_PREFIX_FILTER } }),
    db.menuItem.count({ where: { imageUrl: LEGACY_PREFIX_FILTER } }),
    db.menuItem.count({ where: { imageUrl2: LEGACY_PREFIX_FILTER } }),
    db.resourceCategory.count({ where: { imageUrl: LEGACY_PREFIX_FILTER } }),
    db.resourceCategory.count({ where: { imageUrl2: LEGACY_PREFIX_FILTER } }),
    db.gamingSection.count({ where: { imageUrl: LEGACY_PREFIX_FILTER } }),
    db.diningTableGroup.count({ where: { imageUrl: LEGACY_PREFIX_FILTER } }),
    db.resource.count({ where: { imageUrl: LEGACY_PREFIX_FILTER } }),
    db.galleryItem.count({ where: { imageUrl: LEGACY_PREFIX_FILTER } }),
  ]);

  const counts: LegacyUploadInventoryCounts = {
    'shop.coverImage': shopCover,
    'menuSection.imageUrl': menuSection,
    'menuItem.imageUrl': menuItem1,
    'menuItem.imageUrl2': menuItem2,
    'resourceCategory.imageUrl': resourceCategory1,
    'resourceCategory.imageUrl2': resourceCategory2,
    'gamingSection.imageUrl': gamingSection,
    'diningTableGroup.imageUrl': diningTableGroup,
    'resource.imageUrl': resource,
    'galleryItem.imageUrl': galleryItem,
    total: 0,
  };
  counts.total =
    shopCover +
    menuSection +
    menuItem1 +
    menuItem2 +
    resourceCategory1 +
    resourceCategory2 +
    gamingSection +
    diningTableGroup +
    resource +
    galleryItem;
  return counts;
}

export type LegacyUploadRow = {
  target: LegacyUploadTargetKey;
  id: string;
  shopId: string;
  path: string;
};

/** Fetch rows still pointing at `/uploads/…` (for migrate tooling). */
export async function listLegacyUploadRows(
  db: DbClient,
): Promise<LegacyUploadRow[]> {
  const [
    shops,
    menuSections,
    menuItems1,
    menuItems2,
    cats1,
    cats2,
    sections,
    tableGroups,
    resources,
    gallery,
  ] = await Promise.all([
    db.shop.findMany({
      where: { coverImage: LEGACY_PREFIX_FILTER },
      select: { id: true, coverImage: true },
    }),
    db.menuSection.findMany({
      where: { imageUrl: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl: true },
    }),
    db.menuItem.findMany({
      where: { imageUrl: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl: true },
    }),
    db.menuItem.findMany({
      where: { imageUrl2: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl2: true },
    }),
    db.resourceCategory.findMany({
      where: { imageUrl: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl: true },
    }),
    db.resourceCategory.findMany({
      where: { imageUrl2: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl2: true },
    }),
    db.gamingSection.findMany({
      where: { imageUrl: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl: true },
    }),
    db.diningTableGroup.findMany({
      where: { imageUrl: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl: true },
    }),
    db.resource.findMany({
      where: { imageUrl: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl: true },
    }),
    db.galleryItem.findMany({
      where: { imageUrl: LEGACY_PREFIX_FILTER },
      select: { id: true, shopId: true, imageUrl: true },
    }),
  ]);

  const rows: LegacyUploadRow[] = [];
  for (const s of shops) {
    if (s.coverImage) {
      rows.push({
        target: 'shop.coverImage',
        id: s.id,
        shopId: s.id,
        path: s.coverImage,
      });
    }
  }
  for (const r of menuSections) {
    if (r.imageUrl) {
      rows.push({
        target: 'menuSection.imageUrl',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl,
      });
    }
  }
  for (const r of menuItems1) {
    if (r.imageUrl) {
      rows.push({
        target: 'menuItem.imageUrl',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl,
      });
    }
  }
  for (const r of menuItems2) {
    if (r.imageUrl2) {
      rows.push({
        target: 'menuItem.imageUrl2',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl2,
      });
    }
  }
  for (const r of cats1) {
    if (r.imageUrl) {
      rows.push({
        target: 'resourceCategory.imageUrl',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl,
      });
    }
  }
  for (const r of cats2) {
    if (r.imageUrl2) {
      rows.push({
        target: 'resourceCategory.imageUrl2',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl2,
      });
    }
  }
  for (const r of sections) {
    if (r.imageUrl) {
      rows.push({
        target: 'gamingSection.imageUrl',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl,
      });
    }
  }
  for (const r of tableGroups) {
    if (r.imageUrl) {
      rows.push({
        target: 'diningTableGroup.imageUrl',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl,
      });
    }
  }
  for (const r of resources) {
    if (r.imageUrl) {
      rows.push({
        target: 'resource.imageUrl',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl,
      });
    }
  }
  for (const r of gallery) {
    if (r.imageUrl) {
      rows.push({
        target: 'galleryItem.imageUrl',
        id: r.id,
        shopId: r.shopId,
        path: r.imageUrl,
      });
    }
  }
  return rows;
}

/** Rewrite one row's image column to a `/media/:id` path. */
export async function rewriteLegacyUploadPath(
  db: DbClient,
  row: LegacyUploadRow,
  mediaPath: string,
): Promise<void> {
  switch (row.target) {
    case 'shop.coverImage':
      await db.shop.update({
        where: { id: row.id },
        data: { coverImage: mediaPath },
      });
      return;
    case 'menuSection.imageUrl':
      await db.menuSection.update({
        where: { id: row.id },
        data: { imageUrl: mediaPath },
      });
      return;
    case 'menuItem.imageUrl':
      await db.menuItem.update({
        where: { id: row.id },
        data: { imageUrl: mediaPath },
      });
      return;
    case 'menuItem.imageUrl2':
      await db.menuItem.update({
        where: { id: row.id },
        data: { imageUrl2: mediaPath },
      });
      return;
    case 'resourceCategory.imageUrl':
      await db.resourceCategory.update({
        where: { id: row.id },
        data: { imageUrl: mediaPath },
      });
      return;
    case 'resourceCategory.imageUrl2':
      await db.resourceCategory.update({
        where: { id: row.id },
        data: { imageUrl2: mediaPath },
      });
      return;
    case 'gamingSection.imageUrl':
      await db.gamingSection.update({
        where: { id: row.id },
        data: { imageUrl: mediaPath },
      });
      return;
    case 'diningTableGroup.imageUrl':
      await db.diningTableGroup.update({
        where: { id: row.id },
        data: { imageUrl: mediaPath },
      });
      return;
    case 'resource.imageUrl':
      await db.resource.update({
        where: { id: row.id },
        data: { imageUrl: mediaPath },
      });
      return;
    case 'galleryItem.imageUrl':
      await db.galleryItem.update({
        where: { id: row.id },
        data: { imageUrl: mediaPath },
      });
      return;
    default: {
      const _exhaustive: never = row.target;
      void _exhaustive;
      throw new Error(`Unknown legacy upload target: ${row.target}`);
    }
  }
}

/** Uploads root under process cwd (Nest serves `join(cwd(), 'uploads')`). */
export function defaultUploadsRoot(cwd = process.cwd()): string {
  return resolve(cwd, 'uploads');
}

/** Soft warning copy for boot when static serve is still on. */
export function legacyUploadsStaticBootWarning(): string {
  return (
    'Legacy static /api/v1/uploads/ is enabled (LEGACY_UPLOADS_STATIC default on). ' +
    'New uploads use StoredImage + GET /media/:id. ' +
    'Run `pnpm run inventory:legacy-uploads`, then `migrate:legacy-uploads -- --apply` when disk files exist; ' +
    'set LEGACY_UPLOADS_STATIC=false only when inventory total is 0.'
  );
}
