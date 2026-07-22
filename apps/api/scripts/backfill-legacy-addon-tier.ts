/**
 * Persist legacy STANDARD+ empty add-ons → CSV + SubscriptionAddOn rows.
 * Dry-run by default (count only). Does not drop `Subscription.tier`.
 *
 * From apps/api:
 *   pnpm run backfill:legacy-addon-tier -- --dry-run
 *   pnpm run backfill:legacy-addon-tier -- --apply
 *
 * See docs/audit/GO_SPOTS_PACK_TIER.md Phase 1.
 */
import { PrismaClient } from '@prisma/client';
import {
  backfillLegacyEmptyAddOns,
  listLegacyEmptyAddonSubscriptions,
} from '../src/common/pack-tier-backfill.util';

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const dryRunFlag = argv.includes('--dry-run');
  const dryRun = dryRunFlag || !apply;
  return { apply: apply && !dryRunFlag, dryRun };
}

async function main() {
  const { apply, dryRun } = parseArgs(process.argv.slice(2));

  if (dryRun) {
    const candidates = await listLegacyEmptyAddonSubscriptions(prisma);
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          candidates: candidates.length,
          sample: candidates.slice(0, 10).map((c) => ({
            id: c.id,
            shopId: c.shopId,
            tier: c.tier,
            packId: c.packId,
            proposedAddOns: c.proposedAddOns,
          })),
        },
        null,
        2,
      ),
    );
    console.log(
      '\nDry-run only (no writes). Re-run with --apply to persist legacy add-ons.',
    );
    return;
  }

  const result = await backfillLegacyEmptyAddOns(prisma, { apply: true });
  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        candidates: result.candidates,
        updated: result.updated,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nUpdated ${result.updated ?? 0} subscription(s). Subscription.tier retained (derived write).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
