import { AuditService } from '../src/modules/audit/audit.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.types';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationsSseHub } from '../src/modules/notifications/notifications-sse.hub';
import { Phase10AccountabilityService } from '../src/modules/workforce/phase10-accountability.service';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE10_PERMISSIONS: ${message}`);
}

async function expectDenied(work: () => Promise<unknown>, pattern: RegExp) {
  try {
    await work();
    return false;
  } catch (error) {
    return pattern.test(String(error));
  }
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(
    prisma,
    audit,
    new NotificationsSseHub(),
  );
  const phase10 = new Phase10AccountabilityService(prisma, audit, notifications);

  const shop = await prisma.shop.findFirst({
    where: { name: 'Phase 10 Pilot' },
    orderBy: { createdAt: 'desc' },
  });
  assert(shop, 'operational pilot shop was not found');

  const memberships = await prisma.membership.findMany({
    where: { shopId: shop.id },
    include: { user: true },
  });
  const ownerMembership = memberships.find((row) => row.role === 'OWNER');
  const managerMembership = memberships.find((row) => row.role === 'MANAGER');
  const staffMembership = memberships.find((row) => row.role === 'STAFF');
  assert(ownerMembership && managerMembership && staffMembership, 'pilot role matrix is incomplete');

  const actor = (
    membership: typeof ownerMembership,
    shopRole: string,
    perms: string,
  ): JwtAccessPayload => ({
    sub: membership.userId,
    shopId: shop.id,
    sysRole: 'USER',
    shopRole,
    email: membership.user.email,
    perms,
  });

  const owner = actor(ownerMembership, 'OWNER', '*');
  const manager = actor(managerMembership, 'MANAGER', 'staff.read,staff.write');
  const staffNoPermission = actor(staffMembership, 'STAFF', '');
  const staffRead = actor(staffMembership, 'STAFF', 'staff.read');
  const staffWrite = actor(staffMembership, 'STAFF', 'staff.write');

  const ownerRead = await phase10.listProfiles(owner);
  const managerRead = await phase10.listProfiles(manager);
  const staffReadRows = await phase10.listProfiles(staffRead);
  assert(ownerRead.length > 0 && managerRead.length > 0 && staffReadRows.length > 0, 'authorized role/read matrix failed');

  assert(
    await expectDenied(
      () => phase10.listProfiles(staffNoPermission),
      /staff\.read|report\.read|permission/i,
    ),
    'staff without read permission could read workforce profiles',
  );

  await phase10.updateWorkforcePolicy(manager, { lateGraceMinutes: 7 });
  await phase10.updateWorkforcePolicy(staffWrite, { lateGraceMinutes: 8 });
  assert(
    await expectDenied(
      () => phase10.updateWorkforcePolicy(staffRead, { lateGraceMinutes: 9 }),
      /staff management permission/i,
    ),
    'read-only staff escalated into workforce policy writes',
  );

  assert(
    await expectDenied(
      () =>
        phase10.updateNotificationRule(manager, {
          actionKind: 'REFUND',
          enabled: false,
        }),
      /only the venue owner/i,
    ),
    'manager escalated into owner-only suspicious-action controls',
  );

  await phase10.updateProfile(owner, staffMembership.id, { active: false });
  const inactive = await prisma.membership.findUnique({
    where: { id: staffMembership.id },
  });
  assert(inactive && !inactive.isActive, 'staff deactivation did not persist');

  assert(
    await expectDenied(
      () =>
        phase10.createApprovalRequest(
          staffWrite,
          {
            actionKind: 'REFUND',
            sourceType: 'refund',
            amountMinor: 1000,
            reason: 'Inactive employee must fail',
          },
          `p10-inactive-${Date.now()}`,
        ),
      /active venue membership/i,
    ),
    'inactive employee retained Phase 10 mutation access',
  );

  assert(
    await expectDenied(
      () =>
        phase10.switchOperator(owner, {
          membershipId: staffMembership.id,
          pin: '2468',
        }),
      /unavailable|inactive/i,
    ),
    'inactive employee could be selected by quick operator switch',
  );

  await phase10.updateProfile(owner, staffMembership.id, { active: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        roleMatrix: true,
        permissionEscalationDenied: true,
        ownerOnlyControlProtected: true,
        inactiveEmployeeDenied: true,
        employeeReactivatedForLaterAcceptance: true,
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