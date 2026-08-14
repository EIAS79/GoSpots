import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OperationsBillingMode,
  Prisma,
  ResourceConfigurationState,
} from '@prisma/client';
import { assertExpectedVersion } from '../../common/optimistic-concurrency.util';
import { requireShopId } from '../../common/tenant';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  AttachGuestCheckDto,
  CreateMaintenanceDto,
  CreateOperationsRatePlanDto,
  CreateSessionGroupDto,
  ExpectedOperationsSessionVersionDto,
  MoveOperationsSessionDto,
  PauseOperationsSessionDto,
  StartOperationsSessionDto,
  UpdateOperationsRatePlanDto,
} from './dto/operations.dto';

const OPEN_SESSION_STATES = ['ACTIVE', 'PAUSED'];

type RateInput = {
  startedAt: Date;
  endedAt: Date;
  totalPausedSeconds: number;
  hourlyRateMinor: number;
  overtimeRateMinor?: number | null;
  overtimeAfterMinutes?: number | null;
  roundingMinutes: number;
  minimumMinutes: number;
  capMinor?: number | null;
  billingMode?: OperationsBillingMode;
  unitPriceMinor?: number;
  fixedDurationMinutes?: number | null;
  minimumChargeMinor?: number;
  graceMinutes?: number;
  participantCount?: number;
  gameCount?: number;
};

export function calculateAccruedMinor(input: RateInput): number {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((input.endedAt.getTime() - input.startedAt.getTime()) / 1000) -
      Math.max(0, input.totalPausedSeconds),
  );
  const chargeableSeconds = Math.max(
    0,
    elapsedSeconds - Math.max(0, input.graceMinutes ?? 0) * 60,
  );
  const rawMinutes = Math.ceil(chargeableSeconds / 60);
  const rounding = Math.max(1, input.roundingMinutes || 1);
  let billableMinutes = Math.max(
    Math.max(0, input.minimumMinutes),
    Math.ceil(rawMinutes / rounding) * rounding,
  );
  if (chargeableSeconds === 0) billableMinutes = 0;

  const billingMode = input.billingMode ?? OperationsBillingMode.HOURLY;
  const unitPriceMinor = Math.max(
    0,
    input.unitPriceMinor ?? input.hourlyRateMinor,
  );
  let total: number;
  if (billingMode === OperationsBillingMode.FREE) {
    total = 0;
  } else if (billingMode === OperationsBillingMode.FIXED_PRICE) {
    total = chargeableSeconds === 0 ? 0 : unitPriceMinor;
  } else if (billingMode === OperationsBillingMode.FIXED_DURATION) {
    const duration = Math.max(1, input.fixedDurationMinutes ?? 1);
    total = chargeableSeconds === 0
      ? 0
      : Math.ceil(billableMinutes / duration) * unitPriceMinor;
  } else if (billingMode === OperationsBillingMode.PER_PERSON) {
    total = chargeableSeconds === 0
      ? 0
      : unitPriceMinor * Math.max(1, input.participantCount ?? 1);
  } else if (billingMode === OperationsBillingMode.PER_GAME) {
    total = chargeableSeconds === 0
      ? 0
      : unitPriceMinor * Math.max(1, input.gameCount ?? 1);
  } else if (billingMode === OperationsBillingMode.PER_MINUTE) {
    total = billableMinutes * unitPriceMinor;
  } else {
    const overtimeAfter = input.overtimeAfterMinutes ?? null;
    const baseMinutes = overtimeAfter == null
      ? billableMinutes
      : Math.min(billableMinutes, Math.max(0, overtimeAfter));
    const overtimeMinutes = overtimeAfter == null
      ? 0
      : Math.max(0, billableMinutes - Math.max(0, overtimeAfter));
    const base = Math.round((baseMinutes * unitPriceMinor) / 60);
    const overtimeRate = input.overtimeRateMinor ?? unitPriceMinor;
    const overtime = Math.round((overtimeMinutes * overtimeRate) / 60);
    total = base + overtime;
  }

  if (billingMode === OperationsBillingMode.FREE) return 0;
  total = Math.max(total, input.minimumChargeMinor ?? 0);
  return input.capMinor == null ? total : Math.min(total, input.capMinor);
}

function majorToMinor(value: Prisma.Decimal | number | string | null): number {
  return new Prisma.Decimal(value ?? 0)
    .mul(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

type RatePlanCandidate = {
  id: string;
  resourceId: string | null;
  resourceCategoryId: string | null;
  weekdays: number[];
  startMinute: number | null;
  endMinute: number | null;
  holidayDates: string[];
  membershipHookKey: string | null;
  membershipOnly: boolean;
  groupPackage: boolean;
  priority: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdAt: Date;
};

function localRateContext(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const year = Number(value('year'));
  const month = Number(value('month'));
  const day = Number(value('day'));
  const date = `${value('year')}-${value('month')}-${value('day')}`;
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return {
    date,
    previousDate: previous.toISOString().slice(0, 10),
    weekday: weekdays[value('weekday')] ?? 0,
    minute: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

export function resolveApplicableRatePlan<T extends RatePlanCandidate>(
  candidates: T[],
  input: {
    now: Date;
    timeZone: string;
    resourceId: string;
    resourceCategoryId: string | null;
    membershipKeys: string[];
    groupActive: boolean;
  },
): T | null {
  const local = localRateContext(input.now, input.timeZone);
  return candidates
    .filter((plan) => {
      if (
        plan.resourceId !== input.resourceId &&
        plan.resourceCategoryId !== input.resourceCategoryId
      ) return false;
      if (plan.membershipOnly && input.membershipKeys.length === 0) return false;
      if (
        plan.membershipHookKey &&
        !input.membershipKeys.includes(plan.membershipHookKey)
      ) return false;
      if (plan.groupPackage && !input.groupActive) return false;
      if (plan.effectiveFrom && input.now < plan.effectiveFrom) return false;
      if (plan.effectiveTo && input.now >= plan.effectiveTo) return false;
      const overnight = plan.startMinute != null && plan.endMinute != null &&
        plan.startMinute > plan.endMinute;
      const scheduleWeekday = overnight && local.minute < plan.endMinute!
        ? (local.weekday + 6) % 7
        : local.weekday;
      const scheduleDate = overnight && local.minute < plan.endMinute!
        ? local.previousDate
        : local.date;
      if (plan.weekdays.length && !plan.weekdays.includes(scheduleWeekday)) return false;
      if (plan.holidayDates.length && !plan.holidayDates.includes(scheduleDate)) return false;
      if (plan.startMinute != null && plan.endMinute != null) {
        if (plan.startMinute === plan.endMinute) return true;
        const inside = overnight
          ? local.minute >= plan.startMinute || local.minute < plan.endMinute
          : local.minute >= plan.startMinute && local.minute < plan.endMinute;
        if (!inside) return false;
      }
      return true;
    })
    .sort((a, b) =>
      Number(b.resourceId === input.resourceId) - Number(a.resourceId === input.resourceId) ||
      b.priority - a.priority ||
      b.createdAt.getTime() - a.createdAt.getTime(),
    )[0] ?? null;
}

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
      where: {
        id: session.id,
        shopId: session.shopId,
        version: expectedVersion,
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      const current = await tx.operationsSession.findFirst({
        where: { id: session.id, shopId: session.shopId },
        select: { version: true },
      });
      assertExpectedVersion(
        current?.version ?? expectedVersion + 1,
        expectedVersion,
        {
          aggregateType: 'operations_session',
          aggregateId: session.id,
        },
      );
    }
    return tx.operationsSession.findFirstOrThrow({
      where: { id: session.id, shopId: session.shopId },
    });
  }

  async floor(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const now = new Date();
    const [resources, sessions, maintenance, reservations] = await Promise.all([
      this.prisma.resource.findMany({
        where: { shopId },
        include: { category: true, section: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.operationsSession.findMany({
        where: { shopId, status: { in: OPEN_SESSION_STATES } },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.resourceMaintenancePeriod.findMany({
        where: { shopId, startsAt: { lte: now }, endsAt: null },
      }),
      this.prisma.reservation.findMany({
        where: {
          shopId,
          resourceId: { not: null },
          endsAt: { gt: now },
          status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    const sessionByResource = new Map(sessions.map((s) => [s.resourceId, s]));
    const maintenanceByResource = new Map(maintenance.map((m) => [m.resourceId, m]));
    const nextReservation = new Map<string, (typeof reservations)[number]>();
    for (const reservation of reservations) {
      if (reservation.resourceId && !nextReservation.has(reservation.resourceId)) {
        nextReservation.set(reservation.resourceId, reservation);
      }
    }

    return {
      generatedAt: now,
      resources: resources.map((resource) => {
        const session = sessionByResource.get(resource.id);
        const blocked = maintenanceByResource.get(resource.id);
        const reservation = nextReservation.get(resource.id);
        const liveAccruedMinor = session
          ? calculateAccruedMinor({
              ...session,
              endedAt: now,
              totalPausedSeconds:
                session.totalPausedSeconds +
                (session.status === 'PAUSED' && session.pausedAt
                  ? Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000))
                  : 0),
            })
          : 0;
        const state = resource.configurationState === ResourceConfigurationState.DISABLED
          ? 'DISABLED'
          : resource.configurationState === ResourceConfigurationState.OFFLINE_DEVICE
            ? 'OFFLINE_DEVICE'
            : resource.configurationState === ResourceConfigurationState.MAINTENANCE || blocked
              ? 'MAINTENANCE'
          : session?.status === 'PAUSED'
            ? 'PAUSED'
            : session
              ? 'OCCUPIED'
              : reservation && reservation.startsAt <= now
                ? 'RESERVED'
                : 'AVAILABLE';
        return {
          id: resource.id,
          code: resource.code,
          version: resource.version,
          name: resource.name,
          type: resource.type,
          categoryId: resource.categoryId,
          categoryName: resource.category?.name ?? null,
          sectionId: resource.sectionId,
          sectionName: resource.section?.name ?? null,
          capacity: resource.capacity,
          configurationState: resource.configurationState,
          placement: {
            x: resource.layoutX,
            y: resource.layoutY,
            width: resource.layoutWidth,
            height: resource.layoutHeight,
            rotation: resource.layoutRotation,
          },
          state,
          session: session ? { ...session, liveAccruedMinor } : null,
          maintenance: blocked ?? null,
          nextReservation: reservation ?? null,
        };
      }),
    };
  }

  async activity(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    return this.prisma.resourceStateEvent.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listRatePlans(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    return this.prisma.operationsRatePlan.findMany({
      where: { shopId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createRatePlan(actor: JwtAccessPayload, dto: CreateOperationsRatePlanDto) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    await this.validateRatePlan(shopId, dto);
    const billingMode = dto.billingMode ?? OperationsBillingMode.HOURLY;
    const hourlyRateMinor = dto.hourlyRateMinor ??
      (billingMode === OperationsBillingMode.HOURLY ? dto.unitPriceMinor ?? 0 : 0);
    const plan = await this.prisma.operationsRatePlan.create({
      data: {
        shopId,
        name: dto.name.trim(),
        resourceId: dto.resourceId,
        resourceCategoryId: dto.resourceCategoryId,
        billingMode,
        hourlyRateMinor,
        unitPriceMinor: dto.unitPriceMinor ?? hourlyRateMinor,
        overtimeRateMinor: dto.overtimeRateMinor,
        overtimeAfterMinutes: dto.overtimeAfterMinutes,
        roundingMinutes: dto.roundingMinutes ?? 1,
        minimumMinutes: dto.minimumMinutes ?? 0,
        fixedDurationMinutes: dto.fixedDurationMinutes,
        minimumChargeMinor: dto.minimumChargeMinor ?? 0,
        graceMinutes: dto.graceMinutes ?? 0,
        capMinor: dto.capMinor,
        membershipHookKey: dto.membershipHookKey,
        membershipOnly: dto.membershipOnly ?? false,
        happyHour: dto.happyHour ?? false,
        groupPackage: dto.groupPackage ?? false,
        weekdays: [...new Set(dto.weekdays ?? [])].sort(),
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
        holidayDates: [...new Set(dto.holidayDates ?? [])].sort(),
        priority: dto.priority ?? 0,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        active: dto.active ?? true,
      },
    });
    await this.record(actor, 'operations.rate-plan.create', `Created rate plan ${plan.name}`, { ratePlanId: plan.id });
    return plan;
  }

  async updateRatePlan(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateOperationsRatePlanDto,
  ) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const existing = await this.prisma.operationsRatePlan.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException('Rate plan not found.');
    const merged = {
      ...existing,
      ...dto,
      resourceId: dto.resourceId ?? existing.resourceId ?? undefined,
      resourceCategoryId:
        dto.resourceCategoryId ?? existing.resourceCategoryId ?? undefined,
    };
    await this.validateRatePlan(shopId, merged);
    const claimed = await this.prisma.operationsRatePlan.updateMany({
      where: { id, shopId, version: dto.expectedVersion },
      data: {
        version: { increment: 1 },
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.resourceId !== undefined && { resourceId: dto.resourceId }),
        ...(dto.resourceCategoryId !== undefined && {
          resourceCategoryId: dto.resourceCategoryId,
        }),
        ...(dto.billingMode != null && { billingMode: dto.billingMode }),
        ...(dto.hourlyRateMinor != null && { hourlyRateMinor: dto.hourlyRateMinor }),
        ...(dto.unitPriceMinor != null && { unitPriceMinor: dto.unitPriceMinor }),
        ...(dto.overtimeRateMinor !== undefined && { overtimeRateMinor: dto.overtimeRateMinor }),
        ...(dto.overtimeAfterMinutes !== undefined && { overtimeAfterMinutes: dto.overtimeAfterMinutes }),
        ...(dto.roundingMinutes != null && { roundingMinutes: dto.roundingMinutes }),
        ...(dto.minimumMinutes != null && { minimumMinutes: dto.minimumMinutes }),
        ...(dto.fixedDurationMinutes !== undefined && { fixedDurationMinutes: dto.fixedDurationMinutes }),
        ...(dto.minimumChargeMinor != null && { minimumChargeMinor: dto.minimumChargeMinor }),
        ...(dto.graceMinutes != null && { graceMinutes: dto.graceMinutes }),
        ...(dto.capMinor !== undefined && { capMinor: dto.capMinor }),
        ...(dto.membershipHookKey !== undefined && { membershipHookKey: dto.membershipHookKey }),
        ...(dto.membershipOnly != null && { membershipOnly: dto.membershipOnly }),
        ...(dto.happyHour != null && { happyHour: dto.happyHour }),
        ...(dto.groupPackage != null && { groupPackage: dto.groupPackage }),
        ...(dto.weekdays != null && { weekdays: [...new Set(dto.weekdays)].sort() }),
        ...(dto.startMinute !== undefined && { startMinute: dto.startMinute }),
        ...(dto.endMinute !== undefined && { endMinute: dto.endMinute }),
        ...(dto.holidayDates != null && { holidayDates: [...new Set(dto.holidayDates)].sort() }),
        ...(dto.priority != null && { priority: dto.priority }),
        ...(dto.effectiveFrom !== undefined && { effectiveFrom: new Date(dto.effectiveFrom) }),
        ...(dto.effectiveTo !== undefined && { effectiveTo: new Date(dto.effectiveTo) }),
        ...(dto.active != null && { active: dto.active }),
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Rate plan changed in another session. Reload and try again.');
    }
    const plan = await this.prisma.operationsRatePlan.findFirstOrThrow({
      where: { id, shopId },
    });
    await this.record(actor, 'operations.rate-plan.update', `Updated rate plan ${plan.name}`, { ratePlanId: plan.id });
    return plan;
  }

  async createGroup(actor: JwtAccessPayload, dto: CreateSessionGroupDto) {
    const shopId = requireShopId(actor);
    if (dto.guestCheckId) await this.requireGuestCheck(shopId, dto.guestCheckId);
    return this.prisma.sessionGroup.create({
      data: { shopId, name: dto.name, guestCheckId: dto.guestCheckId, createdById: actor.sub },
    });
  }

  async start(actor: JwtAccessPayload, dto: StartOperationsSessionDto) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:${dto.resourceId}`}))`;
      const resource = await tx.resource.findFirst({
        where: { id: dto.resourceId, shopId },
        include: { category: true },
      });
      if (!resource) throw new NotFoundException('Resource not found.');
      if (resource.configurationState !== ResourceConfigurationState.ENABLED) {
        throw new ConflictException(
          `Resource is ${resource.configurationState.toLowerCase().replace('_', ' ')}.`,
        );
      }
      const conflict = await tx.operationsSession.findFirst({
        where: { shopId, resourceId: resource.id, status: { in: OPEN_SESSION_STATES } },
      });
      if (conflict) throw new ConflictException('Resource already has an active session.');
      const blocked = await tx.resourceMaintenancePeriod.findFirst({
        where: { shopId, resourceId: resource.id, startsAt: { lte: now }, endsAt: null },
      });
      if (blocked) throw new ConflictException('Resource is blocked for maintenance.');
      if (dto.guestCheckId) await this.requireGuestCheck(shopId, dto.guestCheckId, tx);
      if (dto.groupId) {
        const group = await tx.sessionGroup.findFirst({ where: { id: dto.groupId, shopId } });
        if (!group) throw new NotFoundException('Session group not found.');
      }
      if (dto.reservationId) {
        const reservation = await tx.reservation.findFirst({ where: { id: dto.reservationId, shopId } });
        if (!reservation) throw new NotFoundException('Reservation not found.');
        if (reservation.resourceId && reservation.resourceId !== resource.id) {
          throw new ConflictException('Reservation belongs to another resource.');
        }
      }

      const membershipKeys = await this.resolveCustomerMembershipKeys(
        tx,
        shopId,
        dto.guestCheckId,
        now,
      );

      const shop = await tx.shop.findUnique({
        where: { id: shopId },
        select: { currency: true, timezone: true },
      });
      const candidates = await tx.operationsRatePlan.findMany({
        where: {
          shopId,
          active: true,
          OR: [
            { resourceId: resource.id },
            ...(resource.categoryId ? [{ resourceCategoryId: resource.categoryId }] : []),
          ],
        },
      });
      const eligible = dto.ratePlanId
        ? candidates.filter((candidate) => candidate.id === dto.ratePlanId)
        : candidates;
      if (dto.ratePlanId && eligible.length === 0) {
        throw new NotFoundException('Selected active rate plan was not found for this venue.');
      }
      const plan = resolveApplicableRatePlan(eligible, {
        now,
        timeZone: shop?.timezone ?? 'UTC',
        resourceId: resource.id,
        resourceCategoryId: resource.categoryId,
        membershipKeys,
        groupActive: Boolean(dto.groupId),
      });
      if (dto.ratePlanId && !plan) {
        throw new ConflictException('Selected rate plan is not applicable at this time.');
      }
      const hourlyRateMinor = plan?.hourlyRateMinor ?? Math.max(
        0,
        majorToMinor(resource.hourlyRate),
      );
      const billingMode = plan?.billingMode ?? OperationsBillingMode.HOURLY;
      const unitPriceMinor = plan?.unitPriceMinor ?? hourlyRateMinor;
      const rateSnapshot = {
        source: plan ? 'OPERATIONS_RATE_PLAN' : 'RESOURCE_HOURLY_RATE',
        planId: plan?.id ?? null,
        planName: plan?.name ?? null,
        resourceId: resource.id,
        resourceName: resource.name,
        resourceType: resource.type,
        capturedAt: now.toISOString(),
        hourlyRateMinor,
        billingMode,
        unitPriceMinor,
        fixedDurationMinutes: plan?.fixedDurationMinutes ?? null,
        minimumChargeMinor: plan?.minimumChargeMinor ?? 0,
        graceMinutes: plan?.graceMinutes ?? 0,
        participantCount: dto.participantCount ?? 1,
        gameCount: dto.gameCount ?? 1,
        overtimeRateMinor: plan?.overtimeRateMinor ?? null,
        overtimeAfterMinutes: plan?.overtimeAfterMinutes ?? null,
        roundingMinutes: plan?.roundingMinutes ?? 1,
        minimumMinutes: plan?.minimumMinutes ?? 0,
        capMinor: plan?.capMinor ?? null,
        membershipHookKey: plan?.membershipHookKey ?? null,
        membershipOnly: plan?.membershipOnly ?? false,
        membershipKeys,
        happyHour: plan?.happyHour ?? false,
        groupPackage: plan?.groupPackage ?? false,
        weekdays: plan?.weekdays ?? [],
        startMinute: plan?.startMinute ?? null,
        endMinute: plan?.endMinute ?? null,
        holidayDates: plan?.holidayDates ?? [],
        priority: plan?.priority ?? 0,
        venueTimezone: shop?.timezone ?? 'UTC',
      };
      const session = await tx.operationsSession.create({
        data: {
          shopId,
          resourceId: resource.id,
          groupId: dto.groupId,
          guestCheckId: dto.guestCheckId,
          reservationId: dto.reservationId,
          ratePlanId: plan?.id,
          startedAt: now,
          hourlyRateMinor,
          billingMode,
          unitPriceMinor,
          fixedDurationMinutes: plan?.fixedDurationMinutes,
          minimumChargeMinor: plan?.minimumChargeMinor ?? 0,
          graceMinutes: plan?.graceMinutes ?? 0,
          participantCount: dto.participantCount ?? 1,
          gameCount: dto.gameCount ?? 1,
          overtimeRateMinor: plan?.overtimeRateMinor,
          overtimeAfterMinutes: plan?.overtimeAfterMinutes,
          roundingMinutes: plan?.roundingMinutes ?? 1,
          minimumMinutes: plan?.minimumMinutes ?? 0,
          capMinor: plan?.capMinor,
          rateSnapshot: rateSnapshot as Prisma.InputJsonValue,
          currency: shop?.currency ?? 'EUR',
          createdById: actor.sub,
        },
      });
      await tx.sessionResourceLink.create({ data: { shopId, sessionId: session.id, resourceId: resource.id, actorUserId: actor.sub } });
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: resource.id, sessionId: session.id, fromState: 'AVAILABLE', toState: 'IN_USE', actorUserId: actor.sub } });
      if (dto.reservationId) {
        await tx.reservation.updateMany({ where: { id: dto.reservationId, shopId }, data: { status: 'CHECKED_IN', version: { increment: 1 } } });
      }
      return session;
    });
    await this.record(actor, 'operations.session.start', 'Started resource session', { sessionId: result.id, resourceId: result.resourceId });
    return result;
  }

  async pause(actor: JwtAccessPayload, id: string, dto: PauseOperationsSessionDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (session.status !== 'ACTIVE') throw new ConflictException('Only an active session can be paused.');
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.operationsSessionPause.create({ data: { shopId, sessionId: id, reason: dto.reason, startedAt: now, actorUserId: actor.sub } });
      const row = await this.mutateSessionVersioned(
        tx,
        session,
        dto.expectedVersion,
        { status: 'PAUSED', pausedAt: now },
      );
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: row.resourceId, sessionId: id, fromState: 'IN_USE', toState: 'PAUSED', reason: dto.reason, actorUserId: actor.sub } });
      return row;
    });
    await this.record(actor, 'operations.session.pause', 'Paused resource session', { sessionId: id, reason: dto.reason });
    return updated;
  }

  async resume(actor: JwtAccessPayload, id: string, dto: ExpectedOperationsSessionVersionDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (session.status !== 'PAUSED' || !session.pausedAt) throw new ConflictException('Only a paused session can be resumed.');
    const now = new Date();
    const pauseSeconds = Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000));
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.operationsSessionPause.updateMany({ where: { shopId, sessionId: id, endedAt: null }, data: { endedAt: now } });
      const row = await this.mutateSessionVersioned(
        tx,
        session,
        dto.expectedVersion,
        { status: 'ACTIVE', pausedAt: null, totalPausedSeconds: { increment: pauseSeconds } },
      );
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: row.resourceId, sessionId: id, fromState: 'PAUSED', toState: 'IN_USE', actorUserId: actor.sub } });
      return row;
    });
    await this.record(actor, 'operations.session.resume', 'Resumed resource session', { sessionId: id });
    return updated;
  }

  async move(actor: JwtAccessPayload, id: string, dto: MoveOperationsSessionDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (!OPEN_SESSION_STATES.includes(session.status)) throw new ConflictException('Finished sessions cannot move.');
    if (session.resourceId === dto.resourceId) return session;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:${dto.resourceId}`}))`;
      const target = await tx.resource.findFirst({ where: { id: dto.resourceId, shopId } });
      if (!target) throw new NotFoundException('Target resource not found.');
      if (target.configurationState !== ResourceConfigurationState.ENABLED) {
        throw new ConflictException('Target resource is not enabled.');
      }
      const targetConflict = await tx.operationsSession.findFirst({ where: { shopId, resourceId: target.id, status: { in: OPEN_SESSION_STATES } } });
      if (targetConflict) throw new ConflictException('Target resource is already in use.');
      const blocked = await tx.resourceMaintenancePeriod.findFirst({ where: { shopId, resourceId: target.id, startsAt: { lte: new Date() }, endsAt: null } });
      if (blocked) throw new ConflictException('Target resource is blocked for maintenance.');
      const now = new Date();
      await tx.sessionResourceLink.updateMany({ where: { shopId, sessionId: id, unlinkedAt: null }, data: { unlinkedAt: now } });
      await tx.sessionResourceLink.create({ data: { shopId, sessionId: id, resourceId: target.id, linkedAt: now, actorUserId: actor.sub } });
      const row = await this.mutateSessionVersioned(
        tx,
        session,
        dto.expectedVersion,
        { resourceId: target.id },
      );
      await tx.resourceStateEvent.createMany({ data: [
        { shopId, resourceId: session.resourceId, sessionId: id, fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE', toState: 'AVAILABLE', reason: 'MOVE', actorUserId: actor.sub },
        { shopId, resourceId: target.id, sessionId: id, fromState: 'AVAILABLE', toState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE', reason: 'MOVE', actorUserId: actor.sub },
      ] });
      return row;
    });
    await this.record(actor, 'operations.session.move', 'Moved resource session without changing its rate snapshot', { sessionId: id, fromResourceId: session.resourceId, toResourceId: dto.resourceId });
    return updated;
  }

  async finish(actor: JwtAccessPayload, id: string, dto: ExpectedOperationsSessionVersionDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (!OPEN_SESSION_STATES.includes(session.status)) throw new ConflictException('Session is already finished.');
    const now = new Date();
    const openPauseSeconds = session.status === 'PAUSED' && session.pausedAt
      ? Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000))
      : 0;
    const totalPausedSeconds = session.totalPausedSeconds + openPauseSeconds;
    const accruedMinor = calculateAccruedMinor({ ...session, endedAt: now, totalPausedSeconds });
    const updated = await this.prisma.$transaction(async (tx) => {
      if (openPauseSeconds) await tx.operationsSessionPause.updateMany({ where: { shopId, sessionId: id, endedAt: null }, data: { endedAt: now } });
      await tx.sessionResourceLink.updateMany({ where: { shopId, sessionId: id, unlinkedAt: null }, data: { unlinkedAt: now } });
      const row = await this.mutateSessionVersioned(
        tx,
        session,
        dto.expectedVersion,
        { status: 'FINISHED', finishedAt: now, pausedAt: null, totalPausedSeconds, accruedMinor },
      );
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: row.resourceId, sessionId: id, fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE', toState: 'AVAILABLE', actorUserId: actor.sub, metadata: { accruedMinor, currency: row.currency } } });
      return row;
    });
    await this.record(actor, 'operations.session.finish', 'Finished resource session', { sessionId: id, accruedMinor });
    return updated;
  }

  async attachGuestCheck(actor: JwtAccessPayload, id: string, dto: AttachGuestCheckDto) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    await this.requireGuestCheck(shopId, dto.guestCheckId);
    const row = await this.prisma.$transaction((tx) =>
      this.mutateSessionVersioned(tx, session, dto.expectedVersion, {
        guestCheckId: dto.guestCheckId,
      }),
    );
    await this.record(actor, 'operations.session.attach-check', 'Attached guest check to resource session', { sessionId: id, guestCheckId: dto.guestCheckId });
    return row;
  }

  async startMaintenance(actor: JwtAccessPayload, dto: CreateMaintenanceDto) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'resource');
    const resource = await this.prisma.resource.findFirst({ where: { id: dto.resourceId, shopId } });
    if (!resource) throw new NotFoundException('Resource not found.');
    const active = await this.prisma.operationsSession.findFirst({ where: { shopId, resourceId: dto.resourceId, status: { in: OPEN_SESSION_STATES } } });
    if (active) throw new ConflictException('Finish or move the active session before maintenance.');
    const existing = await this.prisma.resourceMaintenancePeriod.findFirst({ where: { shopId, resourceId: dto.resourceId, endsAt: null } });
    if (existing) throw new ConflictException('Resource is already in maintenance.');
    const row = await this.prisma.$transaction(async (tx) => {
      const period = await tx.resourceMaintenancePeriod.create({ data: { shopId, resourceId: dto.resourceId, reason: dto.reason, actorUserId: actor.sub } });
      await tx.resource.update({
        where: { id: dto.resourceId },
        data: {
          status: 'MAINTENANCE',
          configurationState: ResourceConfigurationState.MAINTENANCE,
          version: { increment: 1 },
        },
      });
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: dto.resourceId, fromState: 'AVAILABLE', toState: 'MAINTENANCE', reason: dto.reason, actorUserId: actor.sub } });
      return period;
    });
    await this.record(actor, 'operations.maintenance.start', 'Blocked resource for maintenance', { maintenanceId: row.id, resourceId: dto.resourceId });
    return row;
  }

  async finishMaintenance(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const period = await this.prisma.resourceMaintenancePeriod.findFirst({ where: { id, shopId, endsAt: null } });
    if (!period) throw new NotFoundException('Active maintenance period not found.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.resourceMaintenancePeriod.update({ where: { id }, data: { endsAt: now } });
      await tx.resource.update({
        where: { id: period.resourceId },
        data: {
          status: 'AVAILABLE',
          configurationState: ResourceConfigurationState.ENABLED,
          version: { increment: 1 },
        },
      });
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: period.resourceId, fromState: 'MAINTENANCE', toState: 'AVAILABLE', actorUserId: actor.sub } });
    });
    await this.record(actor, 'operations.maintenance.finish', 'Returned resource to service', { maintenanceId: id, resourceId: period.resourceId });
    return { ok: true };
  }

  private async validateRatePlan(
    shopId: string,
    dto: Partial<Omit<CreateOperationsRatePlanDto, 'effectiveFrom' | 'effectiveTo'>> & {
      resourceId?: string | null;
      resourceCategoryId?: string | null;
      effectiveFrom?: string | Date | null;
      effectiveTo?: string | Date | null;
    },
  ) {
    if (Boolean(dto.resourceId) === Boolean(dto.resourceCategoryId)) {
      throw new BadRequestException(
        'Rate plan must target exactly one resource or resource category.',
      );
    }
    if ((dto.startMinute == null) !== (dto.endMinute == null)) {
      throw new BadRequestException(
        'Rate time window requires both startMinute and endMinute.',
      );
    }
    if (
      dto.effectiveFrom &&
      dto.effectiveTo &&
      new Date(dto.effectiveFrom) >= new Date(dto.effectiveTo)
    ) {
      throw new BadRequestException('Rate effectiveFrom must be before effectiveTo.');
    }
    if (
      dto.holidayDates?.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))
    ) {
      throw new BadRequestException('Holiday dates must use YYYY-MM-DD.');
    }
    const mode = dto.billingMode ?? OperationsBillingMode.HOURLY;
    const authoritativePrice = dto.unitPriceMinor ?? dto.hourlyRateMinor ?? 0;
    if (mode !== OperationsBillingMode.FREE && authoritativePrice <= 0) {
      throw new BadRequestException(
        'Non-free rates require a positive authoritative unit price.',
      );
    }
    if (
      dto.capMinor != null &&
      dto.minimumChargeMinor != null &&
      dto.capMinor < dto.minimumChargeMinor
    ) {
      throw new BadRequestException('Rate cap cannot be lower than minimum charge.');
    }
    if (
      mode === OperationsBillingMode.FIXED_DURATION &&
      !dto.fixedDurationMinutes
    ) {
      throw new BadRequestException('Fixed-duration rates require fixedDurationMinutes.');
    }
    if (dto.resourceId) {
      const resource = await this.prisma.resource.findFirst({
        where: { id: dto.resourceId, shopId },
        select: { id: true },
      });
      if (!resource) throw new NotFoundException('Rate target resource not found.');
    }
    if (dto.resourceCategoryId) {
      const category = await this.prisma.resourceCategory.findFirst({
        where: { id: dto.resourceCategoryId, shopId },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Rate target category not found.');
    }
  }

  private async resolveCustomerMembershipKeys(
    tx: Prisma.TransactionClient,
    shopId: string,
    guestCheckId: string | undefined,
    now: Date,
  ): Promise<string[]> {
    if (!guestCheckId) return [];
    const guestCheck = await tx.guestCheck.findFirst({
      where: { id: guestCheckId, shopId },
      select: { guestEmail: true, guestPhone: true },
    });
    if (!guestCheck?.guestEmail && !guestCheck?.guestPhone) return [];
    const customer = await tx.customerProfile.findFirst({
      where: {
        shopId,
        OR: [
          ...(guestCheck.guestEmail ? [{ email: guestCheck.guestEmail }] : []),
          ...(guestCheck.guestPhone ? [{ phone: guestCheck.guestPhone }] : []),
        ],
      },
      select: { id: true },
    });
    if (!customer) return [];
    const membership = await tx.customerMembership.findFirst({
      where: {
        shopId,
        customerId: customer.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { tierId: true },
    });
    if (!membership) return [];
    const tier = await tx.membershipTier.findFirst({
      where: { id: membership.tierId, shopId, active: true },
      select: { code: true },
    });
    return tier ? ['ACTIVE', tier.code] : [];
  }

  private async requireSession(shopId: string, id: string) {
    const session = await this.prisma.operationsSession.findFirst({ where: { id, shopId } });
    if (!session) throw new NotFoundException('Operations session not found.');
    return session;
  }

  private async requireGuestCheck(shopId: string, id: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const check = await db.guestCheck.findFirst({ where: { id, shopId } });
    if (!check) throw new NotFoundException('Guest check not found.');
    return check;
  }

  private record(actor: JwtAccessPayload, action: string, summary: string, meta: Record<string, unknown>) {
    return this.audit.record(actor, { section: 'operations', action, summary, meta });
  }
}
