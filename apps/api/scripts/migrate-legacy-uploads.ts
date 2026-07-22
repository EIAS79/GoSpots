/**
 * Migrate legacy disk `/uploads/…` image refs → StoredImage + `/media/:id`.
 * Dry-run by default (plan only). Requires files under cwd `uploads/`.
 *
 * From apps/api:
 *   pnpm run migrate:legacy-uploads -- --dry-run
 *   pnpm run migrate:legacy-uploads -- --apply
 *
 * Prefer inventory:legacy-uploads first. Do not set LEGACY_UPLOADS_STATIC=false
 * until apply succeeds and inventory total is 0.
 * See docs/audit/GO_SPOTS_UPLOAD_SECURITY.md Phase 1.
 */
import { PrismaClient } from '@prisma/client';
import { migrateLegacyUploadsToMedia } from '../src/common/legacy-uploads-migrate.util';

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const dryRunFlag = argv.includes('--dry-run');
  const dryRun = dryRunFlag || !apply;
  return { apply: apply && !dryRunFlag, dryRun };
}

async function main() {
  const { apply, dryRun } = parseArgs(process.argv.slice(2));
  const result = await migrateLegacyUploadsToMedia(prisma, {
    apply,
    dryRun,
  });

  console.log(
    JSON.stringify(
      {
        mode: result.dryRun ? 'dry-run' : 'apply',
        uploadsRoot: result.uploadsRoot,
        summary: result.summary,
        results: result.results.map((r) => {
          if (r.status === 'skipped') {
            return {
              status: r.status,
              target: r.row.target,
              id: r.row.id,
              path: r.row.path,
              reason: r.reason,
              detail: r.detail,
            };
          }
          return {
            status: r.status,
            target: r.row.target,
            id: r.row.id,
            path: r.row.path,
            mediaPath: r.mediaPath,
          };
        }),
      },
      null,
      2,
    ),
  );

  if (result.dryRun) {
    console.log(
      '\nDry-run only (no writes). Re-run with --apply when disk files exist under uploads/.',
    );
  } else {
    console.log(
      `\nMigrated ${result.summary.migrated} row(s); skipped ${result.summary.skipped}. ` +
        'Re-run inventory:legacy-uploads; when total=0 set LEGACY_UPLOADS_STATIC=false.',
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
