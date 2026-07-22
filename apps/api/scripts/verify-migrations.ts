/**
 * Read-only post-deploy migration health check (bible #9 Phase 3).
 *
 * From apps/api:
 *   pnpm run verify:migrations
 *   pnpm run verify:migrations -- --spot-checks
 *
 * Compares on-disk `prisma/migrations/*` folders to `_prisma_migrations`.
 * Optional `--spot-checks` runs lightweight SQL probes (money nulls / guest hash).
 * Never runs migrate deploy/reset. Safe against Neon read-only; prefer deploy-host URL.
 *
 * Exit: 0 = all disk folders applied (+ spot checks pass when requested)
 *       1 = pending migrations or failing spot check
 *       2 = script/connection error
 */
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  compareMigrationSets,
  evaluateGuestTokenHashSpot,
  evaluateMoneyDecimalSpot,
  listMigrationDirNames,
} from '../src/common/verify-migrations.util';

const prisma = new PrismaClient();

function wantsSpotChecks(argv: string[]): boolean {
  return argv.includes('--spot-checks');
}

async function loadAppliedNames(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT "migration_name" AS migration_name
    FROM "_prisma_migrations"
    WHERE "rolled_back_at" IS NULL
    ORDER BY "finished_at" ASC NULLS LAST, "migration_name" ASC
  `;
  return rows.map((r) => r.migration_name);
}

async function runSpotChecks(): Promise<boolean> {
  // Core commercial prices should not be NULL after money_decimal_core.
  const money = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "MenuItem" WHERE price IS NULL
  `;
  const moneyEval = evaluateMoneyDecimalSpot({
    unexpectedNullMoneyRows: Number(money[0]?.n ?? 0),
  });
  console.log(`[spot] ${moneyEval.id}: ${moneyEval.detail}`);

  // Dual-read window: plaintext without hash is informational (never fails verify).
  const guest = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT (
      (SELECT COUNT(*) FROM "Reservation"
        WHERE "guestToken" IS NOT NULL AND trim("guestToken") <> ''
          AND ("guestTokenHash" IS NULL OR "guestTokenHash" = ''))
      + (SELECT COUNT(*) FROM "EventRequest"
        WHERE "guestToken" IS NOT NULL AND trim("guestToken") <> ''
          AND ("guestTokenHash" IS NULL OR "guestTokenHash" = ''))
      + (SELECT COUNT(*) FROM "GuestChat"
        WHERE "guestToken" IS NOT NULL AND trim("guestToken") <> ''
          AND ("guestTokenHash" IS NULL OR "guestTokenHash" = ''))
    )::bigint AS n
  `;
  const guestEval = evaluateGuestTokenHashSpot({
    plaintextWithoutHash: Number(guest[0]?.n ?? 0),
  });
  console.log(`[spot] ${guestEval.id}: ${guestEval.detail}`);

  return moneyEval.ok;
}

async function main() {
  const migrationsRoot = join(__dirname, '..', 'prisma', 'migrations');
  const disk = listMigrationDirNames(migrationsRoot);
  if (disk.length === 0) {
    console.error(`No migration folders under ${migrationsRoot}`);
    process.exitCode = 2;
    return;
  }

  const applied = await loadAppliedNames();
  const diff = compareMigrationSets(disk, applied);

  console.log(
    JSON.stringify(
      {
        diskCount: diff.disk.length,
        appliedCount: diff.applied.length,
        pendingOnDb: diff.pendingOnDb,
        extraOnDb: diff.extraOnDb,
        ok: diff.ok,
      },
      null,
      2,
    ),
  );

  if (!diff.ok) {
    console.error(
      `\nFAIL: ${diff.pendingOnDb.length} migration folder(s) not applied. ` +
        'Operator: pnpm migrate:deploy from deploy host (never reset).',
    );
    process.exitCode = 1;
    return;
  }

  console.log('\nOK: every on-disk migration folder is recorded in _prisma_migrations.');

  if (wantsSpotChecks(process.argv.slice(2))) {
    const spotsOk = await runSpotChecks();
    if (!spotsOk) {
      console.error('\nFAIL: one or more spot checks failed.');
      process.exitCode = 1;
      return;
    }
    console.log('OK: spot checks passed.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 2;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
