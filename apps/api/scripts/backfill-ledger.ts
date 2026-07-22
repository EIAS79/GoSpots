/**
 * Historical LedgerEntry backfill (bible #6 Phase 3).
 * Dry-run by default. Idempotent (unique source key → duplicate).
 *
 * From apps/api:
 *   pnpm run backfill:ledger -- --dry-run
 *   pnpm run backfill:ledger -- --apply
 *   pnpm run backfill:ledger -- --apply --shopId=clxxx
 *
 * Does not enable LEDGER_DUAL_WRITE / LEDGER_READS.
 * See docs/audit/GO_SPOTS_LEDGER.md Phase 3.
 */
import { PrismaClient } from '@prisma/client';
import { backfillLedgerAllShops } from '../src/common/ledger-backfill.util';

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const dryRunFlag = argv.includes('--dry-run');
  const dryRun = dryRunFlag || !apply;
  const shopArg = argv.find((a) => a.startsWith('--shopId='));
  const shopId = shopArg?.slice('--shopId='.length)?.trim() || undefined;
  return { apply: apply && !dryRunFlag, dryRun, shopId };
}

async function main() {
  const { apply, dryRun, shopId } = parseArgs(process.argv.slice(2));
  const result = await backfillLedgerAllShops(prisma, {
    dryRun,
    shopId,
  });

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'apply',
        shopId: shopId ?? null,
        ...result,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log(
      '\nDry-run only (no writes). Re-run with --apply to insert missing ledger rows.',
    );
  } else if (!apply) {
    console.log('\nNo apply flag; nothing written.');
  } else {
    console.log(
      `\nPosted ${result.posted} (duplicates ${result.duplicate}, skipped ${result.skipped}).`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
