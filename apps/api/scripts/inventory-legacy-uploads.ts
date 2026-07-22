/**
 * Count DB columns still holding legacy `/uploads/…` image paths.
 * Read-only (no writes).
 *
 * From apps/api:
 *   pnpm run inventory:legacy-uploads
 *
 * When total is 0, set LEGACY_UPLOADS_STATIC=false to stop serving disk uploads.
 * See docs/audit/GO_SPOTS_UPLOAD_SECURITY.md Phase 1.
 */
import { PrismaClient } from '@prisma/client';
import { countLegacyUploadPaths } from '../src/common/legacy-uploads.util';

const prisma = new PrismaClient();

async function main() {
  const counts = await countLegacyUploadPaths(prisma);
  console.log(JSON.stringify(counts, null, 2));
  if (counts.total === 0) {
    console.log(
      '\nNo legacy /uploads/ refs. Safe to set LEGACY_UPLOADS_STATIC=false and remove host uploads/ when ready.',
    );
  } else {
    console.log(
      `\n${counts.total} legacy path ref(s). Keep LEGACY_UPLOADS_STATIC on (default), ` +
        'then run: pnpm run migrate:legacy-uploads -- --dry-run',
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
