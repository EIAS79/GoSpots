import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResourceStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import type { OrderLineInputDto } from '../ordering/dto/ordering.dto';
import { OrderingPricingService } from '../ordering/ordering-pricing.service';
import { calculateAccruedMinor } from '../operations/operations.service';
import type {
  ApplyOfflineOperationDto,
  OfflineOperationType,
} from './dto/offline-operation.dto';

const RECEIPT_SCOPE = 'offline.sync.v1';
const OPEN_SESSION_STATES = ['ACTIVE', 'PAUSED'];
const SERVICE_MODES = new Set([
  'QUICK_SALE',
  'GUEST_CHECK',
  'DINING',
  'PLAY_SESSION',
  'TAKEAWAY',
  'PREORDER',
  'EVENT',
]);

type SyncResult = { entityId: string; version: number; status: string };

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function trimmedString(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string`);
  const next = value.trim();
  if (next.length > max) throw new BadRequestException(`${field} is too long`);
  return next || null;
}

function requiredString(value: unknown, field: string, max = 160): string {
  const next = trimmedString(value, field, max);
  if (!next) throw new BadRequestException(`${field} is required`);
  return next;
}

function optionalPartySize(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new BadRequestException('partySize must be an integer from 1 to 100');
  }
  return Number(value);
}

function optionalPositiveInt(value: unknown, field: string, max = 999): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > max) {
    throw new BadRequestException(`${field} must be an integer from 1 to ${max}`);
  }
  return Number(value);
}

function operationDate(dto: ApplyOfflineOperationDto): Date {
  const value = new Date(dto.occurredAt);
  if (Number.isNaN(value.getTime())) throw new BadRequestException('occurredAt is invalid');
  if (value.getTime() > Date.now() + 5 * 60_000) {
    throw new BadRequestException('occurredAt cannot be more than five minutes in the future');
  }
  return value;
}

function orderLines(payload: Record<string, unknown>): OrderLineInputDto[] {
  if (!Array.isArray(payload.lines) || payload.lines.length < 1 || payload.lines.length > 100) {
    throw new BadRequestException('Offline order requires between 1 and 100 lines');
  }
  return payload.lines.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException(`lines[${index}] must be an object`);
    }
    const line = raw as Record<string, unknown>;
    const modifierIds = line.modifierIds === undefined
      ? undefined
      : Array.isArray(line.modifierIds) && line.modifierIds.every((id) => typeof id === 'string')
        ? [...new Set(line.modifierIds as string[])]
        : (() => { throw new BadRequestException(`lines[${index}].modifierIds must be strings`); })();
    return {
      menuItemId: requiredString(line.menuItemId, `lines[${index}].menuItemId`),
      variantId: trimmedString(line.variantId, `lines[${index}].variantId`, 160) ?? undefined,
      modifierIds,
      quantity: optionalPositiveInt(line.quantity, `lines[${index}].quantity`) ?? 1,
      seat: optionalPositiveInt(line.seat, `lines[${index}].seat`) ?? undefined,
    };
  });
}

@Injectable()
export class OfflineSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly orderingPricing: OrderingPricingService,
  ) {}

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.TRANSACTION_WRITE)) return;
    throw new ForbiddenException('Missing transaction.write');
  }

  private async requireEnabled(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'offline_lite'))) {
      throw new ForbiddenException('Offline Lite is not enabled for this venue');
    }
  }

  private async requireEdgeEnabled(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'edge_hub'))) {
      throw new ForbiddenException('Edge Hub is not enabled for this venue');
    }
  }

  private validateHash(dto: ApplyOfflineOperationDto) {
    const calculated = sha256(canonicalJson(dto.payload));
    if (dto.payloadHash.toLowerCase() !== calculated) {
      throw new BadRequestException('Offline operation payloadHash does not match payload');
    }
    return sha256(
      canonicalJson({
        deviceId: dto.deviceId,
        operationType: dto.operationType,
        entityId: dto.entityId,
        expectedVersion: dto.expectedVersion ?? null,
        occurredAt: dto.occurredAt,
        payloadHash: calculated,
      }),
    );
  }

  private async recordOfflineAudit(
    tx: Prisma.TransactionClient,
    shopId: string,
    createdById: string | null,
    action: string,
    summary: string,
    meta: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        shopId,
        userId: createdById?.startsWith('edge:') ? null : createdById,
        section: 'operations',
        action,
        summary,
        actorName: createdById?.startsWith('edge:') ? 'GoSpots Edge' : null,
        meta: JSON.stringify({ ...meta, source: 'OFFLINE_LITE_REPLAY' }),
      },
    });
  }

  private async requireOpenCheck(
    tx: Prisma.TransactionClient,
    shopId: string,
    guestCheckId: string,
  ) {
    const check = await tx.guestCheck.findFirst({
      where: { id: guestCheckId, shopId },
      select: { id: true, status: true, currentSettlementId: true },
    });
    if (!check) throw new NotFoundException('Guest check not found');
    if (check.status !== 'OPEN' || check.currentSettlementId) {
      throw apiConflictException(
        ApiDomainErrorCode.STATE_CONFLICT,
        'Guest check is no longer safe for offline changes',
        { guestCheckId, status: check.status, currentSettlementId: check.currentSettlementId },
      );
    }
    return check;
  }

  private async applyCheckCreate(
    tx: Prisma.TransactionClient,
    shopId: string,
    createdById: string | null,
    dto: ApplyOfflineOperationDto,
  ): Promise<SyncResult> {
    if (dto.expectedVersion !== undefined) {
      throw new BadRequestException('CHECK_CREATE must not include expectedVersion');
    }
    const p = dto.payload;
    const existing = await tx.guestCheck.findFirst({
      where: { id: dto.entityId, shopId },
      select: { id: true, version: true, status: true },
    });
    if (existing) return { entityId: existing.id, version: existing.version, status: existing.status };

    const shop = await tx.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    if (!shop) throw new BadRequestException('Venue not found');

    const created = await tx.guestCheck.create({
      data: {
        id: dto.entityId,
        shopId,
        status: 'OPEN',
        guestName: trimmedString(p.guestName, 'guestName', 120),
        guestEmail: trimmedString(p.guestEmail, 'guestEmail', 160),
        guestPhone: trimmedString(p.guestPhone, 'guestPhone', 60),
        label: trimmedString(p.label, 'label', 120),
        note: trimmedString(p.note, 'note', 500),
        partySize: optionalPartySize(p.partySize) ?? 1,
        currency: shop.currency,
        createdById,
        openedAt: operationDate(dto),
      },
      select: { id: true, version: true, status: true },
    });
    await this.recordOfflineAudit(tx, shopId, createdById, 'offline.check.create', 'Replayed offline GuestCheck creation', { checkId: created.id, operationId: dto.operationId });
    return { entityId: created.id, version: created.version, status: created.status };
  }

  private async applyCheckUpdate(
    tx: Prisma.TransactionClient,
    shopId: string,
    createdById: string | null,
    dto: ApplyOfflineOperationDto,
  ): Promise<SyncResult> {
    if (!dto.expectedVersion) {
      throw new BadRequestException('CHECK_UPDATE requires expectedVersion');
    }
    const current = await tx.guestCheck.findFirst({
      where: { id: dto.entityId, shopId },
      select: {
        id: true,
        version: true,
        status: true,
        currentSettlementId: true,
      },
    });
    if (!current) throw new BadRequestException('Guest check not found');
    if (current.status !== 'OPEN') {
      throw apiConflictException(
        ApiDomainErrorCode.STATE_CONFLICT,
        'Guest check is no longer open',
        { entityId: dto.entityId, status: current.status, currentVersion: current.version },
      );
    }
    if (current.currentSettlementId) {
      throw apiConflictException(
        ApiDomainErrorCode.STATE_CONFLICT,
        'Guest check settlement already started; offline edits cannot change it',
        {
          entityId: dto.entityId,
          currentVersion: current.version,
          currentSettlementId: current.currentSettlementId,
        },
      );
    }
    if (current.version !== dto.expectedVersion) {
      throw apiConflictException(
        ApiDomainErrorCode.VERSION_CONFLICT,
        'Guest check changed while this device was offline',
        {
          entityId: dto.entityId,
          expectedVersion: dto.expectedVersion,
          currentVersion: current.version,
        },
      );
    }

    const p = dto.payload;
    const data: Prisma.GuestCheckUpdateManyMutationInput = {
      version: { increment: 1 },
    };
    if ('guestName' in p) data.guestName = trimmedString(p.guestName, 'guestName', 120);
    if ('guestEmail' in p) data.guestEmail = trimmedString(p.guestEmail, 'guestEmail', 160);
    if ('guestPhone' in p) data.guestPhone = trimmedString(p.guestPhone, 'guestPhone', 60);
    if ('label' in p) data.label = trimmedString(p.label, 'label', 120);
    if ('note' in p) data.note = trimmedString(p.note, 'note', 500);
    if ('partySize' in p) data.partySize = optionalPartySize(p.partySize);

    const updated = await tx.guestCheck.updateMany({
      where: {
        id: dto.entityId,
        shopId,
        status: 'OPEN',
        version: dto.expectedVersion,
        currentSettlementId: null,
      },
      data,
    });
    if (updated.count !== 1) {
      throw apiConflictException(
        ApiDomainErrorCode.VERSION_CONFLICT,
        'Guest check changed while this offline operation was replaying',
        { entityId: dto.entityId, expectedVersion: dto.expectedVersion },
      );
    }
    await this.recordOfflineAudit(tx, shopId, createdById, 'offline.check.update', 'Replayed offline GuestCheck update', { checkId: dto.entityId, operationId: dto.operationId });
    return {
      entityId: dto.entityId,
      version: dto.expectedVersion + 1,
      status: 'OPEN',
    };
  }

  private async applyOrderCreate(
    tx: Prisma.TransactionClient,
    shopId: string,
    createdById: string | null,
    dto: ApplyOfflineOperationDto,
  ): Promise<SyncResult> {
    if (dto.expectedVersion !== undefined) {
      throw new BadRequestException('ORDER_CREATE must not include expectedVersion');
    }
    const existing = await tx.venueOrder.findFirst({ where: { id: dto.entityId, shopId } });
    if (existing) return { entityId: existing.id, version: 1, status: existing.status };

    const p = dto.payload;
    const serviceMode = requiredString(p.serviceMode, 'serviceMode', 40).toUpperCase();
    if (!SERVICE_MODES.has(serviceMode)) throw new BadRequestException('Unsupported order serviceMode');
    let guestCheckId = trimmedString(p.guestCheckId, 'guestCheckId', 160);
    const operationsSessionId = trimmedString(p.operationsSessionId, 'operationsSessionId', 160);
    let resourceId = trimmedString(p.resourceId, 'resourceId', 160);
    if (operationsSessionId) {
      const session = await tx.operationsSession.findFirst({
        where: { id: operationsSessionId, shopId, status: { in: OPEN_SESSION_STATES } },
      });
      if (!session) {
        throw apiConflictException(ApiDomainErrorCode.RESOURCE_CONFLICT, 'Active play session is unavailable for this offline order', { operationsSessionId });
      }
      guestCheckId = guestCheckId ?? session.guestCheckId;
      resourceId = resourceId ?? session.resourceId;
    }
    if (guestCheckId) await this.requireOpenCheck(tx, shopId, guestCheckId);

    const lines = orderLines(p);
    const priced = await Promise.all(lines.map((line) => this.orderingPricing.priceLine(shopId, line, tx)));
    const subtotalMinor = priced.reduce((sum, line) => sum + line.subtotalMinor, 0);
    const taxMinor = priced.reduce((sum, line) => sum + line.taxMinor, 0);
    const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { currency: true } });
    if (!shop) throw new BadRequestException('Venue not found');

    const row = await tx.venueOrder.create({
      data: {
        id: dto.entityId,
        shopId,
        guestCheckId,
        operationsSessionId,
        resourceId,
        serviceMode,
        seat: optionalPositiveInt(p.seat, 'seat'),
        guestLabel: trimmedString(p.guestLabel, 'guestLabel', 120),
        currency: shop.currency,
        subtotalMinor,
        taxMinor,
        totalMinor: subtotalMinor + taxMinor,
        createdById,
        createdAt: operationDate(dto),
      },
    });
    for (const line of priced) {
      const created = await tx.venueOrderLine.create({
        data: {
          shopId,
          orderId: row.id,
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          quantity: line.quantity,
          seat: line.seat,
          nameSnapshot: line.nameSnapshot,
          variantNameSnapshot: line.variantNameSnapshot,
          unitBaseMinor: line.unitBaseMinor,
          variantMinor: line.variantMinor,
          modifierMinor: line.modifierMinor,
          unitPriceMinor: line.unitPriceMinor,
          taxCategorySnapshot: line.taxCategorySnapshot,
          taxRateBps: line.taxRateBps,
          taxMinor: line.taxMinor,
          totalMinor: line.totalMinor,
          priceSnapshot: line.priceSnapshot,
        },
      });
      if (line.modifiers.length) {
        await tx.orderLineModifier.createMany({
          data: line.modifiers.map((modifier) => ({
            shopId,
            orderLineId: created.id,
            modifierId: modifier.id,
            nameSnapshot: modifier.name,
            priceDeltaMinor: modifier.priceDeltaMinor,
          })),
        });
      }
    }
    await this.recordOfflineAudit(tx, shopId, createdById, 'offline.order.create', 'Replayed offline order with server-authoritative pricing', { orderId: row.id, operationId: dto.operationId, totalMinor: row.totalMinor });
    return { entityId: row.id, version: 1, status: row.status };
  }

  private async applySessionStart(
    tx: Prisma.TransactionClient,
    shopId: string,
    createdById: string | null,
    dto: ApplyOfflineOperationDto,
  ): Promise<SyncResult> {
    if (dto.expectedVersion !== undefined) {
      throw new BadRequestException('SESSION_START must not include expectedVersion');
    }
    const existing = await tx.operationsSession.findFirst({ where: { id: dto.entityId, shopId } });
    if (existing) return { entityId: existing.id, version: existing.version, status: existing.status };

    const p = dto.payload;
    const resourceId = requiredString(p.resourceId, 'resourceId');
    const guestCheckId = trimmedString(p.guestCheckId, 'guestCheckId', 160);
    const groupId = trimmedString(p.groupId, 'groupId', 160);
    const reservationId = trimmedString(p.reservationId, 'reservationId', 160);
    const ratePlanId = trimmedString(p.ratePlanId, 'ratePlanId', 160);
    const startedAt = operationDate(dto);

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${shopId}:${resourceId}`}))`;
    const resource = await tx.resource.findFirst({
      where: { id: resourceId, shopId },
      include: { category: true },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.status === ResourceStatus.MAINTENANCE) {
      throw apiConflictException(ApiDomainErrorCode.RESOURCE_CONFLICT, 'Resource is in maintenance', { resourceId });
    }
    const active = await tx.operationsSession.findFirst({
      where: { shopId, resourceId, status: { in: OPEN_SESSION_STATES } },
    });
    if (active) {
      throw apiConflictException(ApiDomainErrorCode.RESOURCE_CONFLICT, 'Resource changed while this device was offline', { resourceId, conflictingSessionId: active.id });
    }
    const maintenance = await tx.resourceMaintenancePeriod.findFirst({
      where: { shopId, resourceId, endsAt: null },
    });
    if (maintenance) {
      throw apiConflictException(ApiDomainErrorCode.RESOURCE_CONFLICT, 'Resource is blocked for maintenance', { resourceId, maintenanceId: maintenance.id });
    }
    if (guestCheckId) await this.requireOpenCheck(tx, shopId, guestCheckId);
    if (groupId) {
      const group = await tx.sessionGroup.findFirst({ where: { id: groupId, shopId } });
      if (!group) throw new NotFoundException('Session group not found');
    }
    if (reservationId) {
      const reservation = await tx.reservation.findFirst({ where: { id: reservationId, shopId } });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (reservation.resourceId && reservation.resourceId !== resource.id) {
        throw apiConflictException(ApiDomainErrorCode.RESOURCE_CONFLICT, 'Reservation belongs to another resource', { reservationId, resourceId });
      }
    }

    let plan = ratePlanId
      ? await tx.operationsRatePlan.findFirst({ where: { id: ratePlanId, shopId, active: true } })
      : null;
    if (ratePlanId && !plan) throw new NotFoundException('Selected active rate plan not found');
    if (plan && plan.resourceId !== resource.id && plan.resourceCategoryId !== resource.categoryId) {
      throw apiConflictException(ApiDomainErrorCode.RESOURCE_CONFLICT, 'Selected rate plan does not apply to this resource', { ratePlanId, resourceId });
    }
    if (!ratePlanId) {
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
    if (!shop) throw new BadRequestException('Venue not found');
    const rateSnapshot = {
      source: plan ? 'OPERATIONS_RATE_PLAN' : 'RESOURCE_HOURLY_RATE',
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      resourceId: resource.id,
      resourceName: resource.name,
      resourceType: resource.type,
      capturedAt: startedAt.toISOString(),
      offlineReplay: true,
      hourlyRateMinor,
      overtimeRateMinor: plan?.overtimeRateMinor ?? null,
      overtimeAfterMinutes: plan?.overtimeAfterMinutes ?? null,
      roundingMinutes: plan?.roundingMinutes ?? 1,
      minimumMinutes: plan?.minimumMinutes ?? 0,
      capMinor: plan?.capMinor ?? null,
      membershipHookKey: plan?.membershipHookKey ?? null,
    } as Prisma.InputJsonValue;
    const actorId = createdById ?? 'system:offline';
    const session = await tx.operationsSession.create({
      data: {
        id: dto.entityId,
        shopId,
        resourceId,
        groupId,
        guestCheckId,
        reservationId,
        ratePlanId: plan?.id,
        startedAt,
        hourlyRateMinor,
        overtimeRateMinor: plan?.overtimeRateMinor,
        overtimeAfterMinutes: plan?.overtimeAfterMinutes,
        roundingMinutes: plan?.roundingMinutes ?? 1,
        minimumMinutes: plan?.minimumMinutes ?? 0,
        capMinor: plan?.capMinor,
        rateSnapshot,
        currency: shop.currency,
        createdById: actorId,
        createdAt: startedAt,
      },
    });
    await tx.sessionResourceLink.create({
      data: { shopId, sessionId: session.id, resourceId, linkedAt: startedAt, actorUserId: actorId },
    });
    await tx.resourceStateEvent.create({
      data: { shopId, resourceId, sessionId: session.id, fromState: 'AVAILABLE', toState: 'IN_USE', reason: 'OFFLINE_REPLAY', actorUserId: actorId, createdAt: startedAt },
    });
    if (reservationId) {
      await tx.reservation.updateMany({ where: { id: reservationId, shopId }, data: { status: 'CHECKED_IN' } });
    }
    await this.recordOfflineAudit(tx, shopId, createdById, 'offline.session.start', 'Replayed offline resource session start', { sessionId: session.id, resourceId, operationId: dto.operationId });
    return { entityId: session.id, version: session.version, status: session.status };
  }

  private async applySessionEnd(
    tx: Prisma.TransactionClient,
    shopId: string,
    createdById: string | null,
    dto: ApplyOfflineOperationDto,
  ): Promise<SyncResult> {
    if (!dto.expectedVersion) throw new BadRequestException('SESSION_END requires expectedVersion');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "OperationsSession" WHERE "id" = ${dto.entityId} AND "shopId" = ${shopId} FOR UPDATE`);
    const session = await tx.operationsSession.findFirst({ where: { id: dto.entityId, shopId } });
    if (!session) throw new NotFoundException('Operations session not found');
    if (session.status === 'FINISHED') {
      return { entityId: session.id, version: session.version, status: session.status };
    }
    if (!OPEN_SESSION_STATES.includes(session.status)) {
      throw apiConflictException(ApiDomainErrorCode.STATE_CONFLICT, 'Session can no longer be finished by this offline operation', { sessionId: session.id, status: session.status });
    }
    if (session.version !== dto.expectedVersion) {
      throw apiConflictException(ApiDomainErrorCode.VERSION_CONFLICT, 'Session changed while this device was offline', { sessionId: session.id, expectedVersion: dto.expectedVersion, currentVersion: session.version });
    }
    const finishedAt = operationDate(dto);
    if (finishedAt.getTime() < session.startedAt.getTime()) {
      throw new BadRequestException('Session end cannot be before its start');
    }
    const openPauseSeconds = session.status === 'PAUSED' && session.pausedAt
      ? Math.max(0, Math.floor((finishedAt.getTime() - session.pausedAt.getTime()) / 1000))
      : 0;
    const totalPausedSeconds = session.totalPausedSeconds + openPauseSeconds;
    const accruedMinor = calculateAccruedMinor({ ...session, endedAt: finishedAt, totalPausedSeconds });
    if (openPauseSeconds) {
      await tx.operationsSessionPause.updateMany({
        where: { shopId, sessionId: session.id, endedAt: null },
        data: { endedAt: finishedAt },
      });
    }
    await tx.sessionResourceLink.updateMany({
      where: { shopId, sessionId: session.id, unlinkedAt: null },
      data: { unlinkedAt: finishedAt },
    });
    const updated = await tx.operationsSession.updateMany({
      where: { id: session.id, shopId, status: { in: OPEN_SESSION_STATES }, version: dto.expectedVersion },
      data: {
        status: 'FINISHED',
        finishedAt,
        pausedAt: null,
        totalPausedSeconds,
        accruedMinor,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw apiConflictException(ApiDomainErrorCode.VERSION_CONFLICT, 'Session changed while this offline operation was replaying', { sessionId: session.id, expectedVersion: dto.expectedVersion });
    }
    const actorId = createdById ?? 'system:offline';
    await tx.resourceStateEvent.create({
      data: {
        shopId,
        resourceId: session.resourceId,
        sessionId: session.id,
        fromState: session.status === 'PAUSED' ? 'PAUSED' : 'IN_USE',
        toState: 'AVAILABLE',
        reason: 'OFFLINE_REPLAY',
        actorUserId: actorId,
        metadata: { accruedMinor, currency: session.currency },
        createdAt: finishedAt,
      },
    });
    await this.recordOfflineAudit(tx, shopId, createdById, 'offline.session.finish', 'Replayed offline resource session end', { sessionId: session.id, operationId: dto.operationId, accruedMinor });
    return { entityId: session.id, version: dto.expectedVersion + 1, status: 'FINISHED' };
  }

  private apply(
    tx: Prisma.TransactionClient,
    shopId: string,
    createdById: string | null,
    dto: ApplyOfflineOperationDto,
  ): Promise<SyncResult> {
    const handlers: Record<OfflineOperationType, () => Promise<SyncResult>> = {
      CHECK_CREATE: () => this.applyCheckCreate(tx, shopId, createdById, dto),
      CHECK_UPDATE: () => this.applyCheckUpdate(tx, shopId, createdById, dto),
      ORDER_CREATE: () => this.applyOrderCreate(tx, shopId, createdById, dto),
      SESSION_START: () => this.applySessionStart(tx, shopId, createdById, dto),
      SESSION_END: () => this.applySessionEnd(tx, shopId, createdById, dto),
    };
    return handlers[dto.operationType]();
  }

  private async applyForShop(
    shopId: string,
    createdById: string | null,
    dto: ApplyOfflineOperationDto,
  ) {
    const requestHash = this.validateHash(dto);
    const receiptKey = `${dto.deviceId}:${dto.operationId}`;

    const existing = await this.prisma.idempotencyReceipt.findUnique({
      where: { shopId_scope_key: { shopId, scope: RECEIPT_SCOPE, key: receiptKey } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw apiConflictException(
          ApiDomainErrorCode.IDEMPOTENCY_CONFLICT,
          'Offline operation ID was already used with different content',
          { operationId: dto.operationId, deviceId: dto.deviceId },
        );
      }
      if (existing.status === 'COMPLETED' && existing.responseJson) {
        return JSON.parse(existing.responseJson) as Record<string, unknown>;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.idempotencyReceipt.findUnique({
        where: { shopId_scope_key: { shopId, scope: RECEIPT_SCOPE, key: receiptKey } },
      });
      if (locked?.status === 'COMPLETED' && locked.responseJson) {
        if (locked.requestHash !== requestHash) {
          throw apiConflictException(
            ApiDomainErrorCode.IDEMPOTENCY_CONFLICT,
            'Offline operation ID was already used with different content',
          );
        }
        return JSON.parse(locked.responseJson) as Record<string, unknown>;
      }
      if (!locked) {
        await tx.idempotencyReceipt.create({
          data: {
            shopId,
            scope: RECEIPT_SCOPE,
            key: receiptKey,
            requestHash,
            status: 'PENDING',
          },
        });
      } else if (locked.requestHash !== requestHash) {
        throw apiConflictException(
          ApiDomainErrorCode.IDEMPOTENCY_CONFLICT,
          'Offline operation ID was already used with different content',
          { operationId: dto.operationId, deviceId: dto.deviceId },
        );
      }

      const result = await this.apply(tx, shopId, createdById, dto);
      const response = {
        operationId: dto.operationId,
        deviceId: dto.deviceId,
        operationType: dto.operationType,
        occurredAt: dto.occurredAt,
        syncState: 'SYNCED',
        ...result,
      };
      await tx.idempotencyReceipt.update({
        where: { shopId_scope_key: { shopId, scope: RECEIPT_SCOPE, key: receiptKey } },
        data: { status: 'COMPLETED', responseJson: JSON.stringify(response) },
      });
      return response;
    });
  }

  async applyOperation(actor: JwtAccessPayload, dto: ApplyOfflineOperationDto) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await this.requireEnabled(shopId);
    return this.applyForShop(shopId, actor.sub, dto);
  }

  async applyEdgeOperation(
    shopId: string,
    edgeDeviceId: string,
    dto: ApplyOfflineOperationDto,
  ) {
    await this.requireEdgeEnabled(shopId);
    return this.applyForShop(shopId, `edge:${edgeDeviceId}`, dto);
  }
}
