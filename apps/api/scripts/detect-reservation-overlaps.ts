/**
 * Read-only: print overlapping active Reservation pairs.
 * Never deletes or updates.
 *
 * From apps/api:
 *   pnpm exec tsx scripts/detect-reservation-overlaps.ts
 *
 * Exit 1 if any overlap pair is found (useful for later CI gates).
 */
import { PrismaClient } from '@prisma/client';
import { listReservationOverlapPairs } from '../src/common/reservation-overlap-detect.util';

const prisma = new PrismaClient();

async function main() {
  const pairs = await listReservationOverlapPairs(prisma);
  if (pairs.length === 0) {
    console.log('OK: no overlapping active reservations.');
    process.exitCode = 0;
    return;
  }

  console.log(
    `FOUND ${pairs.length} overlap pair(s) (read-only; no changes made):\n`,
  );
  for (const p of pairs) {
    console.log(
      JSON.stringify(
        {
          shopId: p.shopId,
          resourceId: p.resourceId,
          a: {
            id: p.aId,
            status: p.aStatus,
            startsAt: p.aStartsAt,
            endsAt: p.aEndsAt,
          },
          b: {
            id: p.bId,
            status: p.bStatus,
            startsAt: p.bStartsAt,
            endsAt: p.bEndsAt,
          },
        },
        null,
        2,
      ),
    );
  }
  console.log(
    '\nResolve manually (cancel/reschedule). Do NOT auto-wipe. See docs/audit/GO_SPOTS_EXCLUSION_CONSTRAINT.md',
  );
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
