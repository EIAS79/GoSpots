import { AuditService } from '../src/modules/audit/audit.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationsSseHub } from '../src/modules/notifications/notifications-sse.hub';
import { Phase10AccountabilityService } from '../src/modules/workforce/phase10-accountability.service';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE10_PILOT: ${message}`);
}

function fulfilled(rows: PromiseSettledResult<unknown>[]) {
  return rows.filter((row) => row.status === 'fulfilled').length;
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
  const phase10 = new Phase10AccountabilityService(
    prisma,
    audit,
    notifications,
  );

  const prefix = `p10pilot_${Date.now()}`;
  const shopId = `${prefix}_shop`;
  const otherShopId = `${prefix}_other_shop`;
  const ownerId = `${prefix}_owner`;
  const managerId = `${prefix}_manager`;
  const staffId = `${prefix}_staff`;
  const otherOwnerId = `${prefix}_other_owner`;
  const ownerEmail = `${prefix}.owner@gospots.invalid`;
  const managerEmail = `${prefix}.manager@gospots.invalid`;
  const staffEmail = `${prefix}.staff@gospots.invalid`;
  const otherOwnerEmail = `${prefix}.other@gospots.invalid`;

  const owner: JwtAccessPayload = {
    sub: ownerId,
    shopId,
    sysRole: 'USER',
    shopRole: 'OWNER',
    email: ownerEmail,
    perms: '*',
  };
  const manager: JwtAccessPayload = {
    sub: managerId,
    shopId,
    sysRole: 'USER',
    shopRole: 'MANAGER',
    email: managerEmail,
    perms: '*',
  };
  const staff: JwtAccessPayload = {
    sub: staffId,
    shopId,
    sysRole: 'USER',
    shopRole: 'STAFF',
    email: staffEmail,
    perms: '*',
  };

  try {
    for (const [id, email, name] of [
      [ownerId, ownerEmail, 'Phase 10 Owner'],
      [managerId, managerEmail, 'Phase 10 Manager'],
      [staffId, staffEmail, 'Phase 10 Staff'],
      [otherOwnerId, otherOwnerEmail, 'Phase 10 Other Owner'],
    ] as const) {
      await prisma.user.create({
        data: { id, email, name, passwordHash: 'x' },
      });
    }

    await prisma.shop.create({
      data: {
        id: shopId,
        name: 'Phase 10 Pilot',
        slug: prefix,
        dashboardKey: `${prefix}_key`,
        ownerId,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
    });
    await prisma.shop.create({
      data: {
        id: otherShopId,
        name: 'Phase 10 Other',
        slug: `${prefix}_other`,
        dashboardKey: `${prefix}_other_key`,
        ownerId: otherOwnerId,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
    });

    await prisma.membership.create({
      data: { shopId, userId: ownerId, role: 'OWNER', isActive: true },
    });
    const managerMembership = await prisma.membership.create({
      data: { shopId, userId: managerId, role: 'MANAGER', isActive: true },
    });
    const staffMembership = await prisma.membership.create({
      data: { shopId, userId: staffId, role: 'STAFF', isActive: true },
    });
    const otherMembership = await prisma.membership.create({
      data: {
        shopId: otherShopId,
        userId: otherOwnerId,
        role: 'OWNER',
        isActive: true,
      },
    });

    const role = await prisma.jobRole.create({
      data: { shopId, name: 'Counter', code: `${prefix}_COUNTER` },
    });
    await prisma.employeeRate.create({
      data: {
        shopId,
        membershipId: staffMembership.id,
        jobRoleId: role.id,
        hourlyRateMinor: 3500,
        currency: 'PLN',
        effectiveFrom: new Date(Date.now() - 86_400_000),
        createdById: ownerId,
      },
    });
    await phase10.updateProfile(owner, staffMembership.id, {
      displayName: 'Counter Staff',
      employeeNumber: 'EMP-P10-1',
      primaryJobRoleId: role.id,
      managerMembershipId: managerMembership.id,
    });
    const ownerProfiles = await phase10.listProfiles(owner);
    const staffProfile = ownerProfiles.find(
      (row) => row.membershipId === staffMembership.id,
    );
    assert(
      staffProfile?.hourlyCost?.minor === 3500,
      'owner could not see effective hourly cost',
    );
    const staffProfiles = await phase10.listProfiles(staff);
    assert(
      staffProfiles.find((row) => row.membershipId === staffMembership.id)
        ?.hourlyCost === null,
      'non-owner could see hourly cost',
    );

    await phase10.updateWorkforcePolicy(owner, {
      pinLockoutAttempts: 3,
      pinLockoutMinutes: 1,
      operatorSessionMinutes: 5,
    });
    await phase10.setOperatorCredential(owner, {
      membershipId: staffMembership.id,
      pin: '2468',
      active: true,
    });
    for (let i = 0; i < 2; i += 1) {
      let wrong = false;
      try {
        await phase10.switchOperator(owner, {
          membershipId: staffMembership.id,
          pin: '1111',
        });
      } catch (error) {
        wrong = String(error).includes('incorrect');
      }
      assert(wrong, `wrong PIN attempt ${i + 1} was not rejected`);
    }
    let locked = false;
    try {
      await phase10.switchOperator(owner, {
        membershipId: staffMembership.id,
        pin: '1111',
      });
    } catch (error) {
      locked = String(error).toLowerCase().includes('locked');
    }
    assert(locked, 'PIN lockout did not trigger');
    const lockedRow = await prisma.staffOperatorCredential.findUnique({
      where: {
        shopId_membershipId: {
          shopId,
          membershipId: staffMembership.id,
        },
      },
    });
    assert(
      lockedRow?.lockedUntil && lockedRow.lockedUntil > new Date(),
      'PIN lockout was not persisted',
    );

    await phase10.setOperatorCredential(owner, {
      membershipId: staffMembership.id,
      pin: '2468',
      active: true,
    });
    const switched = await phase10.switchOperator(owner, {
      membershipId: staffMembership.id,
      pin: '2468',
      workstation: 'counter-1',
    });
    assert(
      switched.operator.membershipId === staffMembership.id,
      'quick switch selected wrong employee',
    );
    const tokenHashRows = await prisma.staffOperatorSession.findMany({
      where: { shopId },
    });
    assert(
      tokenHashRows.every((row) => row.tokenHash !== switched.operatorToken),
      'raw operator token was persisted',
    );

    let crossTenantBlocked = false;
    try {
      await phase10.setOperatorCredential(owner, {
        membershipId: otherMembership.id,
        pin: '2468',
      });
    } catch (error) {
      crossTenantBlocked = String(error).includes('not found');
    }
    assert(
      crossTenantBlocked,
      'cross-tenant operator credential assignment was accepted',
    );

    await phase10.updateApprovalPolicy(owner, {
      actionKind: 'REFUND',
      enabled: true,
      amountThresholdMinor: 1000,
      requirePassword: false,
      notifyOnUse: true,
    });
    const deniedRequest = await phase10.createApprovalRequest(
      staff,
      {
        actionKind: 'REFUND',
        sourceType: 'refund',
        sourceId: `${prefix}_denied`,
        amountMinor: 5000,
        reason: 'Customer dispute',
      },
      `${prefix}_deny_request`,
    );
    const denied = await phase10.decideApprovalRequest(
      manager,
      deniedRequest.id,
      { approve: false, note: 'Insufficient evidence' },
      undefined,
      `${prefix}_deny_decision`,
    );
    assert(denied.status === 'DENIED', 'approval denial was not persisted');

    let deniedCannotExecute = false;
    try {
      await phase10.prepareAction(
        staff,
        { actionKind: 'REFUND', sourceType: 'refund', amountMinor: 5000 },
        undefined,
        deniedRequest.id,
      );
    } catch (error) {
      deniedCannotExecute = String(error).includes('Approved');
    }
    assert(
      deniedCannotExecute,
      'denied approval could authorize an action',
    );

    const approvedRequest = await phase10.createApprovalRequest(
      staff,
      {
        actionKind: 'REFUND',
        sourceType: 'refund',
        sourceId: `${prefix}_approved`,
        amountMinor: 5000,
        reason: 'Documented customer refund',
      },
      `${prefix}_approve_request`,
    );
    await phase10.decideApprovalRequest(
      manager,
      approvedRequest.id,
      { approve: true, note: 'Verified' },
      undefined,
      `${prefix}_approve_decision`,
    );

    const reservations = await Promise.allSettled([
      phase10.prepareAction(
        staff,
        { actionKind: 'REFUND', sourceType: 'refund', amountMinor: 5000 },
        undefined,
        approvedRequest.id,
      ),
      phase10.prepareAction(
        staff,
        { actionKind: 'REFUND', sourceType: 'refund', amountMinor: 5000 },
        undefined,
        approvedRequest.id,
      ),
    ]);
    assert(
      fulfilled(reservations) === 1,
      'one approval could be concurrently reserved twice',
    );
    const prepared = reservations.find(
      (
        row,
      ): row is PromiseFulfilledResult<
        Awaited<ReturnType<typeof phase10.prepareAction>>
      > => row.status === 'fulfilled',
    )?.value;
    assert(prepared, 'approved action did not reserve');

    await phase10.updateNotificationRule(owner, {
      actionKind: 'REFUND',
      enabled: true,
      amountThresholdMinor: 1000,
      repeatWindowMinutes: 60,
      repeatCountThreshold: 3,
      afterHoursStartHour: null,
      afterHoursEndHour: null,
    });
    await phase10.finalizePreparedAction(
      prepared,
      `${prefix}_refund_result`,
      { pilot: true },
    );
    const consumed = await prisma.staffApprovalRequestV2.findUnique({
      where: { id: approvedRequest.id },
    });
    assert(
      consumed?.status === 'CONSUMED' && consumed.consumedAt,
      'approval was not consumed once',
    );
    const evidence = await prisma.staffActionEvidence.findFirst({
      where: { shopId, sourceId: `${prefix}_refund_result` },
    });
    assert(
      evidence?.actorMembershipId === staffMembership.id &&
        evidence.approverMembershipId === managerMembership.id,
      'staff/approver attribution evidence is wrong',
    );
    assert(evidence.suspicious, 'threshold refund was not marked suspicious');
    const notification = await prisma.notification.findFirst({
      where: {
        shopId,
        title: { contains: 'Suspicious staff action' },
      },
    });
    assert(
      notification,
      'suspicious action did not create an owner/team notification',
    );

    let consumedReuseBlocked = false;
    try {
      await phase10.prepareAction(
        staff,
        { actionKind: 'REFUND', sourceType: 'refund', amountMinor: 5000 },
        undefined,
        approvedRequest.id,
      );
    } catch {
      consumedReuseBlocked = true;
    }
    assert(consumedReuseBlocked, 'consumed approval was reusable');

    let highRiskIdentityBlocked = false;
    try {
      await phase10.prepareAction(
        owner,
        { actionKind: 'REFUND', sourceType: 'refund', amountMinor: 5000 },
        switched.operatorToken,
      );
    } catch (error) {
      highRiskIdentityBlocked = String(error).includes('full authentication');
    }
    assert(
      highRiskIdentityBlocked,
      'PIN-switched operator could perform high-risk action under owner JWT',
    );

    await phase10.updateWorkforcePolicy(owner, {
      enforceSchedule: true,
      earlyClockInMinutes: 15,
      lateGraceMinutes: 5,
    });
    let offScheduleBlocked = false;
    try {
      await phase10.assertClockInAllowed(staff);
    } catch (error) {
      offScheduleBlocked = String(error).includes('schedule window');
    }
    assert(
      offScheduleBlocked,
      'schedule enforcement allowed unscheduled clock-in',
    );

    const now = new Date();
    const staffShift = await prisma.scheduleEntry.create({
      data: {
        shopId,
        membershipId: staffMembership.id,
        jobRoleId: role.id,
        startsAt: new Date(now.getTime() - 5 * 60_000),
        endsAt: new Date(now.getTime() + 8 * 60 * 60_000),
        createdById: ownerId,
      },
    });
    await phase10.assertClockInAllowed(staff);

    const futureShift = await prisma.scheduleEntry.create({
      data: {
        shopId,
        membershipId: staffMembership.id,
        jobRoleId: role.id,
        startsAt: new Date(now.getTime() + 48 * 60 * 60_000),
        endsAt: new Date(now.getTime() + 56 * 60 * 60_000),
        createdById: ownerId,
      },
    });
    const swap = await phase10.createShiftSwap(staff, {
      scheduleEntryId: futureShift.id,
      targetMembershipId: managerMembership.id,
      reason: 'Training coverage',
    });
    const approvedSwap = await phase10.decideShiftSwap(manager, swap.id, {
      approve: true,
      note: 'Coverage confirmed',
    });
    assert(
      approvedSwap.status === 'APPROVED',
      'shift swap was not approved',
    );
    assert(
      (
        await prisma.scheduleEntry.findUnique({
          where: { id: futureShift.id },
        })
      )?.membershipId === managerMembership.id,
      'approved shift swap did not reassign the schedule',
    );

    const rate = await prisma.employeeRate.findFirstOrThrow({
      where: { shopId, membershipId: staffMembership.id },
    });
    await prisma.timePunch.create({
      data: {
        shopId,
        membershipId: staffMembership.id,
        scheduleEntryId: staffShift.id,
        jobRoleId: role.id,
        employeeRateId: rate.id,
        hourlyRateMinor: 3500,
        currency: 'PLN',
        startedAt: new Date(now.getTime() + 10 * 60_000),
        endedAt: new Date(now.getTime() + 8 * 60 * 60_000),
      },
    });
    const metrics = await phase10.performance(owner, 30);
    const staffMetrics = metrics.find(
      (row) => row.membershipId === staffMembership.id,
    );
    assert(
      staffMetrics && staffMetrics.lateCount >= 1,
      'lateness was not visible in performance metrics',
    );
    assert(
      staffMetrics.breakComplianceViolations >= 1,
      'break compliance violation was not visible',
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          shopId,
          wrongPinLockout: true,
          branchIsolation: true,
          approvalDenied: true,
          approvalSingleUse: true,
          suspiciousNotification: true,
          staffAttribution: true,
          highRiskIdentityBoundary: true,
          scheduleEnforcement: true,
          shiftSwap: true,
          performanceVisibility: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
