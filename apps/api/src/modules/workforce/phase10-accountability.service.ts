import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import {
  hashIdempotencyRequest,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { hashPassword, verifyPassword } from '../../common/security/password';
import {
  assertUserPassword,
  requireConfirmPassword,
} from '../../common/security/verify-password.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CreateApprovalRequestV2Dto,
  CreateShiftSwapRequestDto,
  DecideApprovalRequestV2Dto,
  DecideShiftSwapRequestDto,
  SetOperatorCredentialDto,
  SwitchOperatorDto,
  UpdateApprovalPolicyDto,
  UpdateStaffEmploymentProfileDto,
  UpdateStaffNotificationRuleDto,
  UpdateWorkforcePolicyDto,
} from './dto/phase10-accountability.dto';
import {
  assertOperatorPinFormat,
  assertPhase10ActionKind,
  breakCompliance,
  computeSuspiciousReasons,
  HIGH_RISK_ACTION_KINDS,
  overtimeSeconds,
  PHASE10_ACTION_KINDS,
  scheduleStatus,
  type AccountableActionClassification,
} from './phase10.rules';

const APPROVAL_TTL_MS = 15 * 60_000;
const DEFAULT_POLICY = {
  enforceSchedule: false,
  earlyClockInMinutes: 15,
  lateGraceMinutes: 5,
  overtimeWeeklySeconds: 40 * 60 * 60,
  minimumBreakAfterSeconds: 6 * 60 * 60,
  minimumBreakSeconds: 30 * 60,
  operatorSessionMinutes: 15,
  pinLockoutAttempts: 5,
  pinLockoutMinutes: 15,
} as const;

export type PreparedStaffAction = {
  shopId: string;
  authenticatedUserId: string;
  actorMembershipId: string;
  authStrength: 'SESSION' | 'PIN' | 'BADGE';
  classification: AccountableActionClassification;
  approvalRequestId?: string;
  approverMembershipId?: string;
  approvalReserved: boolean;
};

type OperatorSwitchTxResult =
  | { outcome: 'UNAVAILABLE' }
  | { outcome: 'LOCKED' }
  | { outcome: 'INVALID'; locked: boolean }
  | {
      outcome: 'SUCCESS';
      rawToken: string;
      expiresAt: Date;
      authStrength: 'PIN' | 'BADGE';
    };

@Injectable()
export class Phase10AccountabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertOwner(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER') return;
    throw new ForbiddenException('Only the venue owner can change this control.');
  }

  private assertManage(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER') return;
    const perms = actor.perms ?? '';
    if (
      hasPermission(perms, PERMISSIONS.STAFF_WRITE) ||
      hasPermission(perms, PERMISSIONS.SHOP_MANAGE)
    ) {
      return;
    }
    throw new ForbiddenException('Missing staff management permission.');
  }

  private assertRead(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER' || actor.shopRole === 'MANAGER') return;
    const perms = actor.perms ?? '';
    if (
      hasPermission(perms, PERMISSIONS.STAFF_READ) ||
      hasPermission(perms, PERMISSIONS.REPORT_READ)
    ) {
      return;
    }
    throw new ForbiddenException('Missing staff.read or report.read permission.');
  }

  private async actorMembership(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const membership = await this.prisma.membership.findFirst({
      where: { shopId, userId: actor.sub },
      select: { id: true, userId: true, role: true, isActive: true },
    });
    if (!membership?.isActive) {
      throw new ForbiddenException('Active venue membership is required.');
    }
    return membership;
  }

  private async membershipInShop(shopId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, shopId },
      select: {
        id: true,
        shopId: true,
        userId: true,
        role: true,
        isActive: true,
        user: { select: { name: true, email: true, staffHandle: true } },
      },
    });
    if (!membership) {
      throw new NotFoundException('Staff membership not found in this venue.');
    }
    return membership;
  }

  private async workforcePolicy(shopId: string, updatedById?: string) {
    const current = await this.prisma.workforcePolicy.findUnique({
      where: { shopId },
    });
    if (current) return current;
    return this.prisma.workforcePolicy.create({
      data: {
        shopId,
        updatedById: updatedById ?? 'system',
        ...DEFAULT_POLICY,
      },
    });
  }

  async listProfiles(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const canViewHourlyCost = actor.shopRole === 'OWNER';
    const memberships = await this.prisma.membership.findMany({
      where: { shopId, role: { not: 'OWNER' } },
      include: {
        user: {
          select: { id: true, name: true, email: true, staffHandle: true },
        },
        permissionRows: { select: { permission: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const profiles = await this.prisma.staffEmploymentProfile.findMany({
      where: { shopId },
    });
    const byMembership = new Map(
      profiles.map((row) => [row.membershipId, row]),
    );
    const now = new Date();

    return Promise.all(
      memberships.map(async (membership) => {
        const profile = byMembership.get(membership.id) ?? null;
        const rate = await this.prisma.employeeRate.findFirst({
          where: {
            shopId,
            membershipId: membership.id,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: { effectiveFrom: 'desc' },
        });
        const assignedBranches = await this.branchAssignmentsFor(
          actor,
          membership.userId,
          shopId,
        );
        return {
          membershipId: membership.id,
          userId: membership.userId,
          displayName:
            profile?.displayName ??
            membership.user.name ??
            membership.user.staffHandle ??
            membership.user.email,
          employeeNumber:
            profile?.employeeNumber ??
            this.defaultEmployeeNumber(shopId, membership.id),
          jobRoleId: profile?.primaryJobRoleId ?? rate?.jobRoleId ?? null,
          permissionRole: membership.role,
          permissions: membership.permissionRows.map((row) => row.permission),
          hourlyCost:
            canViewHourlyCost && rate
              ? {
                  minor: rate.hourlyRateMinor,
                  currency: rate.currency,
                  effectiveFrom: rate.effectiveFrom,
                }
              : null,
          active: membership.isActive,
          managerMembershipId: profile?.managerMembershipId ?? null,
          assignedBranches,
        };
      }),
    );
  }

  async updateProfile(
    actor: JwtAccessPayload,
    membershipId: string,
    dto: UpdateStaffEmploymentProfileDto,
  ) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    const target = await this.membershipInShop(shopId, membershipId);
    if (target.role === 'OWNER') {
      throw new ForbiddenException('Owner identity is not an employee profile.');
    }
    if (dto.primaryJobRoleId) {
      const role = await this.prisma.jobRole.findFirst({
        where: { id: dto.primaryJobRoleId, shopId, active: true },
      });
      if (!role) {
        throw new BadRequestException('Job role does not belong to this venue.');
      }
    }
    if (dto.managerMembershipId) {
      if (dto.managerMembershipId === membershipId) {
        throw new BadRequestException(
          'Employee cannot manage their own employment profile.',
        );
      }
      const manager = await this.membershipInShop(
        shopId,
        dto.managerMembershipId,
      );
      if (!manager.isActive) {
        throw new BadRequestException('Manager membership is inactive.');
      }
    }

    const employeeNumber =
      dto.employeeNumber?.trim().toUpperCase() ||
      this.defaultEmployeeNumber(shopId, membershipId);
    const profile = await this.prisma.$transaction(async (tx) => {
      const row = await tx.staffEmploymentProfile.upsert({
        where: { shopId_membershipId: { shopId, membershipId } },
        create: {
          shopId,
          membershipId,
          employeeNumber,
          displayName: dto.displayName?.trim() || null,
          primaryJobRoleId: dto.primaryJobRoleId || null,
          managerMembershipId: dto.managerMembershipId || null,
          createdById: actor.sub,
          updatedById: actor.sub,
        },
        update: {
          ...(dto.employeeNumber !== undefined ? { employeeNumber } : {}),
          ...(dto.displayName !== undefined
            ? { displayName: dto.displayName.trim() || null }
            : {}),
          ...(dto.primaryJobRoleId !== undefined
            ? { primaryJobRoleId: dto.primaryJobRoleId || null }
            : {}),
          ...(dto.managerMembershipId !== undefined
            ? { managerMembershipId: dto.managerMembershipId || null }
            : {}),
          updatedById: actor.sub,
        },
      });
      if (dto.active !== undefined) {
        await tx.membership.update({
          where: { id: membershipId },
          data: { isActive: dto.active },
        });
        if (!dto.active) {
          await tx.staffOperatorCredential.updateMany({
            where: { shopId, membershipId },
            data: { active: false, updatedById: actor.sub },
          });
          await tx.staffOperatorSession.updateMany({
            where: { shopId, membershipId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
      return row;
    });

    await this.audit.record(actor, {
      section: 'team',
      action: 'workforce.staff_profile.update',
      summary: `Updated employee ${employeeNumber}`,
      meta: { membershipId, active: dto.active },
    });
    return { ...profile, active: dto.active ?? target.isActive };
  }

  private defaultEmployeeNumber(shopId: string, membershipId: string) {
    return `EMP-${createHash('sha256')
      .update(`${shopId}:${membershipId}`)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase()}`;
  }

  private async branchAssignmentsFor(
    actor: JwtAccessPayload,
    userId: string,
    currentShopId: string,
  ) {
    let shopIds = [currentShopId];
    if (actor.shopRole === 'OWNER') {
      const currentOrg = await this.prisma.organizationShop.findUnique({
        where: { shopId: currentShopId },
      });
      if (currentOrg) {
        const rows = await this.prisma.organizationShop.findMany({
          where: { organizationId: currentOrg.organizationId },
          select: { shopId: true },
        });
        shopIds = rows.map((row) => row.shopId);
      }
    }
    const memberships = await this.prisma.membership.findMany({
      where: { userId, shopId: { in: shopIds } },
      select: {
        shopId: true,
        role: true,
        isActive: true,
        shop: { select: { name: true, branchCode: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((row) => ({
      shopId: row.shopId,
      name: row.shop.name,
      branchCode: row.shop.branchCode,
      role: row.role,
      active: row.isActive,
    }));
  }

  async setOperatorCredential(
    actor: JwtAccessPayload,
    dto: SetOperatorCredentialDto,
  ) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    const membership = await this.membershipInShop(shopId, dto.membershipId);
    if (!membership.isActive && dto.active !== false) {
      throw new BadRequestException(
        'Cannot enable quick switch for an inactive employee.',
      );
    }
    const pin = assertOperatorPinFormat(dto.pin);
    const pinHash = await hashPassword(pin);
    const badgeHash = dto.badge ? this.hashSecret(dto.badge.trim()) : null;
    const row = await this.prisma.staffOperatorCredential.upsert({
      where: {
        shopId_membershipId: { shopId, membershipId: dto.membershipId },
      },
      create: {
        shopId,
        membershipId: dto.membershipId,
        pinHash,
        badgeHash,
        active: dto.active ?? true,
        createdById: actor.sub,
        updatedById: actor.sub,
      },
      update: {
        pinHash,
        badgeHash,
        active: dto.active ?? true,
        failedAttempts: 0,
        lockedUntil: null,
        rotatedAt: new Date(),
        updatedById: actor.sub,
      },
    });
    await this.prisma.staffOperatorSession.updateMany({
      where: { shopId, membershipId: dto.membershipId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: 'workforce.operator_credential.rotate',
      summary: `Rotated quick-switch credential for ${membership.user.name ?? membership.user.email}`,
      meta: {
        membershipId: dto.membershipId,
        badgeConfigured: Boolean(badgeHash),
        active: row.active,
      },
    });
    return {
      membershipId: row.membershipId,
      active: row.active,
      badgeConfigured: Boolean(row.badgeHash),
      rotatedAt: row.rotatedAt,
    };
  }

  async switchOperator(actor: JwtAccessPayload, dto: SwitchOperatorDto) {
    const shopId = requireShopId(actor);
    const target = await this.membershipInShop(shopId, dto.membershipId);
    if (!target.isActive) {
      throw new ForbiddenException('Employee is inactive.');
    }
    if (!dto.pin && !dto.badge) {
      throw new BadRequestException('PIN or badge is required.');
    }
    if (dto.pin) assertOperatorPinFormat(dto.pin);
    const policy = await this.workforcePolicy(shopId, actor.sub);
    const lockKey = `phase10:operator:${shopId}:${dto.membershipId}`;

    const result = await this.prisma.$transaction<OperatorSwitchTxResult>(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
        );
        const credential = await tx.staffOperatorCredential.findUnique({
          where: {
            shopId_membershipId: { shopId, membershipId: dto.membershipId },
          },
        });
        if (!credential?.active) return { outcome: 'UNAVAILABLE' };
        const now = new Date();
        if (credential.lockedUntil && credential.lockedUntil > now) {
          return { outcome: 'LOCKED' };
        }

        const usingBadge = Boolean(dto.badge);
        const valid = usingBadge
          ? Boolean(
              credential.badgeHash &&
                this.hashSecret(dto.badge!.trim()) === credential.badgeHash,
            )
          : await verifyPassword(credential.pinHash, dto.pin!);
        if (!valid) {
          const nextAttempts = credential.failedAttempts + 1;
          const shouldLock = nextAttempts >= policy.pinLockoutAttempts;
          await tx.staffOperatorCredential.update({
            where: { id: credential.id },
            data: {
              failedAttempts: shouldLock ? 0 : nextAttempts,
              lockedUntil: shouldLock
                ? new Date(
                    now.getTime() + policy.pinLockoutMinutes * 60_000,
                  )
                : null,
            },
          });
          return { outcome: 'INVALID', locked: shouldLock };
        }

        await tx.staffOperatorCredential.update({
          where: { id: credential.id },
          data: { failedAttempts: 0, lockedUntil: null },
        });
        const rawToken = randomBytes(32).toString('base64url');
        const expiresAt = new Date(
          now.getTime() + policy.operatorSessionMinutes * 60_000,
        );
        const authStrength: 'PIN' | 'BADGE' = usingBadge ? 'BADGE' : 'PIN';
        await tx.staffOperatorSession.create({
          data: {
            shopId,
            membershipId: dto.membershipId,
            tokenHash: this.hashSecret(rawToken),
            authStrength,
            workstation: dto.workstation?.trim() || null,
            expiresAt,
            createdById: actor.sub,
          },
        });
        return { outcome: 'SUCCESS', rawToken, expiresAt, authStrength };
      },
    );

    if (result.outcome === 'UNAVAILABLE') {
      throw new UnauthorizedException('Operator credential unavailable.');
    }
    if (result.outcome === 'LOCKED') {
      throw new HttpException('Operator credential temporarily locked.', 429);
    }
    if (result.outcome === 'INVALID') {
      if (result.locked) {
        throw new HttpException('Operator credential temporarily locked.', 429);
      }
      throw new UnauthorizedException('Operator PIN or badge is incorrect.');
    }

    await this.audit.record(actor, {
      section: 'team',
      action: 'workforce.operator_switch',
      summary: `Quick-switched operator to ${target.user.name ?? target.user.email}`,
      meta: {
        membershipId: target.id,
        authStrength: result.authStrength,
        workstation: dto.workstation,
      },
    });
    return {
      operatorToken: result.rawToken,
      expiresAt: result.expiresAt,
      authStrength: result.authStrength,
      operator: {
        membershipId: target.id,
        displayName:
          target.user.name ?? target.user.staffHandle ?? target.user.email,
      },
    };
  }

  private hashSecret(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  async listApprovalPolicies(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const rows = await this.prisma.staffApprovalPolicy.findMany({
      where: { shopId },
    });
    const byKind = new Map(rows.map((row) => [row.actionKind, row]));
    return PHASE10_ACTION_KINDS.map(
      (actionKind) =>
        byKind.get(actionKind) ?? {
          actionKind,
          enabled: false,
          amountThresholdMinor: null,
          requirePassword: true,
          notifyOnUse: true,
          version: 0,
        },
    );
  }

  async updateApprovalPolicy(
    actor: JwtAccessPayload,
    dto: UpdateApprovalPolicyDto,
  ) {
    this.assertOwner(actor);
    const shopId = requireShopId(actor);
    const actionKind = assertPhase10ActionKind(dto.actionKind);
    const row = await this.prisma.staffApprovalPolicy.upsert({
      where: { shopId_actionKind: { shopId, actionKind } },
      create: {
        shopId,
        actionKind,
        enabled: dto.enabled,
        amountThresholdMinor: dto.amountThresholdMinor ?? null,
        requirePassword: dto.requirePassword ?? true,
        notifyOnUse: dto.notifyOnUse ?? true,
        version: 1,
        createdById: actor.sub,
        updatedById: actor.sub,
      },
      update: {
        enabled: dto.enabled,
        amountThresholdMinor: dto.amountThresholdMinor ?? null,
        ...(dto.requirePassword !== undefined
          ? { requirePassword: dto.requirePassword }
          : {}),
        ...(dto.notifyOnUse !== undefined
          ? { notifyOnUse: dto.notifyOnUse }
          : {}),
        version: { increment: 1 },
        updatedById: actor.sub,
      },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: 'workforce.approval_policy.update',
      summary: `${actionKind} approval ${row.enabled ? 'enabled' : 'disabled'}`,
      meta: {
        actionKind,
        threshold: row.amountThresholdMinor,
        version: row.version,
      },
    });
    return row;
  }

  private policyRequiresApproval(
    policy: { enabled: boolean; amountThresholdMinor: number | null },
    amountMinor?: number,
  ) {
    if (!policy.enabled) return false;
    if (policy.amountThresholdMinor == null) return true;
    return amountMinor != null && amountMinor >= policy.amountThresholdMinor;
  }

  async createApprovalRequest(
    actor: JwtAccessPayload,
    dto: CreateApprovalRequestV2Dto,
    idempotencyKey?: string,
  ) {
    const shopId = requireShopId(actor);
    const requester = await this.actorMembership(actor);
    const actionKind = assertPhase10ActionKind(dto.actionKind);
    const policy = await this.prisma.staffApprovalPolicy.findUnique({
      where: { shopId_actionKind: { shopId, actionKind } },
    });
    if (!policy || !this.policyRequiresApproval(policy, dto.amountMinor)) {
      throw new BadRequestException(
        'This action does not currently require elevated approval.',
      );
    }
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: `workforce.phase10.approval.request.${actionKind}`,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      async () => {
        const row = await this.prisma.staffApprovalRequestV2.create({
          data: {
            shopId,
            actionKind,
            requesterMembershipId: requester.id,
            sourceType: dto.sourceType.trim(),
            sourceId: dto.sourceId?.trim() || null,
            amountMinor: dto.amountMinor ?? null,
            reason: dto.reason.trim(),
            policyVersion: policy.version,
            expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
          },
        });
        await this.audit.record(actor, {
          section: 'team',
          action: 'workforce.approval.request',
          summary: `Requested ${actionKind} approval`,
          meta: {
            approvalRequestId: row.id,
            sourceType: row.sourceType,
            sourceId: row.sourceId,
          },
        });
        return row;
      },
    );
  }

  async listApprovalRequests(actor: JwtAccessPayload, status?: string) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    return this.prisma.staffApprovalRequestV2.findMany({
      where: {
        shopId,
        ...(status ? { status: status.toUpperCase() } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async decideApprovalRequest(
    actor: JwtAccessPayload,
    id: string,
    dto: DecideApprovalRequestV2Dto,
    headerPassword?: string,
    idempotencyKey?: string,
  ) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    const approver = await this.actorMembership(actor);
    const request = await this.prisma.staffApprovalRequestV2.findFirst({
      where: { id, shopId },
    });
    if (!request) throw new NotFoundException('Approval request not found.');
    if (request.requesterMembershipId === approver.id) {
      throw new ForbiddenException(
        'Requester cannot approve their own elevated action.',
      );
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException('Approval request is no longer pending.');
    }
    if (request.expiresAt <= new Date()) {
      await this.prisma.staffApprovalRequestV2.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      throw new ConflictException('Approval request expired.');
    }
    const policy = await this.prisma.staffApprovalPolicy.findUnique({
      where: {
        shopId_actionKind: { shopId, actionKind: request.actionKind },
      },
    });
    if (dto.approve && policy?.requirePassword) {
      const password = requireConfirmPassword(dto.password, headerPassword);
      await assertUserPassword(this.prisma, actor.sub, password);
    }
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: `workforce.phase10.approval.decision.${id}`,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({
          approve: dto.approve,
          note: dto.note ?? null,
        }),
      },
      async () => {
        const row = await this.prisma.staffApprovalRequestV2.update({
          where: { id },
          data: {
            status: dto.approve ? 'APPROVED' : 'DENIED',
            decidedByMembershipId: approver.id,
            decisionNote: dto.note?.trim() || null,
            decidedAt: new Date(),
          },
        });
        await this.audit.record(actor, {
          section: 'team',
          action: dto.approve
            ? 'workforce.approval.approve'
            : 'workforce.approval.deny',
          summary: `${dto.approve ? 'Approved' : 'Denied'} ${row.actionKind}`,
          meta: {
            approvalRequestId: row.id,
            requesterMembershipId: row.requesterMembershipId,
          },
        });
        return row;
      },
    );
  }

  async listNotificationRules(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const rows = await this.prisma.staffNotificationRule.findMany({
      where: { shopId },
    });
    const byKind = new Map(rows.map((row) => [row.actionKind, row]));
    return PHASE10_ACTION_KINDS.map(
      (actionKind) =>
        byKind.get(actionKind) ?? {
          actionKind,
          enabled: false,
          amountThresholdMinor: null,
          repeatWindowMinutes: 60,
          repeatCountThreshold: 3,
          afterHoursStartHour: null,
          afterHoursEndHour: null,
          version: 0,
        },
    );
  }

  async updateNotificationRule(
    actor: JwtAccessPayload,
    dto: UpdateStaffNotificationRuleDto,
  ) {
    this.assertOwner(actor);
    const shopId = requireShopId(actor);
    const actionKind = assertPhase10ActionKind(dto.actionKind);
    const row = await this.prisma.staffNotificationRule.upsert({
      where: { shopId_actionKind: { shopId, actionKind } },
      create: {
        shopId,
        actionKind,
        enabled: dto.enabled,
        amountThresholdMinor: dto.amountThresholdMinor ?? null,
        repeatWindowMinutes: dto.repeatWindowMinutes ?? 60,
        repeatCountThreshold: dto.repeatCountThreshold ?? 3,
        afterHoursStartHour: dto.afterHoursStartHour ?? null,
        afterHoursEndHour: dto.afterHoursEndHour ?? null,
        createdById: actor.sub,
        updatedById: actor.sub,
      },
      update: {
        enabled: dto.enabled,
        amountThresholdMinor: dto.amountThresholdMinor ?? null,
        ...(dto.repeatWindowMinutes !== undefined
          ? { repeatWindowMinutes: dto.repeatWindowMinutes }
          : {}),
        ...(dto.repeatCountThreshold !== undefined
          ? { repeatCountThreshold: dto.repeatCountThreshold }
          : {}),
        ...(dto.afterHoursStartHour !== undefined
          ? { afterHoursStartHour: dto.afterHoursStartHour }
          : {}),
        ...(dto.afterHoursEndHour !== undefined
          ? { afterHoursEndHour: dto.afterHoursEndHour }
          : {}),
        version: { increment: 1 },
        updatedById: actor.sub,
      },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: 'workforce.notification_rule.update',
      summary: `${actionKind} owner alert ${row.enabled ? 'enabled' : 'disabled'}`,
      meta: { actionKind, version: row.version },
    });
    return row;
  }

  async getWorkforcePolicy(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    return this.workforcePolicy(shopId, actor.sub);
  }

  async updateWorkforcePolicy(
    actor: JwtAccessPayload,
    dto: UpdateWorkforcePolicyDto,
  ) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    const row = await this.prisma.workforcePolicy.upsert({
      where: { shopId },
      create: { shopId, updatedById: actor.sub, ...DEFAULT_POLICY, ...dto },
      update: { ...dto, updatedById: actor.sub },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: 'workforce.policy.update',
      summary: 'Updated time-clock and scheduling policy',
      meta: { ...dto },
    });
    return row;
  }

  async assertClockInAllowed(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const membership = await this.actorMembership(actor);
    const policy = await this.workforcePolicy(shopId, actor.sub);
    if (!policy.enforceSchedule) return;
    const now = new Date();
    const latestAllowedStart = new Date(
      now.getTime() + policy.earlyClockInMinutes * 60_000,
    );
    const shift = await this.prisma.scheduleEntry.findFirst({
      where: {
        shopId,
        membershipId: membership.id,
        status: { not: 'CANCELLED' },
        startsAt: { lte: latestAllowedStart },
        endsAt: { gt: now },
      },
      orderBy: { startsAt: 'asc' },
    });
    if (!shift) {
      throw new ForbiddenException(
        'Clock-in is outside the configured schedule window.',
      );
    }
  }

  async createShiftSwap(
    actor: JwtAccessPayload,
    dto: CreateShiftSwapRequestDto,
  ) {
    const shopId = requireShopId(actor);
    const requester = await this.actorMembership(actor);
    const schedule = await this.prisma.scheduleEntry.findFirst({
      where: { id: dto.scheduleEntryId, shopId },
    });
    if (!schedule) throw new NotFoundException('Scheduled shift not found.');
    const canManage =
      actor.shopRole === 'OWNER' ||
      actor.shopRole === 'MANAGER' ||
      hasPermission(actor.perms ?? '', PERMISSIONS.STAFF_WRITE);
    if (schedule.membershipId !== requester.id && !canManage) {
      throw new ForbiddenException(
        'Employees may request swaps only for their own shifts.',
      );
    }
    if (dto.targetMembershipId) {
      const target = await this.membershipInShop(
        shopId,
        dto.targetMembershipId,
      );
      if (!target.isActive) {
        throw new BadRequestException('Target employee is inactive.');
      }
    }
    const row = await this.prisma.shiftSwapRequest.create({
      data: {
        shopId,
        scheduleEntryId: schedule.id,
        requesterMembershipId: requester.id,
        targetMembershipId: dto.targetMembershipId ?? null,
        reason: dto.reason.trim(),
      },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: 'workforce.shift_swap.request',
      summary: 'Requested a scheduled shift swap',
      meta: {
        shiftSwapRequestId: row.id,
        scheduleEntryId: row.scheduleEntryId,
      },
    });
    return row;
  }

  async listShiftSwaps(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const membership = await this.actorMembership(actor);
    const canManage =
      actor.shopRole === 'OWNER' ||
      actor.shopRole === 'MANAGER' ||
      hasPermission(actor.perms ?? '', PERMISSIONS.STAFF_READ);
    return this.prisma.shiftSwapRequest.findMany({
      where: canManage
        ? { shopId }
        : {
            shopId,
            OR: [
              { requesterMembershipId: membership.id },
              { targetMembershipId: membership.id },
            ],
          },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async decideShiftSwap(
    actor: JwtAccessPayload,
    id: string,
    dto: DecideShiftSwapRequestDto,
  ) {
    this.assertManage(actor);
    const shopId = requireShopId(actor);
    const decider = await this.actorMembership(actor);
    const request = await this.prisma.shiftSwapRequest.findFirst({
      where: { id, shopId },
    });
    if (!request) throw new NotFoundException('Shift swap request not found.');
    if (request.status !== 'PENDING') {
      throw new ConflictException('Shift swap request is no longer pending.');
    }
    const schedule = await this.prisma.scheduleEntry.findFirst({
      where: { id: request.scheduleEntryId, shopId },
    });
    if (!schedule) {
      throw new NotFoundException('Scheduled shift no longer exists.');
    }
    if (dto.approve && !request.targetMembershipId) {
      throw new BadRequestException(
        'A target employee is required before approving the swap.',
      );
    }
    if (dto.approve && request.targetMembershipId) {
      const target = await this.membershipInShop(
        shopId,
        request.targetMembershipId,
      );
      if (!target.isActive) {
        throw new BadRequestException('Target employee is inactive.');
      }
      const overlap = await this.prisma.scheduleEntry.count({
        where: {
          shopId,
          id: { not: schedule.id },
          membershipId: target.id,
          status: { not: 'CANCELLED' },
          startsAt: { lt: schedule.endsAt },
          endsAt: { gt: schedule.startsAt },
        },
      });
      if (overlap) {
        throw new ConflictException(
          'Target employee already has an overlapping shift.',
        );
      }
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.approve && request.targetMembershipId) {
        await tx.scheduleEntry.update({
          where: { id: schedule.id },
          data: { membershipId: request.targetMembershipId },
        });
      }
      return tx.shiftSwapRequest.update({
        where: { id },
        data: {
          status: dto.approve ? 'APPROVED' : 'DENIED',
          decidedByMembershipId: decider.id,
          decisionNote: dto.note?.trim() || null,
          decidedAt: new Date(),
        },
      });
    });
    await this.audit.record(actor, {
      section: 'team',
      action: dto.approve
        ? 'workforce.shift_swap.approve'
        : 'workforce.shift_swap.deny',
      summary: `${dto.approve ? 'Approved' : 'Denied'} scheduled shift swap`,
      meta: {
        shiftSwapRequestId: row.id,
        scheduleEntryId: row.scheduleEntryId,
      },
    });
    return row;
  }

  async prepareAction(
    actor: JwtAccessPayload,
    classification: AccountableActionClassification,
    operatorToken?: string,
    approvalRequestId?: string,
  ): Promise<PreparedStaffAction | null> {
    if (!classification) return null;
    const shopId = requireShopId(actor);
    const authMembership = await this.actorMembership(actor);
    let actorMembershipId = authMembership.id;
    let authStrength: PreparedStaffAction['authStrength'] = 'SESSION';

    if (operatorToken?.trim()) {
      const session = await this.prisma.staffOperatorSession.findUnique({
        where: { tokenHash: this.hashSecret(operatorToken.trim()) },
      });
      if (
        !session ||
        session.shopId !== shopId ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException(
          'Operator session is invalid or expired.',
        );
      }
      const operatorMembership = await this.membershipInShop(
        shopId,
        session.membershipId,
      );
      if (!operatorMembership.isActive) {
        throw new ForbiddenException('Operator membership is inactive.');
      }
      if (
        HIGH_RISK_ACTION_KINDS.has(classification.actionKind) &&
        operatorMembership.id !== authMembership.id
      ) {
        throw new ForbiddenException(
          'High-risk action requires full authentication as the acting operator.',
        );
      }
      actorMembershipId = operatorMembership.id;
      authStrength = session.authStrength === 'BADGE' ? 'BADGE' : 'PIN';
    }

    let approverMembershipId: string | undefined;
    let approvalReserved = false;
    if (actor.shopRole !== 'OWNER') {
      const policy = await this.prisma.staffApprovalPolicy.findUnique({
        where: {
          shopId_actionKind: {
            shopId,
            actionKind: classification.actionKind,
          },
        },
      });
      if (
        policy &&
        this.policyRequiresApproval(policy, classification.amountMinor)
      ) {
        if (!approvalRequestId?.trim()) {
          throw new ForbiddenException(
            `Elevated approval required for ${classification.actionKind}.`,
          );
        }
        const approval = await this.prisma.staffApprovalRequestV2.findFirst({
          where: { id: approvalRequestId.trim(), shopId },
        });
        if (
          !approval ||
          approval.status !== 'APPROVED' ||
          approval.expiresAt <= new Date()
        ) {
          throw new ForbiddenException(
            'Approved, unexpired staff approval is required.',
          );
        }
        if (
          approval.requesterMembershipId !== authMembership.id ||
          approval.actionKind !== classification.actionKind ||
          approval.sourceType !== classification.sourceType ||
          (approval.amountMinor != null &&
            classification.amountMinor != null &&
            classification.amountMinor > approval.amountMinor)
        ) {
          throw new ForbiddenException('Approval does not match this action.');
        }
        const reserved = await this.prisma.staffApprovalRequestV2.updateMany({
          where: {
            id: approval.id,
            shopId,
            status: 'APPROVED',
            consumedAt: null,
          },
          data: { status: 'IN_USE' },
        });
        if (reserved.count !== 1) {
          throw new ConflictException(
            'Approval has already been reserved or consumed.',
          );
        }
        approverMembershipId = approval.decidedByMembershipId ?? undefined;
        approvalReserved = true;
      }
    }

    return {
      shopId,
      authenticatedUserId: actor.sub,
      actorMembershipId,
      authStrength,
      classification,
      approvalRequestId: approvalRequestId?.trim() || undefined,
      approverMembershipId,
      approvalReserved,
    };
  }

  async abortPreparedAction(prepared: PreparedStaffAction | null) {
    if (!prepared?.approvalReserved || !prepared.approvalRequestId) return;
    await this.prisma.staffApprovalRequestV2.updateMany({
      where: {
        id: prepared.approvalRequestId,
        shopId: prepared.shopId,
        status: 'IN_USE',
        consumedAt: null,
      },
      data: { status: 'APPROVED' },
    });
  }

  async finalizePreparedAction(
    prepared: PreparedStaffAction | null,
    sourceId?: string,
    context?: Record<string, unknown>,
  ) {
    if (!prepared?.classification) return null;
    const { classification } = prepared;
    const rule = await this.prisma.staffNotificationRule.findUnique({
      where: {
        shopId_actionKind: {
          shopId: prepared.shopId,
          actionKind: classification.actionKind,
        },
      },
    });
    let suspiciousReasons: string[] = [];
    if (rule?.enabled) {
      const since = new Date(
        Date.now() - rule.repeatWindowMinutes * 60_000,
      );
      const recentSameActorCount = await this.prisma.staffActionEvidence.count({
        where: {
          shopId: prepared.shopId,
          actorMembershipId: prepared.actorMembershipId,
          actionKind: classification.actionKind,
          occurredAt: { gte: since },
        },
      });
      const shop = await this.prisma.shop.findUnique({
        where: { id: prepared.shopId },
        select: { timezone: true },
      });
      suspiciousReasons = computeSuspiciousReasons({
        amountMinor: classification.amountMinor,
        recentSameActorCount,
        localHour: this.localHour(new Date(), shop?.timezone ?? 'UTC'),
        rule,
        managerOverride: classification.actionKind === 'MANAGER_OVERRIDE',
      });
    }

    const evidence = await this.prisma.$transaction(async (tx) => {
      const row = await tx.staffActionEvidence.create({
        data: {
          shopId: prepared.shopId,
          actionKind: classification.actionKind,
          sourceType: classification.sourceType,
          sourceId: sourceId ?? null,
          actorMembershipId: prepared.actorMembershipId,
          authenticatedUserId: prepared.authenticatedUserId,
          approverMembershipId: prepared.approverMembershipId ?? null,
          approvalRequestId: prepared.approvalRequestId ?? null,
          authStrength: prepared.authStrength,
          amountMinor: classification.amountMinor ?? null,
          suspicious: suspiciousReasons.length > 0,
          suspiciousReasons: suspiciousReasons as Prisma.InputJsonValue,
          context: (context ?? {}) as Prisma.InputJsonValue,
        },
      });
      if (prepared.approvalReserved && prepared.approvalRequestId) {
        const consumed = await tx.staffApprovalRequestV2.updateMany({
          where: {
            id: prepared.approvalRequestId,
            shopId: prepared.shopId,
            status: 'IN_USE',
            consumedAt: null,
          },
          data: {
            status: 'CONSUMED',
            consumedAt: new Date(),
            consumedSourceId: sourceId ?? row.id,
          },
        });
        if (consumed.count !== 1) {
          throw new ConflictException(
            'Reserved approval could not be consumed exactly once.',
          );
        }
      }
      return row;
    });

    if (suspiciousReasons.length) {
      const bucket = Math.floor(Date.now() / (15 * 60_000));
      await this.notifications.recordTeamEvent(prepared.shopId, {
        title: `Suspicious staff action: ${classification.actionKind}`,
        body: `Action was flagged for ${suspiciousReasons.join(', ')}. Review staff accountability.`,
        href: '/workforce',
        dedupeKey: `phase10:suspicious:${prepared.shopId}:${prepared.actorMembershipId}:${classification.actionKind}:${bucket}`,
      });
    } else if (prepared.approvalRequestId) {
      const policy = await this.prisma.staffApprovalPolicy.findUnique({
        where: {
          shopId_actionKind: {
            shopId: prepared.shopId,
            actionKind: classification.actionKind,
          },
        },
      });
      if (policy?.notifyOnUse) {
        const bucket = Math.floor(Date.now() / (15 * 60_000));
        await this.notifications.recordTeamEvent(prepared.shopId, {
          title: `Manager approval used: ${classification.actionKind}`,
          body: 'An elevated staff approval was consumed for an operational action.',
          href: '/workforce',
          dedupeKey: `phase10:approval-use:${prepared.shopId}:${classification.actionKind}:${bucket}`,
        });
      }
    }
    return evidence;
  }

  private localHour(date: Date, timezone: string) {
    try {
      const value = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(date);
      const hour = Number(value);
      return Number.isFinite(hour) ? hour : date.getUTCHours();
    } catch {
      return date.getUTCHours();
    }
  }

  async accountabilityFeed(actor: JwtAccessPayload, take = 100) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const rows = await this.prisma.staffActionEvidence.findMany({
      where: { shopId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(1, take), 500),
    });
    const ids = [
      ...new Set(
        rows.flatMap((row) =>
          [row.actorMembershipId, row.approverMembershipId].filter(
            Boolean,
          ) as string[],
        ),
      ),
    ];
    const memberships = await this.prisma.membership.findMany({
      where: { shopId, id: { in: ids } },
      include: {
        user: { select: { name: true, email: true, staffHandle: true } },
      },
    });
    const names = new Map(
      memberships.map((membership) => [
        membership.id,
        membership.user.name ??
          membership.user.staffHandle ??
          membership.user.email,
      ]),
    );
    return rows.map((row) => ({
      ...row,
      actorName: names.get(row.actorMembershipId) ?? row.actorMembershipId,
      approverName: row.approverMembershipId
        ? (names.get(row.approverMembershipId) ?? row.approverMembershipId)
        : null,
    }));
  }

  async performance(actor: JwtAccessPayload, days = 30) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const boundedDays = Math.min(Math.max(1, Math.trunc(days)), 366);
    const since = new Date(Date.now() - boundedDays * 86_400_000);
    const policy = await this.workforcePolicy(shopId, actor.sub);
    const memberships = await this.prisma.membership.findMany({
      where: { shopId, role: { not: 'OWNER' } },
      include: {
        user: { select: { name: true, email: true, staffHandle: true } },
      },
    });
    const evidence = await this.prisma.staffActionEvidence.findMany({
      where: { shopId, occurredAt: { gte: since } },
    });
    const punches = await this.prisma.timePunch.findMany({
      where: { shopId, startedAt: { gte: since } },
      orderBy: { startedAt: 'asc' },
    });
    const punchIds = punches.map((punch) => punch.id);
    const breaks = punchIds.length
      ? await this.prisma.breakRecord.findMany({
          where: { shopId, timePunchId: { in: punchIds } },
        })
      : [];
    const schedules = await this.prisma.scheduleEntry.findMany({
      where: { shopId, startsAt: { gte: since } },
    });
    const scheduleById = new Map(
      schedules.map((schedule) => [schedule.id, schedule]),
    );
    const breaksByPunch = new Map<string, typeof breaks>();
    for (const record of breaks) {
      const list = breaksByPunch.get(record.timePunchId) ?? [];
      list.push(record);
      breaksByPunch.set(record.timePunchId, list);
    }

    return memberships.map((membership) => {
      const mine = evidence.filter(
        (row) => row.actorMembershipId === membership.id,
      );
      const sales = mine.filter((row) => row.actionKind === 'SALE');
      const refunds = mine.filter((row) => row.actionKind === 'REFUND');
      const voids = mine.filter(
        (row) => row.actionKind === 'VOID_AFTER_SEND',
      );
      const discounts = mine.filter(
        (row) => row.actionKind === 'LARGE_DISCOUNT',
      );
      const myPunches = punches.filter(
        (punch) => punch.membershipId === membership.id,
      );
      let workedSeconds = 0;
      let lateCount = 0;
      let lateSeconds = 0;
      let breakViolations = 0;
      for (const punch of myPunches) {
        const endedAt = punch.endedAt ?? new Date();
        const seconds = Math.max(
          0,
          Math.floor(
            (endedAt.getTime() - punch.startedAt.getTime()) / 1000,
          ),
        );
        const unpaidBreakSeconds = (breaksByPunch.get(punch.id) ?? [])
          .filter((record) => !record.paid)
          .reduce((sum, record) => {
            const end = record.endedAt ?? endedAt;
            return (
              sum +
              Math.max(
                0,
                Math.floor((end.getTime() - record.startedAt.getTime()) / 1000),
              )
            );
          }, 0);
        workedSeconds += Math.max(0, seconds - unpaidBreakSeconds);
        const scheduled = punch.scheduleEntryId
          ? scheduleById.get(punch.scheduleEntryId)
          : undefined;
        const attendance = scheduleStatus({
          scheduledStart: scheduled?.startsAt,
          actualStart: punch.startedAt,
          lateGraceMinutes: policy.lateGraceMinutes,
        });
        if (attendance.late) {
          lateCount += 1;
          lateSeconds += attendance.lateBySeconds;
        }
        const compliance = breakCompliance({
          workedSeconds: seconds,
          unpaidBreakSeconds,
          minimumBreakAfterSeconds: policy.minimumBreakAfterSeconds,
          minimumBreakSeconds: policy.minimumBreakSeconds,
        });
        if (!compliance.compliant) breakViolations += 1;
      }
      const saleMinor = sales.reduce(
        (sum, row) => sum + (row.amountMinor ?? 0),
        0,
      );
      const exceptionCount = mine.filter((row) => row.suspicious).length;
      const denom = Math.max(1, sales.length);
      return {
        membershipId: membership.id,
        displayName:
          membership.user.name ??
          membership.user.staffHandle ??
          membership.user.email,
        salesCount: sales.length,
        salesMinor: saleMinor,
        averageCheckMinor: sales.length
          ? Math.round(saleMinor / sales.length)
          : 0,
        refundCount: refunds.length,
        refundRate: refunds.length / denom,
        voidCount: voids.length,
        voidRate: voids.length / denom,
        discountCount: discounts.length,
        discountRate: discounts.length / denom,
        workedHours: workedSeconds / 3600,
        overtimeSeconds: overtimeSeconds(
          workedSeconds,
          policy.overtimeWeeklySeconds *
            Math.max(1, Math.ceil(boundedDays / 7)),
        ),
        lateCount,
        lateSeconds,
        breakComplianceViolations: breakViolations,
        exceptionCount,
        upsellPerformance: null,
        serviceTimingSeconds: null,
        note: 'Operational metrics only; this is not payroll.',
      };
    });
  }
}
