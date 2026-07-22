/**
 * One-shot migrate: disk `/uploads/…` → `StoredImage` + rewrite column to `/media/:id`.
 * Dry-run by default. Used by `scripts/migrate-legacy-uploads.ts`.
 */
import { readFile } from 'fs/promises';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  compressImageForStorage,
  mediaPathForId,
} from './image-media.util';
import {
  defaultUploadsRoot,
  listLegacyUploadRows,
  resolveLegacyUploadDiskPath,
  rewriteLegacyUploadPath,
  type LegacyUploadRow,
} from './legacy-uploads.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type LegacyUploadMigrateSkipReason =
  | 'invalid_path'
  | 'missing_file'
  | 'read_error'
  | 'compress_error';

export type LegacyUploadMigrateRowResult =
  | {
      status: 'would_migrate' | 'migrated';
      row: LegacyUploadRow;
      mediaPath: string;
    }
  | {
      status: 'skipped';
      row: LegacyUploadRow;
      reason: LegacyUploadMigrateSkipReason;
      detail?: string;
    };

export type LegacyUploadMigrateResult = {
  dryRun: boolean;
  uploadsRoot: string;
  results: LegacyUploadMigrateRowResult[];
  summary: {
    total: number;
    migrated: number;
    wouldMigrate: number;
    skipped: number;
  };
};

async function storeBufferAsMedia(
  db: DbClient,
  shopId: string,
  buffer: Buffer,
): Promise<string> {
  const compressed = await compressImageForStorage(buffer);
  const row = await db.storedImage.create({
    data: {
      shopId,
      mime: compressed.mime,
      encoding: compressed.encoding,
      width: compressed.width,
      height: compressed.height,
      byteSize: compressed.byteSize,
      data: Uint8Array.from(compressed.data),
    },
  });
  return mediaPathForId(row.id);
}

/**
 * Migrate legacy disk image refs into StoredImage.
 *
 * @param opts.dryRun default true — plan only (no DB/disk writes)
 * @param opts.apply set true (and dryRun false) to rewrite
 */
export async function migrateLegacyUploadsToMedia(
  db: DbClient,
  opts?: {
    dryRun?: boolean;
    apply?: boolean;
    uploadsRoot?: string;
  },
): Promise<LegacyUploadMigrateResult> {
  const apply = opts?.apply === true && opts?.dryRun !== true;
  const dryRun = !apply;
  const uploadsRoot = opts?.uploadsRoot ?? defaultUploadsRoot();
  const rows = await listLegacyUploadRows(db);
  const results: LegacyUploadMigrateRowResult[] = [];

  for (const row of rows) {
    const diskPath = resolveLegacyUploadDiskPath(row.path, uploadsRoot);
    if (!diskPath) {
      results.push({ status: 'skipped', row, reason: 'invalid_path' });
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(diskPath);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      results.push({
        status: 'skipped',
        row,
        reason: code === 'ENOENT' ? 'missing_file' : 'read_error',
        detail: diskPath,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        status: 'would_migrate',
        row,
        mediaPath: '/media/(pending)',
      });
      continue;
    }

    let mediaPath: string;
    try {
      mediaPath = await storeBufferAsMedia(db, row.shopId, buffer);
    } catch (err) {
      results.push({
        status: 'skipped',
        row,
        reason: 'compress_error',
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    await rewriteLegacyUploadPath(db, row, mediaPath);
    results.push({ status: 'migrated', row, mediaPath });
  }

  const summary = {
    total: results.length,
    migrated: results.filter((r) => r.status === 'migrated').length,
    wouldMigrate: results.filter((r) => r.status === 'would_migrate').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  };

  return { dryRun, uploadsRoot, results, summary };
}
