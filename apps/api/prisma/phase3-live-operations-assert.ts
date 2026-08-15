import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Phase 3 live-operations assertion failed: ${message}`);
}

async function main() {
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('OperationsSession', 'customerId'),
        ('OperationsSession', 'membershipId'),
        ('OperationsSession', 'packageId'),
        ('OperationsSession', 'notes'),
        ('OperationsSession', 'billingSegmentStartedAt'),
        ('OperationsSession', 'accruedBeforeCurrentSegmentMinor'),
        ('OperationsSession', 'pauseBillingMode'),
        ('OperationsSession', 'managerOnlyPause'),
        ('OperationsSession', 'maxPauseMinutes'),
        ('OperationsSession', 'moveRatePolicy'),
        ('OperationsSession', 'scheduledEndAt'),
        ('OperationsSession', 'autoExtend'),
        ('OperationsSession', 'warningMinutes'),
        ('OperationsSessionPause', 'chargingContinues'),
        ('OperationsSessionPause', 'policyMaxMinutes'),
        ('ResourceMaintenancePeriod', 'expectedReturnAt'),
        ('ResourceMaintenancePeriod', 'notes'),
        ('OperationsWaitlistExtension', 'estimatedWaitMinutes'),
        ('OperationsWaitlistExtension', 'operationsSessionId'),
        ('OperationsSessionRateSegment', 'rateSnapshot')
      )
  `;
  invariant(columns.length === 20, `required columns found ${columns.length}/20`);

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'OperationsVenuePolicy',
        'OperationsSessionRateSegment',
        'OperationsWaitlistExtension'
      )
  `;
  invariant(tables.length === 3, `required Phase 3 tables found ${tables.length}/3`);

  const constraints = await prisma.$queryRaw<Array<{ conname: string; convalidated: boolean }>>`
    SELECT conname, convalidated
    FROM pg_constraint
    WHERE conname IN (
      'OperationsVenuePolicy_maxPauseMinutes_check',
      'OperationsVenuePolicy_defaultExtensionMinutes_check',
      'OperationsSession_pause_bounds_check',
      'OperationsSessionPause_policyMaxMinutes_check',
      'OperationsSessionRateSegment_accruedMinor_check',
      'OperationsWaitlistExtension_estimatedWaitMinutes_check'
    )
  `;
  invariant(constraints.length === 6, `required constraints found ${constraints.length}/6`);
  invariant(constraints.every((constraint) => constraint.convalidated), 'one or more Phase 3 constraints are not validated');

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'OperationsVenuePolicy_shopId_key',
        'OperationsSessionRateSegment_shopId_sessionId_startedAt_idx',
        'OperationsWaitlistExtension_waitlistEntryId_key',
        'ResourceMaintenancePeriod_shopId_expectedReturnAt_idx'
      )
  `;
  invariant(indexes.length === 4, `required Phase 3 indexes found ${indexes.length}/4`);

  const blankPauseReasons = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "OperationsSessionPause"
    WHERE "reason" IS NULL OR btrim("reason") = ''
  `;
  invariant(blankPauseReasons[0]?.count === 0n, 'blank pause reason survived migration');

  const invalidSessionBounds = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "OperationsSession"
    WHERE "totalPausedSeconds" < 0
       OR "billingSegmentPausedSeconds" < 0
       OR "accruedBeforeCurrentSegmentMinor" < 0
       OR "extensionMinutes" <= 0
       OR "extensionCount" < 0
  `;
  invariant(invalidSessionBounds[0]?.count === 0n, 'invalid Phase 3 session bounds exist');

  const missingRateHistory = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "OperationsSession" s
    WHERE NOT EXISTS (
      SELECT 1 FROM "OperationsSessionRateSegment" seg
      WHERE seg."sessionId" = s."id" AND seg."shopId" = s."shopId"
    )
  `;
  invariant(missingRateHistory[0]?.count === 0n, 'operations session without immutable rate history exists');

  const orphanRateSegments = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "OperationsSessionRateSegment" seg
    LEFT JOIN "OperationsSession" s ON s."id" = seg."sessionId"
    WHERE s."id" IS NULL OR s."shopId" <> seg."shopId"
  `;
  invariant(orphanRateSegments[0]?.count === 0n, 'orphan or cross-tenant rate segment exists');

  const orphanWaitlistExtensions = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "OperationsWaitlistExtension" ext
    LEFT JOIN "ReservationWaitlistEntry" w ON w."id" = ext."waitlistEntryId"
    WHERE w."id" IS NULL OR w."shopId" <> ext."shopId"
  `;
  invariant(orphanWaitlistExtensions[0]?.count === 0n, 'orphan or cross-tenant waitlist extension exists');

  const duplicateOccupancy = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM (
      SELECT "shopId", "resourceId"
      FROM "OperationsSession"
      WHERE "status" IN ('ACTIVE', 'PAUSED')
      GROUP BY "shopId", "resourceId"
      HAVING COUNT(*) > 1
    ) duplicate
  `;
  invariant(duplicateOccupancy[0]?.count === 0n, 'duplicate live resource occupancy exists');

  const invalidPolicies = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "OperationsVenuePolicy"
    WHERE "version" < 1
       OR ("maxPauseMinutes" IS NOT NULL AND "maxPauseMinutes" <= 0)
       OR "defaultExtensionMinutes" <= 0
  `;
  invariant(invalidPolicies[0]?.count === 0n, 'invalid live-operations policy exists');

  console.log('Phase 3 live-operations schema, history, tenancy and occupancy invariants passed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
