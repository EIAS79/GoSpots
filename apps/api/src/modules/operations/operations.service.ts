import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResourceStatus } from '@prisma/client';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  AttachGuestCheckDto,
  CreateMaintenanceDto,
  CreateOperationsRatePlanDto,
  CreateSessionGroupDto,
  MoveOperationsSessionDto,
  PauseOperationsSessionDto,
  StartOperationsSessionDto,
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
};

export function calculateAccruedMinor(input: RateInput): number {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((input.endedAt.getTime() - input.startedAt.getTime()) / 1000) -
      Math.max(0, input.totalPausedSeconds),
  );
  const rawMinutes = Math.ceil(elapsedSeconds / 60);
  const rounding = Math.max(1, input.roundingMinutes || 1);
  let billableMinutes = Math.max(
    Math.max(0, input.minimumMinutes),
    Math.ceil(rawMinutes / rounding) * rounding,
  );
  if (elapsedSeconds === 0 && input.minimumMinutes === 0) billableMinutes = 0;

  const overtimeAfter = input.overtimeAfterMinutes ?? null;
  const baseMinutes = overtimeAfter == null
    ? billableMinutes
    : Math.min(billableMinutes, Math.max(0, overtimeAfter));
  const overtimeMinutes = overtimeAfter == null
    ? 0
    : Math.max(0, billableMinutes - Math.max(0, overtimeAfter));
  const base = Math.round((baseMinutes * input.hourlyRateMinor) / 60);
  const overtimeRate = input.overtimeRateMinor ?? input.hourlyRateMinor;
  const overtime = Math.round((overtimeMinutes * overtimeRate) / 60);
  const total = base + overtime;
  return input.capMinor == null ? total : Math.min(total, input.capMinor);
}

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async floor(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
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
        const state = blocked
          ? 'MAINTENANCE'
          : session?.status === 'PAUSED'
            ? 'PAUSED'
            : session
              ? 'IN_USE'
              : reservation && reservation.startsAt <= now
                ? 'RESERVED'
                : 'AVAILABLE';
        return {
          id: resource.id,
          name: resource.name,
          type: resource.type,
          categoryId: resource.categoryId,
          categoryName: resource.category?.name ?? null,
          sectionId: resource.sectionId,
          sectionName: resource.section?.name ?? null,
          capacity: resource.capacity,
          state,
          session: session ? { ...session, liveAccruedMinor } : null,
          maintenance: blocked ?? null,
          nextReservation: reservation ?? null,
        };
      }),
    };
  }

  activity(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    return this.prisma.resourceStateEvent.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  listRatePlans(actor: JwtAccessPayload) {
    return this.prisma.operationsRatePlan.findMany({
      where: { shopId: requireShopId(actor) },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createRatePlan(actor: JwtAccessPayload, dto: CreateOperationsRatePlanDto) {
    const shopId = requireShopId(actor);
    if (!dto.resourceId && !dto.resourceCategoryId) {
      throw new BadRequestException('Rate plan must target a resource or resource category.');
    }
    const plan = await this.prisma.operationsRatePlan.create({
      data: {
        shopId,
        ...dto,
        roundingMinutes: dto.roundingMinutes ?? 1,
        minimumMinutes: dto.minimumMinutes ?? 0,
        active: dto.active ?? true,
      },
    });
    await this.record(actor, 'operations.rate-plan.create', `Created rate plan ${plan.name}`, { ratePlanId: plan.id });
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
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:${dto.resourceId}`}))`;
      const resource = await tx.resource.findFirst({
        where: { id: dto.resourceId, shopId },
        include: { category: true },
      });
      if (!resource) throw new NotFoundException('Resource not found.');
      if (resource.status === ResourceStatus.MAINTENANCE) {
        throw new ConflictException('Resource is in maintenance.');
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

      let plan = dto.ratePlanId
        ? await tx.operationsRatePlan.findFirst({ where: { id: dto.ratePlanId, shopId, active: true } })
        : null;
      if (dto.ratePlanId && !plan) {
        throw new NotFoundException('Selected active rate plan was not found for this venue.');
      }
      if (plan && plan.resourceId !== resource.id && plan.resourceCategoryId !== resource.categoryId) {
        throw new ConflictException('Selected rate plan does not apply to this resource.');
      }
      if (!dto.ratePlanId) {
        plan = await tx.operationsRatePlan.findFirst({
          where: {
            shopId,
            active: true,
            OR: [
              { resourceId: resource.id },
              ...(resource.categoryId ? [{ resourceCategoryId: resource.categoryId }] : []),
            ],
          },
          orderBy: [{ resourceId: 'desc' }, { createdAt: 'desc' }],
        });
      }
      const hourlyRateMinor = plan?.hourlyRateMinor ?? Math.max(0, Math.round(Number(resource.hourlyRate ?? 0) * 100));
      const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { currency: true } });
      const rateSnapshot = {
        source: plan ? 'OPERATIONS_RATE_PLAN' : 'RESOURCE_HOURLY_RATE',
        planId: plan?.id ?? null,
        planName: plan?.name ?? null,
        resourceId: resource.id,
        resourceName: resource.name,
        resourceType: resource.type,
        capturedAt: now.toISOString(),
        hourlyRateMinor,
        overtimeRateMinor: plan?.overtimeRateMinor ?? null,
        overtimeAfterMinutes: plan?.overtimeAfterMinutes ?? null,
        roundingMinutes: plan?.roundingMinutes ?? 1,
        minimumMinutes: plan?.minimumMinutes ?? 0,
        capMinor: plan?.capMinor ?? null,
        membershipHookKey: plan?.membershipHookKey ?? null,
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
        await tx.reservation.updateMany({ where: { id: dto.reservationId, shopId }, data: { status: 'CHECKED_IN' } });
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
      const row = await tx.operationsSession.update({ where: { id }, data: { status: 'PAUSED', pausedAt: now, version: { increment: 1 } } });
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: row.resourceId, sessionId: id, fromState: 'IN_USE', toState: 'PAUSED', reason: dto.reason, actorUserId: actor.sub } });
      return row;
    });
    await this.record(actor, 'operations.session.pause', 'Paused resource session', { sessionId: id, reason: dto.reason });
    return updated;
  }

  async resume(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    const session = await this.requireSession(shopId, id);
    if (session.status !== 'PAUSED' || !session.pausedAt) throw new ConflictException('Only a paused session can be resumed.');
    const now = new Date();
    const pauseSeconds = Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000));
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.operationsSessionPause.updateMany({ where: { shopId, sessionId: id, endedAt: null }, data: { endedAt: now } });
      const row = await tx.operationsSession.update({ where: { id }, data: { status: 'ACTIVE', pausedAt: null, totalPausedSeconds: { increment: pauseSeconds }, version: { increment: 1 } } });
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
      if (target.status === ResourceStatus.MAINTENANCE) throw new ConflictException('Target resource is in maintenance.');
      const targetConflict = await tx.operationsSession.findFirst({ where: { shopId, resourceId: target.id, status: { in: OPEN_SESSION_STATES } } });
      if (targetConflict) throw new ConflictException('Target resource is already in use.');
      const blocked = await tx.resourceMaintenancePeriod.findFirst({ where: { shopId, resourceId: target.id, startsAt: { lte: new Date() }, endsAt: null } });
      if (blocked) throw new ConflictException('Target resource is blocked for maintenance.');
      const now = new Date();
      await tx.sessionResourceLink.updateMany({ where: { shopId, sessionId: id, unlinkedAt: null }, data: { unlinkedAt: now } });
      await tx.sessionResourceLink.create({ data: { shopId, sessionId: id, resourceId: target.id, linkedAt: now, actorUserId: actor.sub } });
      const row = await tx.operationsSession.update({ where: { id }, data: { resourceId: target.id, version: { increment: 1 } } });
      await tx.resourceStateEvent.createMany({ data: [
        { shopId, resourceId: session.resourceId, sessionId: id, fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE', toState: 'AVAILABLE', reason: 'MOVE', actorUserId: actor.sub },
        { shopId, resourceId: target.id, sessionId: id, fromState: 'AVAILABLE', toState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE', reason: 'MOVE', actorUserId: actor.sub },
      ] });
      return row;
    });
    await this.record(actor, 'operations.session.move', 'Moved resource session without changing its rate snapshot', { sessionId: id, fromResourceId: session.resourceId, toResourceId: dto.resourceId });
    return updated;
  }

  async finish(actor: JwtAccessPayload, id: string) {
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
      const row = await tx.operationsSession.update({ where: { id }, data: { status: 'FINISHED', finishedAt: now, pausedAt: null, totalPausedSeconds, accruedMinor, version: { increment: 1 } } });
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: row.resourceId, sessionId: id, fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE', toState: 'AVAILABLE', actorUserId: actor.sub, metadata: { accruedMinor, currency: row.currency } } });
      return row;
    });
    await this.record(actor, 'operations.session.finish', 'Finished resource session', { sessionId: id, accruedMinor });
    return updated;
  }

  async attachGuestCheck(actor: JwtAccessPayload, id: string, dto: AttachGuestCheckDto) {
    const shopId = requireShopId(actor);
    await this.requireSession(shopId, id);
    await this.requireGuestCheck(shopId, dto.guestCheckId);
    const row = await this.prisma.operationsSession.update({ where: { id }, data: { guestCheckId: dto.guestCheckId, version: { increment: 1 } } });
    await this.record(actor, 'operations.session.attach-check', 'Attached guest check to resource session', { sessionId: id, guestCheckId: dto.guestCheckId });
    return row;
  }

  async startMaintenance(actor: JwtAccessPayload, dto: CreateMaintenanceDto) {
    const shopId = requireShopId(actor);
    const resource = await this.prisma.resource.findFirst({ where: { id: dto.resourceId, shopId } });
    if (!resource) throw new NotFoundException('Resource not found.');
    const active = await this.prisma.operationsSession.findFirst({ where: { shopId, resourceId: dto.resourceId, status: { in: OPEN_SESSION_STATES } } });
    if (active) throw new ConflictException('Finish or move the active session before maintenance.');
    const existing = await this.prisma.resourceMaintenancePeriod.findFirst({ where: { shopId, resourceId: dto.resourceId, endsAt: null } });
    if (existing) throw new ConflictException('Resource is already in maintenance.');
    const row = await this.prisma.$transaction(async (tx) => {
      const period = await tx.resourceMaintenancePeriod.create({ data: { shopId, resourceId: dto.resourceId, reason: dto.reason, actorUserId: actor.sub } });
      await tx.resource.update({ where: { id: dto.resourceId }, data: { status: ResourceStatus.MAINTENANCE } });
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
      await tx.resource.update({ where: { id: period.resourceId }, data: { status: ResourceStatus.AVAILABLE } });
      await tx.resourceStateEvent.create({ data: { shopId, resourceId: period.resourceId, fromState: 'MAINTENANCE', toState: 'AVAILABLE', actorUserId: actor.sub } });
    });
    await this.record(actor, 'operations.maintenance.finish', 'Returned resource to service', { maintenanceId: id, resourceId: period.resourceId });
    return { ok: true };
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
