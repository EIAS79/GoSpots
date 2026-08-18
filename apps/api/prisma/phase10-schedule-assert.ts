import { AuditService } from '../src/modules/audit/audit.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.types';
import { Phase10ScheduleService } from '../src/modules/workforce/phase10-schedule.service';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE10_SCHEDULE: ${message}`);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const audit = new AuditService(prisma);
  const schedules = new Phase10ScheduleService(prisma, audit);

  const shop = await prisma.shop.findFirst({
    where: { name: 'Phase 10 Pilot' },
    orderBy: { createdAt: 'desc' },
  });
  const otherShop = await prisma.shop.findFirst({
    where: { name: 'Phase 10 Other' },
    orderBy: { createdAt: 'desc' },
  });
  assert(shop && otherShop, 'operational pilot shops were not found');

  const [ownerMembership, staffMembership, otherOwnerMembership, role] = await Promise.all([
    prisma.membership.findFirst({
      where: { shopId: shop.id, role: 'OWNER', isActive: true },
      include: { user: true },
    }),
    prisma.membership.findFirst({
      where: { shopId: shop.id, role: 'STAFF', isActive: true },
      include: { user: true },
    }),
    prisma.membership.findFirst({
      where: { shopId: otherShop.id, role: 'OWNER', isActive: true },
      include: { user: true },
    }),
    prisma.jobRole.findFirst({ where: { shopId: shop.id, active: true } }),
  ]);
  assert(
    ownerMembership && staffMembership && otherOwnerMembership && role,
    'pilot schedule actors/role were not found',
  );

  const actor = (
    membership: typeof ownerMembership,
    shopId: string,
  ): JwtAccessPayload => ({
    sub: membership.userId,
    shopId,
    sysRole: 'USER',
    shopRole: 'OWNER',
    email: membership.user.email,
    perms: '*',
  });
  const owner = actor(ownerMembership, shop.id);
  const otherOwner = actor(otherOwnerMembership, otherShop.id);

  const start = new Date(Date.now() + 90 * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 8 * 3_600_000);
  const prefix = `p10-schedule-${Date.now()}`;

  const base = await prisma.scheduleEntry.create({
    data: {
      shopId: shop.id,
      membershipId: staffMembership.id,
      jobRoleId: role.id,
      startsAt: start,
      endsAt: end,
      note: `${prefix}-base`,
      createdById: owner.sub,
    },
  });

  let serviceConflict = false;
  try {
    await schedules.assertNoConflict({
      shopId: shop.id,
      membershipId: staffMembership.id,
      startsAt: new Date(start.getTime() + 60 * 60_000),
      endsAt: new Date(end.getTime() + 60 * 60_000),
    });
  } catch (error) {
    serviceConflict = /already has a planned shift/i.test(String(error));
  }
  assert(serviceConflict, 'service conflict guard accepted an overlapping planned shift');

  let databaseConflict = false;
  try {
    await prisma.scheduleEntry.create({
      data: {
        shopId: shop.id,
        membershipId: staffMembership.id,
        jobRoleId: role.id,
        startsAt: new Date(start.getTime() + 2 * 60 * 60_000),
        endsAt: new Date(end.getTime() + 2 * 60 * 60_000),
        note: `${prefix}-overlap`,
        createdById: owner.sub,
      },
    });
  } catch {
    databaseConflict = true;
  }
  assert(
    databaseConflict,
    'database overlap invariant accepted a racing/conflicting shift',
  );

  const adjacent = await prisma.scheduleEntry.create({
    data: {
      shopId: shop.id,
      membershipId: staffMembership.id,
      jobRoleId: role.id,
      startsAt: end,
      endsAt: new Date(end.getTime() + 4 * 3_600_000),
      note: `${prefix}-adjacent`,
      createdById: owner.sub,
    },
  });
  assert(adjacent.id, 'adjacent non-overlapping shift was rejected');

  const published = await schedules.publish(owner, base.id, { published: true });
  assert(published.publishedAt, 'publish action did not persist publishedAt');

  const absent = await schedules.markAbsence(owner, base.id, {
    status: 'EXCUSED',
    reason: 'Phase 10 acceptance proof',
  });
  assert(
    absent.absenceStatus === 'EXCUSED' &&
      absent.absenceReason === 'Phase 10 acceptance proof',
    'absence status/reason did not persist',
  );

  let crossTenantDenied = false;
  try {
    await schedules.publish(otherOwner, base.id, { published: false });
  } catch (error) {
    crossTenantDenied = /not found/i.test(String(error));
  }
  assert(crossTenantDenied, 'other-tenant owner could mutate this venue schedule');

  const list = await schedules.list(owner, 120);
  const listed = list.find((row) => row.id === base.id);
  assert(
    listed?.published && listed.absenceStatus === 'EXCUSED',
    'planned-shift projection did not expose publish/absence state',
  );

  const candidateAuditRows = await prisma.auditLog.findMany({
    where: {
      shopId: shop.id,
      action: { in: ['workforce.schedule.publish', 'workforce.schedule.absence'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const auditRows = candidateAuditRows.filter((row) => {
    const meta = row.meta as { scheduleEntryId?: string } | null;
    return meta?.scheduleEntryId === base.id;
  });
  assert(auditRows.length >= 2, 'publish/absence changes were not audited');

  console.log(
    JSON.stringify(
      {
        ok: true,
        plannedShift: true,
        roleVenueTime: true,
        publishState: true,
        serviceConflictGuard: true,
        databaseConflictInvariant: true,
        adjacentShiftAllowed: true,
        absenceState: true,
        crossTenantMutationDenied: true,
        auditEvidence: true,
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