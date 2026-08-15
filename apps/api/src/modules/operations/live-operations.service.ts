import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashSessionStatus,
  ComplianceDocumentState,
  DeviceStatus,
  GuestCheckStatus,
  OperationsBillingMode,
  OperationsMoveRatePolicy,
  OperationsPauseBillingMode,
  PaymentOperationState,
  Prisma,
  ResourceConfigurationState,
} from '@prisma/client';
import { assertExpectedVersion } from '../../common/optimistic-concurrency.util';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  CancelOperationsSessionDto,
  CreateMaintenanceDto,
  CreateOperationsWaitlistDto,
  ExtendOperationsSessionDto,
  ExpectedOperationsSessionVersionDto,
  MoveOperationsSessionDto,
  OperationsWaitlistActionDto,
  PauseOperationsSessionDto,
  SeatOperationsWaitlistDto,
  StartOperationsSessionDto,
  UpdateOperationsPolicyDto,
} from './dto/operations.dto';
import {
  calculateAccruedMinor,
  OperationsService,
  resolveApplicableRatePlan,
} from './operations.service';

const OPEN_SESSION_STATES = ['ACTIVE', 'PAUSED'];
const ACTIVE_RESERVATION_STATES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
const LIVE_WAITLIST_STATES = ['WAITING', 'NOTIFIED', 'SKIPPED', 'SEATING'];

const DEFAULT_POLICY = {
  pauseBillingMode: OperationsPauseBillingMode.STOP_CHARGING,
  managerOnlyPause: false,
  maxPauseMinutes: null as number | null,
  moveRatePolicy: OperationsMoveRatePolicy.KEEP_SESSION_RATE,
  fixedSessionAutoExtend: false,
  fixedSessionWarningMinutes: [15, 5],
  defaultExtensionMinutes: 15,
};

type Phase3RateInput = Parameters<typeof calculateAccruedMinor>[0] & {
  autoExtend?: boolean;
};

export function calculatePhase3AccruedMinor(input: Phase3RateInput): number {
  if (
    input.billingMode !== OperationsBillingMode.FIXED_DURATION ||
    input.overtimeRateMinor == null
  ) {
    return calculateAccruedMinor(input);
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((input.endedAt.getTime() - input.startedAt.getTime()) / 1000) -
      Math.max(0, input.totalPausedSeconds),
  );
  const chargeableSeconds = Math.max(
    0,
    elapsedSeconds - Math.max(0, input.graceMinutes ?? 0) * 60,
  );
  if (chargeableSeconds === 0) return 0;

  const includedMinutes = Math.max(
    1,
    input.overtimeAfterMinutes ?? input.fixedDurationMinutes ?? 1,
  );
  const base = Math.max(0, input.unitPriceMinor ?? input.hourlyRateMinor);
  const overageSeconds = Math.max(0, chargeableSeconds - includedMinutes * 60);
  const overageMinutes = Math.ceil(overageSeconds / 60);
  let total = base + Math.round((overageMinutes * input.overtimeRateMinor) / 60);
  total = Math.max(total, input.minimumChargeMinor ?? 0);
  return input.capMinor == null ? total : Math.min(total, input.capMinor);
}

export function projectSessionTiming(input: {
  now: Date;
  startedAt: Date;
  status: string;
  pausedAt?: Date | null;
  totalPausedSeconds: number;
  pauseBillingMode: OperationsPauseBillingMode;
  scheduledEndAt?: Date | null;
  autoExtend: boolean;
  extensionMinutes: number;
  warningMinutes: number[];
  maxPauseMinutes?: number | null;
}) {
  const openPauseSeconds = input.status === 'PAUSED' && input.pausedAt
    ? Math.max(0, Math.floor((input.now.getTime() - input.pausedAt.getTime()) / 1000))
    : 0;
  const nonChargingOpenPauseSeconds =
    input.pauseBillingMode === OperationsPauseBillingMode.STOP_CHARGING
      ? openPauseSeconds
      : 0;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((input.now.getTime() - input.startedAt.getTime()) / 1000) -
      Math.max(0, input.totalPausedSeconds) -
      nonChargingOpenPauseSeconds,
  );

  let effectiveScheduledEndAt = input.scheduledEndAt
    ? new Date(
        input.scheduledEndAt.getTime() + nonChargingOpenPauseSeconds * 1000,
      )
    : null;
  let autoExtensionCountProjected = 0;
  if (effectiveScheduledEndAt && input.autoExtend && effectiveScheduledEndAt <= input.now) {
    const extensionMs = Math.max(1, input.extensionMinutes) * 60_000;
    autoExtensionCountProjected =
      Math.floor((input.now.getTime() - effectiveScheduledEndAt.getTime()) / extensionMs) + 1;
    effectiveScheduledEndAt = new Date(
      effectiveScheduledEndAt.getTime() + autoExtensionCountProjected * extensionMs,
    );
  }

  const remainingSeconds = effectiveScheduledEndAt
    ? Math.floor((effectiveScheduledEndAt.getTime() - input.now.getTime()) / 1000)
    : null;
  const alerts: string[] = [];
  if (
    input.status === 'PAUSED' &&
    input.maxPauseMinutes != null &&
    openPauseSeconds > input.maxPauseMinutes * 60
  ) {
    alerts.push('PAUSE_LIMIT_EXCEEDED');
  }
  if (input.scheduledEndAt && !input.autoExtend) {
    const rawRemaining = Math.floor(
      (input.scheduledEndAt.getTime() + nonChargingOpenPauseSeconds * 1000 - input.now.getTime()) /
        1000,
    );
    if (rawRemaining <= 0) alerts.push('TIME_EXPIRED');
  }
  if (autoExtensionCountProjected > 0) alerts.push('AUTO_EXTENDED');
  if (remainingSeconds != null && remainingSeconds > 0) {
    for (const warning of [...new Set(input.warningMinutes)].sort((a, b) => a - b)) {
      if (remainingSeconds <= warning * 60) alerts.push(`TIME_WARNING_${warning}M`);
    }
  }

  return {
    elapsedSeconds,
    remainingSeconds,
    effectiveScheduledEndAt,
    autoExtensionCountProjected,
    openPauseSeconds,
    alerts,
  };
}

function majorToMinor(value: Prisma.Decimal | number | string | null): number {
  return new Prisma.Decimal(value ?? 0)
    .mul(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class LiveOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly legacy: OperationsService,
  ) {}

  private isManager(actor: JwtAccessPayload) {
    return (
      actor.sysRole === 'SUPER_ADMIN' ||
      actor.shopRole === 'OWNER' ||
      actor.shopRole === 'MANAGER' ||
      actor.perms === '*' ||
      actor.perms?.split(',').includes('*') === true
    );
  }

  private assertManager(actor: JwtAccessPayload, message: string) {
    if (!this.isManager(actor)) throw new ForbiddenException(message);
  }

  private record(
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    return this.audit.record(actor, { section: 'operations', action, summary, meta });
  }

  private async getStoredPolicy(shopId: string) {
    return this.prisma.operationsVenuePolicy.findUnique({ where: { shopId } });
  }

  async getPolicy(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const policy = await this.getStoredPolicy(shopId);
    return policy ?? { id: null, shopId, version: 0, ...DEFAULT_POLICY };
  }

  async updatePolicy(actor: JwtAccessPayload, dto: UpdateOperationsPolicyDto) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const existing = await this.getStoredPolicy(shopId);
    if (!existing) {
      if (dto.expectedVersion !== 0) {
        throw new ConflictException('Operations policy changed. Reload and try again.');
      }
      const created = await this.prisma.operationsVenuePolicy.create({
        data: {
          shopId,
          pauseBillingMode: dto.pauseBillingMode ?? DEFAULT_POLICY.pauseBillingMode,
          managerOnlyPause: dto.managerOnlyPause ?? DEFAULT_POLICY.managerOnlyPause,
          maxPauseMinutes: dto.maxPauseMinutes,
          moveRatePolicy: dto.moveRatePolicy ?? DEFAULT_POLICY.moveRatePolicy,
          fixedSessionAutoExtend:
            dto.fixedSessionAutoExtend ?? DEFAULT_POLICY.fixedSessionAutoExtend,
          fixedSessionWarningMinutes:
            dto.fixedSessionWarningMinutes ?? DEFAULT_POLICY.fixedSessionWarningMinutes,
          defaultExtensionMinutes:
            dto.defaultExtensionMinutes ?? DEFAULT_POLICY.defaultExtensionMinutes,
        },
      });
      await this.record(actor, 'operations.policy.create', 'Created live-operations policy', {
        policyId: created.id,
      });
      return created;
    }

    assertExpectedVersion(existing.version, dto.expectedVersion, {
      aggregateType: 'operations_policy',
      aggregateId: existing.id,
    });
    const claimed = await this.prisma.operationsVenuePolicy.updateMany({
      where: { id: existing.id, shopId, version: dto.expectedVersion },
      data: {
        version: { increment: 1 },
        ...(dto.pauseBillingMode !== undefined && {
          pauseBillingMode: dto.pauseBillingMode,
        }),
        ...(dto.managerOnlyPause !== undefined && {
          managerOnlyPause: dto.managerOnlyPause,
        }),
        ...(dto.maxPauseMinutes !== undefined && {
          maxPauseMinutes: dto.maxPauseMinutes,
        }),
        ...(dto.moveRatePolicy !== undefined && {
          moveRatePolicy: dto.moveRatePolicy,
        }),
        ...(dto.fixedSessionAutoExtend !== undefined && {
          fixedSessionAutoExtend: dto.fixedSessionAutoExtend,
        }),
        ...(dto.fixedSessionWarningMinutes !== undefined && {
          fixedSessionWarningMinutes: [...new Set(dto.fixedSessionWarningMinutes)].sort(
            (a, b) => b - a,
          ),
        }),
        ...(dto.defaultExtensionMinutes !== undefined && {
          defaultExtensionMinutes: dto.defaultExtensionMinutes,
        }),
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Operations policy changed. Reload and try again.');
    }
    const updated = await this.prisma.operationsVenuePolicy.findUniqueOrThrow({
      where: { shopId },
    });
    await this.record(actor, 'operations.policy.update', 'Updated live-operations policy', {
      policyId: updated.id,
      version: updated.version,
    });
    return updated;
  }

  private async activeReservationConflict(
    shopId: string,
    resourceId: string,
    now: Date,
    allowedReservationId?: string | null,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.reservation.findFirst({
      where: {
        shopId,
        resourceId,
        startsAt: { lte: now },
        endsAt: { gt: now },
        status: { in: ACTIVE_RESERVATION_STATES },
        ...(allowedReservationId ? { id: { not: allowedReservationId } } : {}),
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  private async resolveIdentityRefs(shopId: string, dto: StartOperationsSessionDto) {
    let customerId = dto.customerId;
    let membership: { id: string; customerId: string; tierId: string; status: string } | null = null;
    if (dto.membershipId) {
      membership = await this.prisma.customerMembership.findFirst({
        where: { id: dto.membershipId, shopId },
        select: { id: true, customerId: true, tierId: true, status: true },
      });
      if (!membership) throw new NotFoundException('Membership not found for this venue.');
      if (membership.status !== 'ACTIVE') {
        throw new ConflictException('Selected membership is not active.');
      }
      if (customerId && membership.customerId !== customerId) {
        throw new ConflictException('Membership belongs to another customer.');
      }
      customerId = customerId ?? membership.customerId;
    }
    if (customerId) {
      const customer = await this.prisma.customerProfile.findFirst({
        where: { id: customerId, shopId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Customer not found for this venue.');
    }
    return { customerId, membership };
  }

  async start(actor: JwtAccessPayload, dto: StartOperationsSessionDto) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const now = new Date();
    if (dto.allowReserved) {
      this.assertManager(actor, 'Only a manager may override a live reservation conflict.');
    }
    const reservationConflict = await this.activeReservationConflict(
      shopId,
      dto.resourceId,
      now,
      dto.reservationId,
    );
    if (reservationConflict && !dto.allowReserved) {
      throw new ConflictException('Resource is reserved for another current reservation.');
    }

    const identity = await this.resolveIdentityRefs(shopId, dto);
    const packageDefinition = dto.packageId
      ? await this.prisma.packageDefinition.findFirst({
          where: { id: dto.packageId, shopId, active: true },
        })
      : null;
    if (dto.packageId && !packageDefinition) {
      throw new NotFoundException('Selected active package was not found for this venue.');
    }
    const policy = await this.getPolicy(actor);
    const session = await this.legacy.start(actor, dto);
    const scheduledEndAt = session.fixedDurationMinutes
      ? new Date(session.startedAt.getTime() + session.fixedDurationMinutes * 60_000)
      : null;
    const packageSnapshot = packageDefinition
      ? {
          id: packageDefinition.id,
          name: packageDefinition.name,
          priceMinor: packageDefinition.priceMinor,
          currency: packageDefinition.currency,
          components: packageDefinition.components,
          capturedAt: session.startedAt.toISOString(),
        }
      : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.operationsSession.update({
        where: { id: session.id },
        data: {
          customerId: identity.customerId,
          membershipId: identity.membership?.id,
          packageId: packageDefinition?.id,
          packageSnapshot: packageSnapshot as Prisma.InputJsonValue | undefined,
          notes: dto.notes?.trim() || undefined,
          currentRatePlanId: session.ratePlanId,
          currentRateSnapshot: session.rateSnapshot as Prisma.InputJsonValue,
          billingSegmentStartedAt: session.startedAt,
          pauseBillingMode: policy.pauseBillingMode,
          managerOnlyPause: policy.managerOnlyPause,
          maxPauseMinutes: policy.maxPauseMinutes,
          moveRatePolicy: policy.moveRatePolicy,
          scheduledEndAt,
          autoExtend: policy.fixedSessionAutoExtend,
          warningMinutes: policy.fixedSessionWarningMinutes,
          extensionMinutes: policy.defaultExtensionMinutes,
        },
      });
      await tx.operationsSessionRateSegment.create({
        data: {
          shopId,
          sessionId: session.id,
          resourceId: session.resourceId,
          ratePlanId: session.ratePlanId,
          rateSnapshot: session.rateSnapshot as Prisma.InputJsonValue,
          startedAt: session.startedAt,
          actorUserId: actor.sub,
        },
      });
      return row;
    });
    await this.record(actor, 'operations.session.phase3-start', 'Captured live-session operating policy', {
      sessionId: session.id,
      customerId: identity.customerId ?? null,
      membershipId: identity.membership?.id ?? null,
      packageId: packageDefinition?.id ?? null,
      pauseBillingMode: policy.pauseBillingMode,
      moveRatePolicy: policy.moveRatePolicy,
    });
    return updated;
  }

  private async requireSession(shopId: string, id: string) {
    const session = await this.prisma.operationsSession.findFirst({ where: { id, shopId } });
    if (!session) throw new NotFoundException('Operations session not found.');
    return session;
  }

  private async mutateSessionVersioned(
    tx: Prisma.TransactionClient,
    session: { id: string; shopId: string; version: number },
    expectedVersion: number,
    data: Prisma.OperationsSessionUpdateManyMutationInput,
  ) {
    assertExpectedVersion(session.version, expectedVersion, {
      aggregateType: 'operations_session',
      aggregateId: session.id,
    });
    const claimed = await tx.operationsSession.updateMany({
      where: { id: session.id, shopId: session.shopId, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      const current = await tx.operationsSession.findFirst({
        where: { id: session.id, shopId: session.shopId },
        select: { version: true },
      });
      assertExpectedVersion(current?.version ?? expectedVersion + 1, expectedVersion, {
        aggregateType: 'operations_session',
        aggregateId: session.id,
      });
    }
    return tx.operationsSession.findFirstOrThrow({
      where: { id: session.id, shopId: session.shopId },
    });
  }

  async pause(actor: JwtAccessPayload, id: string, dto: PauseOperationsSessionDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (session.status !== 'ACTIVE') {
      throw new ConflictException('Only an active session can be paused.');
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Pause reason is required.');
    if (session.managerOnlyPause) {
      this.assertManager(actor, 'This venue requires a manager to pause sessions.');
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.operationsSessionPause.create({
        data: {
          shopId,
          sessionId: id,
          reason,
          chargingContinues:
            session.pauseBillingMode === OperationsPauseBillingMode.CONTINUE_CHARGING,
          policyMaxMinutes: session.maxPauseMinutes,
          startedAt: now,
          actorUserId: actor.sub,
        },
      });
      const row = await this.mutateSessionVersioned(tx, session, dto.expectedVersion, {
        status: 'PAUSED',
        pausedAt: now,
      });
      await tx.resourceStateEvent.create({
        data: {
          shopId,
          resourceId: row.resourceId,
          sessionId: id,
          fromState: 'IN_USE',
          toState: 'PAUSED',
          reason,
          actorUserId: actor.sub,
          metadata: {
            pauseBillingMode: session.pauseBillingMode,
            maxPauseMinutes: session.maxPauseMinutes,
          },
        },
      });
      return row;
    });
    await this.record(actor, 'operations.session.pause', 'Paused resource session', {
      sessionId: id,
      reason,
      pauseBillingMode: session.pauseBillingMode,
    });
    return updated;
  }

  async resume(
    actor: JwtAccessPayload,
    id: string,
    dto: ExpectedOperationsSessionVersionDto,
  ) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (session.status !== 'PAUSED' || !session.pausedAt) {
      throw new ConflictException('Only a paused session can be resumed.');
    }
    const now = new Date();
    const pause = await this.prisma.operationsSessionPause.findFirst({
      where: { shopId, sessionId: id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!pause) throw new ConflictException('Open pause timing segment was not found.');
    const pauseSeconds = Math.max(
      0,
      Math.floor((now.getTime() - pause.startedAt.getTime()) / 1000),
    );
    const stopCharging = !pause.chargingContinues;
    const exceeded = pause.policyMaxMinutes != null && pauseSeconds > pause.policyMaxMinutes * 60;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.operationsSessionPause.update({ where: { id: pause.id }, data: { endedAt: now } });
      const row = await this.mutateSessionVersioned(tx, session, dto.expectedVersion, {
        status: 'ACTIVE',
        pausedAt: null,
        ...(stopCharging && {
          totalPausedSeconds: { increment: pauseSeconds },
          billingSegmentPausedSeconds: { increment: pauseSeconds },
          ...(session.scheduledEndAt && {
            scheduledEndAt: new Date(session.scheduledEndAt.getTime() + pauseSeconds * 1000),
          }),
        }),
      });
      await tx.resourceStateEvent.create({
        data: {
          shopId,
          resourceId: row.resourceId,
          sessionId: id,
          fromState: 'PAUSED',
          toState: 'IN_USE',
          reason: exceeded ? 'PAUSE_LIMIT_EXCEEDED' : 'RESUME',
          actorUserId: actor.sub,
          metadata: { pauseSeconds, chargingContinues: pause.chargingContinues, exceeded },
        },
      });
      return row;
    });
    await this.record(actor, 'operations.session.resume', 'Resumed resource session', {
      sessionId: id,
      pauseSeconds,
      chargingContinues: pause.chargingContinues,
      pauseLimitExceeded: exceeded,
    });
    return updated;
  }

  private currentSegmentAmount(
    session: Awaited<ReturnType<LiveOperationsService['requireSession']>>,
    now: Date,
    extraPausedSeconds = 0,
  ) {
    return calculatePhase3AccruedMinor({
      ...session,
      startedAt: session.billingSegmentStartedAt,
      endedAt: now,
      totalPausedSeconds: session.billingSegmentPausedSeconds + extraPausedSeconds,
    });
  }

  private async resolveTargetPricing(
    tx: Prisma.TransactionClient,
    shopId: string,
    session: Awaited<ReturnType<LiveOperationsService['requireSession']>>,
    target: { id: string; name: string; type: string; categoryId: string | null; hourlyRate: Prisma.Decimal },
    now: Date,
  ) {
    const shop = await tx.shop.findUnique({
      where: { id: shopId },
      select: { timezone: true },
    });
    const candidates = await tx.operationsRatePlan.findMany({
      where: {
        shopId,
        active: true,
        OR: [
          { resourceId: target.id },
          ...(target.categoryId ? [{ resourceCategoryId: target.categoryId }] : []),
        ],
      },
    });
    const priorSnapshot = jsonRecord(session.currentRateSnapshot ?? session.rateSnapshot);
    const membershipKeys = Array.isArray(priorSnapshot.membershipKeys)
      ? priorSnapshot.membershipKeys.filter((value): value is string => typeof value === 'string')
      : [];
    const plan = resolveApplicableRatePlan(candidates, {
      now,
      timeZone: shop?.timezone ?? 'UTC',
      resourceId: target.id,
      resourceCategoryId: target.categoryId,
      membershipKeys,
      groupActive: Boolean(session.groupId),
    });
    const hourlyRateMinor = plan?.hourlyRateMinor ?? Math.max(0, majorToMinor(target.hourlyRate));
    const billingMode = plan?.billingMode ?? OperationsBillingMode.HOURLY;
    const unitPriceMinor = plan?.unitPriceMinor ?? hourlyRateMinor;
    const snapshot = {
      source: plan ? 'OPERATIONS_RATE_PLAN' : 'RESOURCE_HOURLY_RATE',
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      resourceId: target.id,
      resourceName: target.name,
      resourceType: target.type,
      capturedAt: now.toISOString(),
      movePolicy: OperationsMoveRatePolicy.REPRICE_TARGET,
      hourlyRateMinor,
      billingMode,
      unitPriceMinor,
      fixedDurationMinutes: plan?.fixedDurationMinutes ?? null,
      minimumChargeMinor: plan?.minimumChargeMinor ?? 0,
      graceMinutes: plan?.graceMinutes ?? 0,
      participantCount: session.participantCount,
      gameCount: session.gameCount,
      overtimeRateMinor: plan?.overtimeRateMinor ?? null,
      overtimeAfterMinutes: plan?.overtimeAfterMinutes ?? null,
      roundingMinutes: plan?.roundingMinutes ?? 1,
      minimumMinutes: plan?.minimumMinutes ?? 0,
      capMinor: plan?.capMinor ?? null,
      membershipKeys,
      venueTimezone: shop?.timezone ?? 'UTC',
    };
    return {
      plan,
      snapshot,
      hourlyRateMinor,
      billingMode,
      unitPriceMinor,
      fixedDurationMinutes: plan?.fixedDurationMinutes ?? null,
      minimumChargeMinor: plan?.minimumChargeMinor ?? 0,
      graceMinutes: plan?.graceMinutes ?? 0,
      overtimeRateMinor: plan?.overtimeRateMinor ?? null,
      overtimeAfterMinutes: plan?.overtimeAfterMinutes ?? null,
      roundingMinutes: plan?.roundingMinutes ?? 1,
      minimumMinutes: plan?.minimumMinutes ?? 0,
      capMinor: plan?.capMinor ?? null,
    };
  }

  async move(actor: JwtAccessPayload, id: string, dto: MoveOperationsSessionDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (!OPEN_SESSION_STATES.includes(session.status)) {
      throw new ConflictException('Ended or cancelled sessions cannot move.');
    }
    if (session.resourceId === dto.resourceId) return session;
    if (dto.allowReserved) {
      this.assertManager(actor, 'Only a manager may override a live reservation conflict.');
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:${dto.resourceId}`}))`;
      const target = await tx.resource.findFirst({
        where: { id: dto.resourceId, shopId },
      });
      if (!target) throw new NotFoundException('Target resource not found.');
      if (target.configurationState !== ResourceConfigurationState.ENABLED) {
        throw new ConflictException('Target resource is not enabled.');
      }
      const targetConflict = await tx.operationsSession.findFirst({
        where: {
          shopId,
          resourceId: target.id,
          status: { in: OPEN_SESSION_STATES },
        },
      });
      if (targetConflict) throw new ConflictException('Target resource is already in use.');
      const blocked = await tx.resourceMaintenancePeriod.findFirst({
        where: { shopId, resourceId: target.id, startsAt: { lte: now }, endsAt: null },
      });
      if (blocked) throw new ConflictException('Target resource is blocked for maintenance.');
      const reservation = await this.activeReservationConflict(
        shopId,
        target.id,
        now,
        session.reservationId,
        tx,
      );
      if (reservation && !dto.allowReserved) {
        throw new ConflictException('Target resource is reserved for another current reservation.');
      }

      let sessionData: Prisma.OperationsSessionUpdateManyMutationInput = {
        resourceId: target.id,
      };
      if (session.moveRatePolicy === OperationsMoveRatePolicy.REPRICE_TARGET) {
        let preMoveOpenPauseSeconds = 0;
        const openPause = session.status === 'PAUSED'
          ? await tx.operationsSessionPause.findFirst({
              where: { shopId, sessionId: id, endedAt: null },
              orderBy: { startedAt: 'desc' },
            })
          : null;
        if (openPause && !openPause.chargingContinues) {
          preMoveOpenPauseSeconds = Math.max(
            0,
            Math.floor((now.getTime() - openPause.startedAt.getTime()) / 1000),
          );
        }
        const segmentAmount = this.currentSegmentAmount(
          session,
          now,
          preMoveOpenPauseSeconds,
        );
        const next = await this.resolveTargetPricing(tx, shopId, session, target, now);
        await tx.operationsSessionRateSegment.updateMany({
          where: { shopId, sessionId: id, endedAt: null },
          data: { endedAt: now, accruedMinor: segmentAmount },
        });
        await tx.operationsSessionRateSegment.create({
          data: {
            shopId,
            sessionId: id,
            resourceId: target.id,
            ratePlanId: next.plan?.id,
            rateSnapshot: next.snapshot as Prisma.InputJsonValue,
            startedAt: now,
            actorUserId: actor.sub,
          },
        });
        if (openPause) {
          await tx.operationsSessionPause.update({
            where: { id: openPause.id },
            data: { endedAt: now },
          });
          await tx.operationsSessionPause.create({
            data: {
              shopId,
              sessionId: id,
              reason: openPause.reason,
              chargingContinues: openPause.chargingContinues,
              policyMaxMinutes: openPause.policyMaxMinutes,
              startedAt: now,
              actorUserId: actor.sub,
            },
          });
        }
        sessionData = {
          ...sessionData,
          currentRatePlanId: next.plan?.id ?? null,
          currentRateSnapshot: next.snapshot as Prisma.InputJsonValue,
          hourlyRateMinor: next.hourlyRateMinor,
          billingMode: next.billingMode,
          unitPriceMinor: next.unitPriceMinor,
          fixedDurationMinutes: next.fixedDurationMinutes,
          minimumChargeMinor: next.minimumChargeMinor,
          graceMinutes: next.graceMinutes,
          overtimeRateMinor: next.overtimeRateMinor,
          overtimeAfterMinutes: next.overtimeAfterMinutes,
          roundingMinutes: next.roundingMinutes,
          minimumMinutes: next.minimumMinutes,
          capMinor: next.capMinor,
          accruedBeforeCurrentSegmentMinor: { increment: segmentAmount },
          billingSegmentStartedAt: now,
          billingSegmentPausedSeconds: 0,
          ...(preMoveOpenPauseSeconds > 0 && {
            totalPausedSeconds: { increment: preMoveOpenPauseSeconds },
          }),
          ...(openPause && { pausedAt: now }),
          scheduledEndAt: next.fixedDurationMinutes
            ? new Date(now.getTime() + next.fixedDurationMinutes * 60_000)
            : null,
        };
      }

      await tx.sessionResourceLink.updateMany({
        where: { shopId, sessionId: id, unlinkedAt: null },
        data: { unlinkedAt: now },
      });
      await tx.sessionResourceLink.create({
        data: {
          shopId,
          sessionId: id,
          resourceId: target.id,
          linkedAt: now,
          actorUserId: actor.sub,
        },
      });
      const row = await this.mutateSessionVersioned(
        tx,
        session,
        dto.expectedVersion,
        sessionData,
      );
      await tx.resourceStateEvent.createMany({
        data: [
          {
            shopId,
            resourceId: session.resourceId,
            sessionId: id,
            fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE',
            toState: 'AVAILABLE',
            reason: 'MOVE',
            actorUserId: actor.sub,
            metadata: { moveRatePolicy: session.moveRatePolicy },
          },
          {
            shopId,
            resourceId: target.id,
            sessionId: id,
            fromState: 'AVAILABLE',
            toState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE',
            reason: 'MOVE',
            actorUserId: actor.sub,
            metadata: { moveRatePolicy: session.moveRatePolicy },
          },
        ],
      });
      return row;
    });
    await this.record(actor, 'operations.session.move', 'Moved live resource session', {
      sessionId: id,
      fromResourceId: session.resourceId,
      toResourceId: dto.resourceId,
      moveRatePolicy: session.moveRatePolicy,
      reservationOverride: Boolean(dto.allowReserved),
    });
    return updated;
  }

  async extend(actor: JwtAccessPayload, id: string, dto: ExtendOperationsSessionDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (!OPEN_SESSION_STATES.includes(session.status)) {
      throw new ConflictException('Ended or cancelled sessions cannot be extended.');
    }
    if (!session.scheduledEndAt || session.billingMode !== OperationsBillingMode.FIXED_DURATION) {
      throw new ConflictException('Only fixed-duration sessions can be extended.');
    }
    const nextEnd = new Date(session.scheduledEndAt.getTime() + dto.minutes * 60_000);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await this.mutateSessionVersioned(tx, session, dto.expectedVersion, {
        scheduledEndAt: nextEnd,
        extensionCount: { increment: 1 },
      });
      await tx.resourceStateEvent.create({
        data: {
          shopId,
          resourceId: row.resourceId,
          sessionId: id,
          fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE',
          toState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE',
          reason: 'TIME_EXTENSION',
          actorUserId: actor.sub,
          metadata: { minutes: dto.minutes, scheduledEndAt: nextEnd.toISOString() },
        },
      });
      return row;
    });
    await this.record(actor, 'operations.session.extend', 'Extended fixed-duration session', {
      sessionId: id,
      minutes: dto.minutes,
      scheduledEndAt: nextEnd.toISOString(),
    });
    return updated;
  }

  async finish(
    actor: JwtAccessPayload,
    id: string,
    dto: ExpectedOperationsSessionVersionDto,
  ) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (!OPEN_SESSION_STATES.includes(session.status)) {
      throw new ConflictException('Session is already ended or cancelled.');
    }
    const now = new Date();
    const openPause = session.status === 'PAUSED'
      ? await this.prisma.operationsSessionPause.findFirst({
          where: { shopId, sessionId: id, endedAt: null },
          orderBy: { startedAt: 'desc' },
        })
      : null;
    const openStopPauseSeconds = openPause && !openPause.chargingContinues
      ? Math.max(0, Math.floor((now.getTime() - openPause.startedAt.getTime()) / 1000))
      : 0;
    const currentSegmentMinor = this.currentSegmentAmount(session, now, openStopPauseSeconds);
    const accruedMinor = session.accruedBeforeCurrentSegmentMinor + currentSegmentMinor;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (openPause) {
        await tx.operationsSessionPause.update({ where: { id: openPause.id }, data: { endedAt: now } });
      }
      await tx.operationsSessionRateSegment.updateMany({
        where: { shopId, sessionId: id, endedAt: null },
        data: { endedAt: now, accruedMinor: currentSegmentMinor },
      });
      await tx.sessionResourceLink.updateMany({
        where: { shopId, sessionId: id, unlinkedAt: null },
        data: { unlinkedAt: now },
      });
      const row = await this.mutateSessionVersioned(tx, session, dto.expectedVersion, {
        status: 'FINISHED',
        finishedAt: now,
        pausedAt: null,
        accruedMinor,
        ...(openStopPauseSeconds > 0 && {
          totalPausedSeconds: { increment: openStopPauseSeconds },
          billingSegmentPausedSeconds: { increment: openStopPauseSeconds },
        }),
      });
      await tx.resourceStateEvent.create({
        data: {
          shopId,
          resourceId: row.resourceId,
          sessionId: id,
          fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE',
          toState: 'AVAILABLE',
          reason: 'SESSION_ENDED',
          actorUserId: actor.sub,
          metadata: { accruedMinor, currency: row.currency },
        },
      });
      return row;
    });
    await this.record(actor, 'operations.session.finish', 'Ended resource session and calculated usage', {
      sessionId: id,
      accruedMinor,
      currency: session.currency,
    });
    return updated;
  }

  async cancel(actor: JwtAccessPayload, id: string, dto: CancelOperationsSessionDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (!OPEN_SESSION_STATES.includes(session.status)) {
      throw new ConflictException('Session is already ended or cancelled.');
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Cancellation reason is required.');
    const now = new Date();
    const openPause = session.status === 'PAUSED'
      ? await this.prisma.operationsSessionPause.findFirst({
          where: { shopId, sessionId: id, endedAt: null },
          orderBy: { startedAt: 'desc' },
        })
      : null;
    const openStopPauseSeconds = openPause && !openPause.chargingContinues
      ? Math.max(0, Math.floor((now.getTime() - openPause.startedAt.getTime()) / 1000))
      : 0;
    const estimatedCurrentMinor = this.currentSegmentAmount(session, now, openStopPauseSeconds);
    const estimatedUsageMinor =
      session.accruedBeforeCurrentSegmentMinor + estimatedCurrentMinor;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (openPause) {
        await tx.operationsSessionPause.update({ where: { id: openPause.id }, data: { endedAt: now } });
      }
      await tx.operationsSessionRateSegment.updateMany({
        where: { shopId, sessionId: id, endedAt: null },
        data: { endedAt: now, accruedMinor: estimatedCurrentMinor },
      });
      await tx.sessionResourceLink.updateMany({
        where: { shopId, sessionId: id, unlinkedAt: null },
        data: { unlinkedAt: now },
      });
      const row = await this.mutateSessionVersioned(tx, session, dto.expectedVersion, {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelReason: reason,
        cancelledById: actor.sub,
        pausedAt: null,
        accruedMinor: 0,
        ...(openStopPauseSeconds > 0 && {
          totalPausedSeconds: { increment: openStopPauseSeconds },
          billingSegmentPausedSeconds: { increment: openStopPauseSeconds },
        }),
      });
      await tx.resourceStateEvent.create({
        data: {
          shopId,
          resourceId: row.resourceId,
          sessionId: id,
          fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE',
          toState: 'AVAILABLE',
          reason: 'SESSION_CANCELLED',
          actorUserId: actor.sub,
          metadata: { reason, estimatedUsageMinor },
        },
      });
      return row;
    });
    await this.record(actor, 'operations.session.cancel', 'Cancelled resource session', {
      sessionId: id,
      reason,
      estimatedUsageMinor,
    });
    return updated;
  }

  async floor(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    const base = await this.legacy.floor(actor);
    const now = new Date(base.generatedAt);
    const sessions = base.resources
      .map((resource) => resource.session)
      .filter((session): session is NonNullable<typeof session> => Boolean(session));
    const sessionIds = sessions.map((session) => session.id);
    const guestCheckIds = sessions
      .map((session) => session.guestCheckId)
      .filter((id): id is string => Boolean(id));
    const customerIds = sessions
      .map((session) => session.customerId)
      .filter((id): id is string => Boolean(id));
    const membershipIds = sessions
      .map((session) => session.membershipId)
      .filter((id): id is string => Boolean(id));

    const [orders, customers, memberships] = await Promise.all([
      sessionIds.length || guestCheckIds.length
        ? this.prisma.venueOrder.findMany({
            where: {
              shopId,
              status: { notIn: ['COMPLETED', 'CANCELED'] },
              OR: [
                ...(sessionIds.length
                  ? [{ operationsSessionId: { in: sessionIds } }]
                  : []),
                ...(guestCheckIds.length ? [{ guestCheckId: { in: guestCheckIds } }] : []),
              ],
            },
            select: {
              id: true,
              operationsSessionId: true,
              guestCheckId: true,
              totalMinor: true,
              currency: true,
              status: true,
            },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.customerProfile.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, name: true, email: true, phone: true },
          })
        : Promise.resolve([]),
      membershipIds.length
        ? this.prisma.customerMembership.findMany({
            where: { shopId, id: { in: membershipIds } },
            select: { id: true, tierId: true, status: true, expiresAt: true },
          })
        : Promise.resolve([]),
    ]);
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    const membershipMap = new Map(memberships.map((row) => [row.id, row]));

    return {
      ...base,
      generatedAt: now,
      resources: base.resources.map((resource) => {
        const session = resource.session;
        if (!session) return resource;
        const openPauseSeconds =
          session.status === 'PAUSED' &&
          session.pausedAt &&
          session.pauseBillingMode === OperationsPauseBillingMode.STOP_CHARGING
            ? Math.max(
                0,
                Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000),
              )
            : 0;
        const currentMinor = calculatePhase3AccruedMinor({
          ...session,
          startedAt: session.billingSegmentStartedAt,
          endedAt: now,
          totalPausedSeconds: session.billingSegmentPausedSeconds + openPauseSeconds,
        });
        const liveAccruedMinor =
          session.accruedBeforeCurrentSegmentMinor + currentMinor;
        const timing = projectSessionTiming({
          now,
          startedAt: session.startedAt,
          status: session.status,
          pausedAt: session.pausedAt,
          totalPausedSeconds: session.totalPausedSeconds,
          pauseBillingMode: session.pauseBillingMode,
          scheduledEndAt: session.scheduledEndAt,
          autoExtend: session.autoExtend,
          extensionMinutes: session.extensionMinutes,
          warningMinutes: session.warningMinutes,
          maxPauseMinutes: session.maxPauseMinutes,
        });
        const sessionOrders = orders.filter(
          (order) =>
            order.operationsSessionId === session.id ||
            (session.guestCheckId && order.guestCheckId === session.guestCheckId),
        );
        const openOrderAmountMinor = sessionOrders.reduce(
          (sum, order) => sum + order.totalMinor,
          0,
        );
        const alerts = [...timing.alerts];
        if (
          resource.nextReservation &&
          new Date(resource.nextReservation.startsAt) <= now &&
          resource.nextReservation.id !== session.reservationId
        ) {
          alerts.push('RESERVATION_CONFLICT');
        }
        return {
          ...resource,
          session: {
            ...session,
            liveAccruedMinor,
            timer: timing,
            alerts: [...new Set(alerts)],
            customer: session.customerId ? customerMap.get(session.customerId) ?? null : null,
            membership: session.membershipId
              ? membershipMap.get(session.membershipId) ?? null
              : null,
            openOrderAmountMinor,
            openOrderCount: sessionOrders.length,
          },
        };
      }),
    };
  }

  async startMaintenance(actor: JwtAccessPayload, dto: CreateMaintenanceDto) {
    const period = await this.legacy.startMaintenance(actor, dto);
    const expectedReturnAt = dto.expectedReturnAt ? new Date(dto.expectedReturnAt) : null;
    if (expectedReturnAt && expectedReturnAt <= period.startsAt) {
      await this.legacy.finishMaintenance(actor, period.id).catch(() => undefined);
      throw new BadRequestException('Expected return must be after maintenance start.');
    }
    const updated = await this.prisma.resourceMaintenancePeriod.update({
      where: { id: period.id },
      data: {
        expectedReturnAt,
        notes: dto.notes?.trim() || null,
      },
    });
    await this.record(actor, 'operations.maintenance.details', 'Recorded maintenance return estimate', {
      maintenanceId: updated.id,
      expectedReturnAt: updated.expectedReturnAt?.toISOString() ?? null,
    });
    return updated;
  }

  finishMaintenance(actor: JwtAccessPayload, id: string) {
    return this.legacy.finishMaintenance(actor, id);
  }

  private async estimateWaitMinutes(
    shopId: string,
    resourceId: string | undefined,
    requestedResourceType: string | undefined,
  ) {
    const now = new Date();
    const resources = await this.prisma.resource.findMany({
      where: {
        shopId,
        configurationState: ResourceConfigurationState.ENABLED,
        ...(resourceId ? { id: resourceId } : {}),
        ...(requestedResourceType ? { type: requestedResourceType as never } : {}),
      },
      select: { id: true },
    });
    if (!resources.length) return 0;
    const ids = resources.map((resource) => resource.id);
    const [sessions, maintenance] = await Promise.all([
      this.prisma.operationsSession.findMany({
        where: { shopId, resourceId: { in: ids }, status: { in: OPEN_SESSION_STATES } },
        select: { resourceId: true, scheduledEndAt: true },
      }),
      this.prisma.resourceMaintenancePeriod.findMany({
        where: { shopId, resourceId: { in: ids }, startsAt: { lte: now }, endsAt: null },
        select: { resourceId: true },
      }),
    ]);
    const occupied = new Set(sessions.map((session) => session.resourceId));
    const blocked = new Set(maintenance.map((period) => period.resourceId));
    if (ids.some((id) => !occupied.has(id) && !blocked.has(id))) return 0;
    const fixedEnds = sessions
      .map((session) => session.scheduledEndAt)
      .filter((date): date is Date => Boolean(date) && date! > now)
      .map((date) => Math.ceil((date.getTime() - now.getTime()) / 60_000));
    if (fixedEnds.length) return Math.max(0, Math.min(...fixedEnds));
    return 15;
  }

  async listWaitlist(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const entries = await this.prisma.reservationWaitlistEntry.findMany({
      where: { shopId, status: { in: LIVE_WAITLIST_STATES } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    const extensions = entries.length
      ? await this.prisma.operationsWaitlistExtension.findMany({
          where: { shopId, waitlistEntryId: { in: entries.map((entry) => entry.id) } },
        })
      : [];
    const extensionMap = new Map(extensions.map((row) => [row.waitlistEntryId, row]));
    return entries.map((entry) => ({
      ...entry,
      desiredDurationMinutes: Math.max(
        1,
        Math.round((entry.desiredEndsAt.getTime() - entry.desiredStartsAt.getTime()) / 60_000),
      ),
      operations: extensionMap.get(entry.id) ?? null,
    }));
  }

  async createWaitlist(actor: JwtAccessPayload, dto: CreateOperationsWaitlistDto) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    if (dto.resourceId) {
      const resource = await this.prisma.resource.findFirst({
        where: { id: dto.resourceId, shopId },
        select: { id: true },
      });
      if (!resource) throw new NotFoundException('Requested resource not found.');
    }
    const now = new Date();
    const estimatedWaitMinutes = dto.estimatedWaitMinutes ??
      (await this.estimateWaitMinutes(shopId, dto.resourceId, dto.requestedResourceType));
    const result = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.reservationWaitlistEntry.create({
        data: {
          shopId,
          resourceId: dto.resourceId,
          guestName: dto.name.trim(),
          guestPhone: dto.phone?.trim() || undefined,
          partySize: dto.partySize,
          desiredStartsAt: now,
          desiredEndsAt: new Date(now.getTime() + dto.desiredDurationMinutes * 60_000),
          status: 'WAITING',
          note: dto.notes?.trim() || undefined,
        },
      });
      const extension = await tx.operationsWaitlistExtension.create({
        data: {
          shopId,
          waitlistEntryId: entry.id,
          requestedResourceType: dto.requestedResourceType?.trim() || undefined,
          estimatedWaitMinutes,
          createdById: actor.sub,
        },
      });
      return { ...entry, desiredDurationMinutes: dto.desiredDurationMinutes, operations: extension };
    });
    await this.record(actor, 'operations.waitlist.create', 'Added party to live waitlist', {
      waitlistEntryId: result.id,
      partySize: result.partySize,
      estimatedWaitMinutes,
    });
    return result;
  }

  private async requireWaitlist(shopId: string, id: string) {
    const [entry, extension] = await Promise.all([
      this.prisma.reservationWaitlistEntry.findFirst({ where: { id, shopId } }),
      this.prisma.operationsWaitlistExtension.findFirst({
        where: { waitlistEntryId: id, shopId },
      }),
    ]);
    if (!entry || !extension) throw new NotFoundException('Live waitlist entry not found.');
    return { entry, extension };
  }

  private async waitlistAction(
    actor: JwtAccessPayload,
    id: string,
    dto: OperationsWaitlistActionDto,
    action: 'NOTIFIED' | 'SKIPPED' | 'CANCELLED' | 'EXPIRED',
  ) {
    const shopId = requireShopId(actor);
    const current = await this.requireWaitlist(shopId, id);
    if (!LIVE_WAITLIST_STATES.includes(current.entry.status) || current.entry.status === 'SEATING') {
      throw new ConflictException('This waitlist entry can no longer be changed.');
    }
    assertExpectedVersion(current.extension.version, dto.expectedVersion, {
      aggregateType: 'operations_waitlist',
      aggregateId: id,
    });
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:waitlist:${id}`}))`;
      const claimed = await tx.operationsWaitlistExtension.updateMany({
        where: { id: current.extension.id, shopId, version: dto.expectedVersion },
        data: {
          version: { increment: 1 },
          updatedById: actor.sub,
          ...(action === 'NOTIFIED' && { notifiedAt: now }),
          ...(action === 'SKIPPED' && { skippedAt: now }),
          ...(action === 'CANCELLED' && { cancelledAt: now }),
          ...(action === 'EXPIRED' && { expiredAt: now }),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Waitlist entry changed. Reload and try again.');
      }
      const entry = await tx.reservationWaitlistEntry.update({
        where: { id },
        data: {
          status: action,
          ...(action === 'NOTIFIED' && { offeredAt: now }),
        },
      });
      const extension = await tx.operationsWaitlistExtension.findUniqueOrThrow({
        where: { waitlistEntryId: id },
      });
      return { ...entry, operations: extension };
    });
    await this.record(actor, `operations.waitlist.${action.toLowerCase()}`, `Waitlist entry ${action.toLowerCase()}`, {
      waitlistEntryId: id,
    });
    return updated;
  }

  notifyWaitlist(actor: JwtAccessPayload, id: string, dto: OperationsWaitlistActionDto) {
    return this.waitlistAction(actor, id, dto, 'NOTIFIED');
  }

  skipWaitlist(actor: JwtAccessPayload, id: string, dto: OperationsWaitlistActionDto) {
    return this.waitlistAction(actor, id, dto, 'SKIPPED');
  }

  cancelWaitlist(actor: JwtAccessPayload, id: string, dto: OperationsWaitlistActionDto) {
    return this.waitlistAction(actor, id, dto, 'CANCELLED');
  }

  expireWaitlist(actor: JwtAccessPayload, id: string, dto: OperationsWaitlistActionDto) {
    return this.waitlistAction(actor, id, dto, 'EXPIRED');
  }

  async seatWaitlist(actor: JwtAccessPayload, id: string, dto: SeatOperationsWaitlistDto) {
    const shopId = requireShopId(actor);
    const current = await this.requireWaitlist(shopId, id);
    if (!['WAITING', 'NOTIFIED', 'SKIPPED'].includes(current.entry.status)) {
      throw new ConflictException('This waitlist entry is not seatable.');
    }
    assertExpectedVersion(current.extension.version, dto.expectedVersion, {
      aggregateType: 'operations_waitlist',
      aggregateId: id,
    });
    const previousStatus = current.entry.status;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:waitlist:${id}`}))`;
      const claimed = await tx.operationsWaitlistExtension.updateMany({
        where: { id: current.extension.id, shopId, version: dto.expectedVersion },
        data: { version: { increment: 1 }, updatedById: actor.sub },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Waitlist entry changed. Reload and try again.');
      }
      const state = await tx.reservationWaitlistEntry.updateMany({
        where: { id, shopId, status: previousStatus },
        data: { status: 'SEATING' },
      });
      if (state.count !== 1) {
        throw new ConflictException('Waitlist entry is already being seated.');
      }
    });

    let session;
    try {
      session = await this.start(actor, {
        resourceId: dto.resourceId,
        participantCount: current.entry.partySize,
        ratePlanId: dto.ratePlanId,
        packageId: dto.packageId,
        allowReserved: dto.allowReserved,
        notes: current.entry.note ?? undefined,
      });
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        await tx.reservationWaitlistEntry.updateMany({
          where: { id, shopId, status: 'SEATING' },
          data: { status: previousStatus },
        });
        await tx.operationsWaitlistExtension.update({
          where: { waitlistEntryId: id },
          data: { version: { increment: 1 }, updatedById: actor.sub },
        });
      });
      throw error;
    }

    const now = new Date();
    const completed = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.reservationWaitlistEntry.update({
        where: { id },
        data: { status: 'SEATED' },
      });
      const extension = await tx.operationsWaitlistExtension.update({
        where: { waitlistEntryId: id },
        data: {
          operationsSessionId: session.id,
          seatedAt: now,
          version: { increment: 1 },
          updatedById: actor.sub,
        },
      });
      return { ...entry, operations: extension };
    });
    await this.record(actor, 'operations.waitlist.seat', 'Seated waitlist party into a live session', {
      waitlistEntryId: id,
      sessionId: session.id,
      resourceId: dto.resourceId,
    });
    return { waitlist: completed, session };
  }

  async handover(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const now = new Date();
    const horizon = new Date(now.getTime() + 8 * 60 * 60_000);
    const staleDeviceBefore = new Date(now.getTime() - 15 * 60_000);
    const [
      sessions,
      openChecks,
      pendingOrders,
      upcomingReservations,
      unresolvedPayments,
      devices,
      openCashSessions,
      fiscalDocuments,
    ] = await Promise.all([
      this.prisma.operationsSession.findMany({
        where: { shopId, status: { in: OPEN_SESSION_STATES } },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.guestCheck.findMany({
        where: { shopId, status: GuestCheckStatus.OPEN },
        select: {
          id: true,
          guestName: true,
          partySize: true,
          label: true,
          currency: true,
          openedAt: true,
          version: true,
        },
        orderBy: { openedAt: 'asc' },
      }),
      this.prisma.venueOrder.findMany({
        where: { shopId, status: { notIn: ['COMPLETED', 'CANCELED'] } },
        select: {
          id: true,
          guestCheckId: true,
          operationsSessionId: true,
          resourceId: true,
          status: true,
          totalMinor: true,
          currency: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          shopId,
          startsAt: { gte: now, lte: horizon },
          status: { in: ACTIVE_RESERVATION_STATES },
        },
        select: {
          id: true,
          resourceId: true,
          guestName: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.paymentOperation.findMany({
        where: {
          shopId,
          OR: [
            {
              state: {
                in: [
                  PaymentOperationState.CREATED,
                  PaymentOperationState.PROCESSING,
                  PaymentOperationState.REQUIRES_ACTION,
                  PaymentOperationState.UNKNOWN,
                ],
              },
            },
            { reconciliationRequired: true },
          ],
        },
        select: {
          id: true,
          state: true,
          amount: true,
          currency: true,
          provider: true,
          errorCode: true,
          reconciliationRequired: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.device.findMany({
        where: { shopId },
        select: {
          id: true,
          label: true,
          type: true,
          status: true,
          lastSeenAt: true,
          softwareVersion: true,
        },
        orderBy: { label: 'asc' },
      }),
      this.prisma.cashSession.findMany({
        where: { shopId, status: CashSessionStatus.OPEN },
        select: {
          id: true,
          drawerId: true,
          openedById: true,
          openedAt: true,
          currency: true,
          version: true,
        },
        orderBy: { openedAt: 'asc' },
      }),
      this.prisma.complianceDocument.findMany({
        where: {
          shopId,
          state: {
            in: [
              ComplianceDocumentState.PENDING,
              ComplianceDocumentState.REJECTED,
              ComplianceDocumentState.UNKNOWN,
            ],
          },
        },
        select: {
          id: true,
          kind: true,
          state: true,
          documentNumber: true,
          sourceType: true,
          sourceId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const deviceProblems = devices
      .filter(
        (device) =>
          device.status === DeviceStatus.DISABLED ||
          (device.lastSeenAt != null && device.lastSeenAt < staleDeviceBefore),
      )
      .map((device) => ({
        ...device,
        problem:
          device.status === DeviceStatus.DISABLED ? 'DISABLED' : 'STALE_HEARTBEAT',
      }));
    return {
      generatedAt: now,
      activeSessions: sessions.filter((session) => session.status === 'ACTIVE'),
      pausedSessions: sessions.filter((session) => session.status === 'PAUSED'),
      openChecks,
      pendingOrders,
      upcomingReservations,
      unresolvedPayments,
      deviceProblems,
      openCashSessions,
      unresolvedFiscalDocuments: fiscalDocuments,
    };
  }
}
