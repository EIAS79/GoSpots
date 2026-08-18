import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE10_UPGRADE: ${message}`);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const shopId = 'phase10_upgrade_fixture_shop';
  const membership = await prisma.membership.findFirst({
    where: { shopId, userId: 'phase10_upgrade_fixture_staff' },
  });
  assert(membership?.isActive, 'legacy staff membership was not preserved as active');

  const rate = await prisma.employeeRate.findFirst({
    where: { shopId, membershipId: membership.id },
  });
  assert(
    rate?.hourlyRateMinor === 4200 && rate.currency === 'PLN',
    'legacy employee rate was not preserved',
  );

  const schedule = await prisma.scheduleEntry.findFirst({
    where: {
      shopId,
      membershipId: membership.id,
      note: 'Representative pre-Phase-10 schedule',
    },
  });
  assert(schedule, 'legacy schedule was not preserved');
  assert(
    schedule.publishedAt == null &&
      schedule.absenceStatus == null &&
      schedule.absenceReason == null,
    'upgrade invented publish/absence state for a legacy planned shift',
  );

  const profile = await prisma.staffEmploymentProfile.findUnique({
    where: { shopId_membershipId: { shopId, membershipId: membership.id } },
  });
  assert(
    profile?.employeeNumber.startsWith('EMP-'),
    'legacy employee profile was not safely backfilled',
  );
  assert(
    profile.displayName === 'Phase 10 Upgrade Staff',
    'backfilled display name did not preserve employee identity',
  );

  const policy = await prisma.workforcePolicy.findUnique({ where: { shopId } });
  assert(policy && !policy.enforceSchedule, 'upgrade unexpectedly enabled schedule enforcement');
  assert(policy.pinLockoutAttempts === 5, 'safe PIN lockout default was not seeded');
  assert(!policy.clockInDeviceRequired, 'upgrade unexpectedly required a clock-in device');
  assert(
    policy.clockInAllowedDeviceIds.length === 0,
    'upgrade unexpectedly restricted clock-in devices',
  );
  assert(!policy.clockInLocationRequired, 'upgrade unexpectedly required location evidence');
  assert(
    policy.clockInLatitude == null && policy.clockInLongitude == null,
    'upgrade invented a venue geofence',
  );
  assert(policy.clockInRadiusMeters === 100, 'safe clock-in radius default was not seeded');

  const overlapTrigger = await prisma.$queryRaw<Array<{ trigger_name: string }>>`
    SELECT tgname AS trigger_name
    FROM pg_trigger
    WHERE tgname = 'ScheduleEntry_prevent_overlap'
      AND NOT tgisinternal
  `;
  assert(
    overlapTrigger.length === 1,
    'advanced schedule overlap trigger is missing after upgrade',
  );

  const rls = await prisma.$queryRaw<
    Array<{ tablename: string; rowsecurity: boolean; forcerowsecurity: boolean }>
  >`
    SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
    FROM pg_class c
    WHERE c.relname IN (
      'StaffEmploymentProfile','StaffOperatorCredential','StaffOperatorSession',
      'StaffApprovalPolicy','StaffApprovalRequestV2','StaffNotificationRule',
      'StaffActionEvidence','WorkforcePolicy','ShiftSwapRequest'
    )
  `;
  assert(rls.length === 9, 'not all Phase 10 tables exist after upgrade');
  assert(
    rls.every((row) => row.rowsecurity && row.forcerowsecurity),
    'Phase 10 RLS is not enabled and forced',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        shopId,
        legacyRatePreserved: true,
        legacySchedulePreserved: true,
        legacyScheduleStateSafe: true,
        profileBackfilled: true,
        safePolicyDefault: true,
        clockInRestrictionsDefaultOff: true,
        scheduleOverlapInvariant: true,
        scheduleTriggerUpgradeSafe: true,
        rlsForced: true,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});