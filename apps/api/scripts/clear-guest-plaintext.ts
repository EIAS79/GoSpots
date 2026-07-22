/**
 * Clear leftover guestToken plaintext when guestTokenHash is already set.
 * Dry-run by default (count only). Does not touch plaintext-only rows.
 *
 * From apps/api:
 *   pnpm run clear:guest-plaintext -- --dry-run
 *   pnpm run clear:guest-plaintext -- --apply
 *
 * See docs/audit/DEPLOY_CHECKLIST.md (post-verify window tool).
 */
import { PrismaClient } from '@prisma/client';
import { clearLeftoverGuestPlaintext } from '../src/common/guest-plaintext-clear.util';

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const dryRunFlag = argv.includes('--dry-run');
  // Default dry-run; --apply wins only when --dry-run is absent.
  const dryRun = dryRunFlag || !apply;
  return { apply: apply && !dryRunFlag, dryRun };
}

async function main() {
  const { apply, dryRun } = parseArgs(process.argv.slice(2));
  const result = await clearLeftoverGuestPlaintext(prisma, { apply, dryRun });

  console.log(
    JSON.stringify(
      {
        mode: result.dryRun ? 'dry-run' : 'apply',
        counted: result.counted,
        ...(result.cleared ? { cleared: result.cleared } : {}),
      },
      null,
      2,
    ),
  );

  if (result.dryRun) {
    console.log(
      '\nDry-run only (no writes). Re-run with --apply to clear plaintext where hash exists.',
    );
  } else {
    console.log(
      `\nCleared plaintext on ${result.cleared?.total ?? 0} row(s). Plaintext-only (no hash) rows were left untouched.`,
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
