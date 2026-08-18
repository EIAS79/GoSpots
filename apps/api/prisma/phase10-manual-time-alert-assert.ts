import { AuditService } from '../src/modules/audit/audit.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.types';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationsSseHub } from '../src/modules/notifications/notifications-sse.hub';
import { Phase10AccountabilityService } from '../src/modules/workforce/phase10-accountability.service';
import { WorkforceService } from '../src/modules/workforce/workforce.service';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE10_MANUAL_TIME: ${message}`);
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
  const accountability = new Phase10AccountabilityService(
    prisma,
    audit,
    notifications,
  );
  const workforce = new WorkforceService(prisma, audit);

  const prefix = `p10manual_${Date.now()}`;
  const shopId = `${prefix}_shop`;
  const ownerId = `${prefix}_owner`;
  const managerId = `${prefix}_manager`;
  const staffId = `${prefix}_staff`;

  const owner: JwtAccessPayload = {
    sub: ownerId,
    shopId,
    sysRole: 'USER',
    shopRole: 'OWNER',
    email: `${prefix}.owner@gospots.invalid`,
    perms: '*',
  };
  const manager: JwtAccessPayload = {
    sub: managerId,
    shopId,
    sysRole: 'USER',
    shopRole: 'MANAGER',
    email: `${prefix}.manager@gospots.invalid`,
    perms: '*',
  };
  const staff: JwtAccessPayload = {
    sub: staffId,
    shopId,
    sysRole: 'USER',
    shopRole: 'STAFF',
    email: `${prefix}.staff@gospots.invalid`,
    perms: '*',
  };

  try {
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: owner.email,
          name: 'Phase 10 Manual Owner',
          passwordHash: 'x',
        },
        {
          id: managerId,
          email: manager.email,
          name: 'Phase 10 Manual Manager',
          passwordHash: 'x',
        },
        {
          id: staffId,
          email: staff.email,
          name: 'Phase 10 Manual Staff',
          passwordHash: 'x',
        },
      ],
    });
    await prisma.shop.create({
      data: {
        id: shopId,
        name: 'Phase 10 Manual Time',
        slug: prefix,
        dashboardKey: `${prefix}_key`,
        ownerId,
        timezone: 'Europe/Warsaw',
        currency: 'PLN',
      },
    });
    const ownerMembership = await prisma.membership.create({
      data: { shopId, userId: ownerId, role: 'OWNER', isActive: true },
    });
    const managerMembership = await prisma.membership.create({
      data: { shopId, userId: managerId, role: 'MANAGER', isActive: true },
    });
    const staffMembership = await prisma.membership.create({
      data: { shopId, userId: staffId, role: 'STAFF', isActive: true },
    });
    const role = await prisma.jobRole.create({
      data: { shopId, name: 'Counter', code: `${prefix}_COUNTER` },
    });
    const rate = await prisma.employeeRate.create({
      data: {
        shopId,
        membershipId: staffMembership.id,
        jobRoleId: role.id,
        hourlyRateMinor: 3000,
        currency: 'PLN',
        effectiveFrom: new Date(Date.now() - 2 * 86_400_000),
        createdById: ownerId,
      },
    });
    const originalStart = new Date(Date.now() - 9 * 60 * 60_000);
    const originalEnd = new Date(Date.now() - 60 * 60_000);
    const punch = await prisma.timePunch.create({
      data: {
        shopId,
        membershipId: staffMembership.id,
        jobRoleId: role.id,
        employeeRateId: rate.id,
        hourlyRateMinor: rate.hourlyRateMinor,
        currency: rate.currency,
        startedAt: originalStart,
        endedAt: originalEnd,
      },
    });

    const adjustment = await workforce.requestAdjustment(staff, {
      timePunchId: punch.id,
      proposedStartedAt: new Date(originalStart.getTime() - 15 * 60_000).toISOString(),
      reason: 'Forgot to clock in at scheduled start',
    });

    await accountability.updateApprovalPolicy(owner, {
      actionKind: 'MANUAL_TIME_EDIT',
      enabled: true,
      amountThresholdMinor: null,
      requirePassword: false,
      notifyOnUse: true,
    });
    const approval = await accountability.createApprovalRequest(
      manager,
      {
        actionKind: 'MANUAL_TIME_EDIT',
        sourceType: 'time-adjustment',
        sourceId: adjustment.id,
        reason: 'Manager verified employee time correction',
      },
      `${prefix}_time_request`,
    );
    const approved = await accountability.decideApprovalRequest(
      owner,
      approval.id,
      { approve: true, note: 'Source record verified' },
      undefined,
      `${prefix}_time_decision`,
    );
    assert(approved.status === 'APPROVED', 'owner approval did not persist');

    const prepared = await accountability.prepareAction(
      manager,
      { actionKind: 'MANUAL_TIME_EDIT', sourceType: 'time-adjustment' },
      undefined,
      approval.id,
    );
    assert(prepared?.approvalReserved, 'manual time approval was not reserved');
    const decided = await workforce.decideAdjustment(manager, adjustment.id, {
      approve: true,
      note: 'Approved after owner elevation',
    });
    assert(decided.status === 'APPROVED', 'canonical time adjustment was not approved');
    await accountability.finalizePreparedAction(prepared, adjustment.id, {
      workflow: 'manual-time-adjustment',
    });

    const consumed = await prisma.staffApprovalRequestV2.findUnique({
      where: { id: approval.id },
    });
    assert(consumed?.status === 'CONSUMED', 'manual-time approval was not consumed');
    const evidence = await prisma.staffActionEvidence.findFirst({
      where: {
        shopId,
        actionKind: 'MANUAL_TIME_EDIT',
        sourceId: adjustment.id,
      },
    });
    assert(
      evidence?.actorMembershipId === managerMembership.id,
      'manual time evidence did not attribute the manager',
    );
    assert(
      evidence.approverMembershipId === ownerMembership.id,
      'manual time evidence did not attribute the owner approver',
    );

    await accountability.updateNotificationRule(owner, {
      actionKind: 'REFUND',
      enabled: true,
      amountThresholdMinor: 1,
      repeatWindowMinutes: 60,
      repeatCountThreshold: 1,
      afterHoursStartHour: null,
      afterHoursEndHour: null,
    });
    const beforeAlerts = await prisma.notification.count({
      where: { shopId, title: 'Suspicious staff action: REFUND' },
    });
    for (const sourceId of [`${prefix}_alert_1`, `${prefix}_alert_2`]) {
      const refundPrepared = await accountability.prepareAction(
        owner,
        { actionKind: 'REFUND', sourceType: 'refund', amountMinor: 1000 },
      );
      await accountability.finalizePreparedAction(refundPrepared, sourceId, {
        workflow: 'alert-dedupe-proof',
      });
    }
    const afterAlerts = await prisma.notification.count({
      where: { shopId, title: 'Suspicious staff action: REFUND' },
    });
    assert(
      afterAlerts - beforeAlerts === 1,
      'two suspicious actions in one dedupe window created alert fatigue',
    );
    const refundEvidence = await prisma.staffActionEvidence.count({
      where: {
        shopId,
        actionKind: 'REFUND',
        sourceId: { in: [`${prefix}_alert_1`, `${prefix}_alert_2`] },
        suspicious: true,
      },
    });
    assert(
      refundEvidence === 2,
      'alert dedupe incorrectly removed immutable action evidence',
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          manualTimeEdit: true,
          managerAttribution: true,
          ownerApprovalAttribution: true,
          approvalConsumed: true,
          suspiciousEvidencePreserved: true,
          alertDedupe: true,
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
