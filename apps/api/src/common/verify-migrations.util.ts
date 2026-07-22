/**
 * Read-only migration health helpers (bible #9 Phase 3).
 * Compare on-disk Prisma migration folders to `_prisma_migrations` rows.
 * Never writes; never runs migrate deploy/reset.
 */
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

export type MigrationSetDiff = {
  disk: string[];
  applied: string[];
  /** On disk but not in `_prisma_migrations`. */
  pendingOnDb: string[];
  /** In `_prisma_migrations` but no folder on disk (renamed/removed history). */
  extraOnDb: string[];
  ok: boolean;
};

/** List Prisma migration directory names (excludes files like migration_lock.toml). */
export function listMigrationDirNames(migrationsRoot: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(migrationsRoot);
  } catch {
    return [];
  }
  return entries
    .filter((name) => {
      if (name.startsWith('.')) return false;
      try {
        return statSync(join(migrationsRoot, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

/** Diff disk folders vs applied migration names (order-independent). */
export function compareMigrationSets(
  disk: string[],
  applied: string[],
): MigrationSetDiff {
  const diskSet = new Set(disk);
  const appliedSet = new Set(applied);
  const pendingOnDb = disk.filter((n) => !appliedSet.has(n));
  const extraOnDb = applied.filter((n) => !diskSet.has(n));
  return {
    disk: [...disk].sort(),
    applied: [...applied].sort(),
    pendingOnDb,
    extraOnDb,
    ok: pendingOnDb.length === 0,
  };
}

export type SpotCheckResult = {
  id: string;
  ok: boolean;
  detail: string;
};

/**
 * Interpret optional post-deploy spot-check row counts.
 * Callers supply counts from read-only SQL; this stays DB-agnostic for unit tests.
 */
export function evaluateMoneyDecimalSpot(opts: {
  /** Rows where a core money column is still NULL unexpectedly (should be 0). */
  unexpectedNullMoneyRows: number;
}): SpotCheckResult {
  const n = opts.unexpectedNullMoneyRows;
  return {
    id: 'money_decimal_nulls',
    ok: n === 0,
    detail:
      n === 0
        ? 'No unexpected NULL core money values.'
        : `${n} unexpected NULL money row(s) — investigate money migration.`,
  };
}

export function evaluateGuestTokenHashSpot(opts: {
  /** Rows with plaintext token still set AND hash null (should trend to 0 after clear). */
  plaintextWithoutHash: number;
}): SpotCheckResult {
  const n = opts.plaintextWithoutHash;
  return {
    id: 'guest_token_hash_coverage',
    ok: true, // informational during dual-read window — never fail verify on soak leftovers
    detail:
      n === 0
        ? 'No plaintext guest tokens without hash.'
        : `${n} plaintext guest token(s) without hash (dual-read window; run clear:guest-plaintext when ready).`,
  };
}
