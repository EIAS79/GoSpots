/**
 * Read-only scan of ResourceCategory.offeringConfig validity + schemaVersion coverage.
 *
 * From apps/api:
 *   pnpm run inventory:offering-config
 *
 * See docs/audit/GO_SPOTS_OFFERING_CONFIG.md Phase 0.
 */
import { PrismaClient } from '@prisma/client';
import { inventoryOfferingConfigs } from '../src/common/offering-config.util';

const prisma = new PrismaClient();

async function main() {
  const report = await inventoryOfferingConfigs(prisma);
  console.log(JSON.stringify(report, null, 2));
  if (report.invalid === 0) {
    console.log(
      `\nAll ${report.withConfig} non-null offeringConfig row(s) pass validateOfferingConfig.`,
    );
  } else {
    console.log(
      `\n${report.invalid} invalid offeringConfig row(s). Fix before relational cutover.`,
    );
  }
  if (report.missingSchemaVersion > 0) {
    console.log(
      `${report.missingSchemaVersion} row(s) missing schemaVersion — next category save / FX reprice stamps version 1.`,
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
