/**
 * Read-only: compare non-custom SeatingTableGroup totals vs DINING Resource
 * unit counts by (floor, zone, capacity) for shops that have dining layout.
 *
 * From apps/api:
 *   pnpm run detect:resource-dining-drift
 *
 * Exit 1 if any drifted bucket is found (informational gate; never auto-fixes).
 * See docs/audit/GO_SPOTS_RESOURCE_MODEL_MERGE.md Phase 1.
 */
import { PrismaClient } from '@prisma/client';
import { detectResourceDiningDrift } from '../src/common/resource-dining-drift.util';

const prisma = new PrismaClient();

async function main() {
  const report = await detectResourceDiningDrift(prisma);
  console.log(
    JSON.stringify(
      {
        shopsWithDiningResources: report.shopsWithDiningResources,
        shopsCompared: report.shopsCompared,
        bucketsCompared: report.bucketsCompared,
        matchedBuckets: report.matchedBuckets,
        driftedBuckets: report.driftedBuckets,
        samples: report.samples,
      },
      null,
      2,
    ),
  );

  if (report.driftedBuckets === 0) {
    console.log(
      `\nOK: ${report.bucketsCompared} bucket(s) matched across ${report.shopsCompared} dining shop(s).`,
    );
    process.exitCode = 0;
    return;
  }

  console.log(
    `\nFOUND ${report.driftedBuckets} drifted bucket(s) (read-only; no changes made).`,
  );
  console.log(
    'Option C: seating counts are advisory — investigate dual UIs; do NOT auto-sync availableCount.',
  );
  console.log('See docs/audit/GO_SPOTS_RESOURCE_MODEL_MERGE.md');
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 2;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
