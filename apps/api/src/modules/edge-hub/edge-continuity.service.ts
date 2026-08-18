import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CheckoutPaymentMethod, PaymentAllocationKind, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import { hasPermission, PERMISSIONS, permissionsToEffectiveCsv } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CheckoutPaymentService } from '../checkout/checkout-payment.service';
import { OperationsService } from '../operations/operations.service';
import type { ApplyOfflineOperationDto } from '../offline-sync/dto/offline-operation.dto';

const EXTENDED_SCOPE = 'offline.edge.phase12.v1';
const CASH_SCOPE = 'offline.edge.cash.v1';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}
function sha256(value: string) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function requiredString(value: unknown, field: string, max = 160) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`${field} is required`);
  if (text.length > max) throw new BadRequestException(`${field} is too long`);
  return text;
}
function positiveMinor(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new BadRequestException('amountMinor must be a positive safe integer');
  return Number(value);
}

@Injectable()
export class EdgeContinuityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
    private readonly checkout: CheckoutPaymentService,
  ) {}

  private validateEnvelope(shopId: string, dto: ApplyOfflineOperationDto) {
    if (dto.venueId && dto.venueId !== shopId) {
      throw new ForbiddenException('Edge command venue does not match authenticated Edge Hub venue');
    }
    const payloadHash = sha256(canonicalJson(dto.payload));
    if (payloadHash !== dto.payloadHash.toLowerCase()) throw new BadRequestException('Offline operation payloadHash does not match payload');
    const requestHash = sha256(canonicalJson({
      operationId: dto.operationId,
      deviceId: dto.deviceId,
      venueId: shopId,
      localSequence: dto.localSequence ?? null,
      idempotencyKey: dto.idempotencyKey ?? dto.operationId,
      operationType: dto.operationType,
      aggregateType: dto.aggregateType ?? null,
      entityId: dto.entityId,
      expectedVersion: dto.expectedVersion ?? null,
      occurredAt: dto.occurredAt,
      correlationId: dto.correlationId ?? dto.operationId,
      payloadHash,
    }));
    return { payloadHash, requestHash };
  }

  private async actorForOperator(shopId: string, operatorUserId: string): Promise<JwtAccessPayload> {
    const membership = await this.prisma.membership.findFirst({
      where: { shopId, userId: operatorUserId, isActive: true },
      include: { permissionRows: true },
    });
    if (!membership) throw new ForbiddenException('Offline operator is not an active member of this venue');
    return {
      sub: operatorUserId,
      shopId,
      shopRole: membership.role,
      perms: permissionsToEffectiveCsv({ permissionRows: membership.permissionRows }),
    } as JwtAccessPayload;
  }

  private assertSessionWrite(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER') return;
    if (!hasPermission(actor.perms ?? '', PERMISSIONS.SESSION_WRITE)) throw new ForbiddenException('Missing session.write');
  }

  private assertCheckoutWrite(actor: JwtAccessPayload) {
    if (actor.shopRole === 'OWNER') return;
    if (!hasPermission(actor.perms ?? '', PERMISSIONS.CHECKOUT_WRITE)) throw new ForbiddenException('Missing checkout.write');
  }

  private async existingReceipt(shopId: string, scope: string, key: string, requestHash: string) {
    const receipt = await this.prisma.idempotencyReceipt.findUnique({ where: { shopId_scope_key: { shopId, scope, key } } });
    if (!receipt) return null;
    if (receipt.requestHash !== requestHash) {
      throw apiConflictException(ApiDomainErrorCode.IDEMPOTENCY_CONFLICT, 'Offline operation key was already used with different content', { key });
    }
    if (receipt.status === 'COMPLETED' && receipt.responseJson) return JSON.parse(receipt.responseJson) as Record<string, unknown>;
    return receipt;
  }

  private async beginReceipt(shopId: string, scope: string, key: string, requestHash: string, correlationId: string) {
    try {
      await this.prisma.idempotencyReceipt.create({ data: { shopId, scope, key, requestHash, correlationId, status: 'PENDING' } });
      return true;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') return false;
      throw error;
    }
  }

  private async completeReceipt(shopId: string, scope: string, key: string, response: unknown) {
    await this.prisma.idempotencyReceipt.update({
      where: { shopId_scope_key: { shopId, scope, key } },
      data: { status: 'COMPLETED', responseJson: JSON.stringify(response) },
    });
  }

  private envelope(dto: ApplyOfflineOperationDto, result: { entityId: string; version: number; status: string }, extra?: Record<string, unknown>) {
    return {
      operationId: dto.operationId,
      deviceId: dto.deviceId,
      venueId: dto.venueId ?? null,
      localSequence: dto.localSequence ?? null,
      idempotencyKey: dto.idempotencyKey ?? dto.operationId,
      correlationId: dto.correlationId ?? dto.operationId,
      operationType: dto.operationType,
      occurredAt: dto.occurredAt,
      syncState: 'SYNCED',
      ...result,
      ...extra,
    };
  }

  private async replaySessionState(shopId: string, edgeDeviceId: string, dto: ApplyOfflineOperationDto, mode: 'PAUSE' | 'RESUME') {
    if (!dto.expectedVersion) throw new BadRequestException(`${dto.operationType} requires expectedVersion`);
    const { requestHash } = this.validateEnvelope(shopId, dto);
    const key = `${edgeDeviceId}:${dto.operationId}`;
    const existing = await this.existingReceipt(shopId, EXTENDED_SCOPE, key, requestHash);
    if (existing && !('status' in existing && existing.status === 'PENDING')) return existing;

    const operatorUserId = requiredString(dto.payload.operatorUserId, 'operatorUserId');
    const actor = await this.actorForOperator(shopId, operatorUserId);
    this.assertSessionWrite(actor);

    if (existing && 'status' in existing && existing.status === 'PENDING') {
      const session = await this.prisma.operationsSession.findFirst({ where: { id: dto.entityId, shopId } });
      const desired = mode === 'PAUSE' ? 'PAUSED' : 'ACTIVE';
      if (session && session.status === desired && session.version === dto.expectedVersion + 1) {
        const response = this.envelope(dto, { entityId: session.id, version: session.version, status: session.status }, { recoveredAfterInterruptedAck: true });
        await this.completeReceipt(shopId, EXTENDED_SCOPE, key, response);
        return response;
      }
      throw new ServiceUnavailableException('Offline session replay is already in progress');
    }

    const started = await this.beginReceipt(shopId, EXTENDED_SCOPE, key, requestHash, dto.correlationId ?? dto.operationId);
    if (!started) throw new ServiceUnavailableException('Offline session replay is already in progress');
    try {
      const row = mode === 'PAUSE'
        ? await this.operations.pause(actor, dto.entityId, {
            expectedVersion: dto.expectedVersion,
            reason: requiredString(dto.payload.reason ?? 'OFFLINE_EDGE', 'reason', 500),
          })
        : await this.operations.resume(actor, dto.entityId, { expectedVersion: dto.expectedVersion });
      const response = this.envelope(dto, { entityId: row.id, version: row.version, status: row.status });
      await this.completeReceipt(shopId, EXTENDED_SCOPE, key, response);
      return response;
    } catch (error) {
      const session = await this.prisma.operationsSession.findFirst({ where: { id: dto.entityId, shopId } }).catch(() => null);
      const desired = mode === 'PAUSE' ? 'PAUSED' : 'ACTIVE';
      if (session && session.status === desired && session.version === dto.expectedVersion + 1) {
        const response = this.envelope(dto, { entityId: session.id, version: session.version, status: session.status }, { recoveredAfterInterruptedAck: true });
        await this.completeReceipt(shopId, EXTENDED_SCOPE, key, response);
        return response;
      }
      await this.prisma.idempotencyReceipt.deleteMany({ where: { shopId, scope: EXTENDED_SCOPE, key, status: 'PENDING' } });
      throw error;
    }
  }

  private normalizeCashPayload(dto: ApplyOfflineOperationDto) {
    if (!dto.expectedVersion) throw new BadRequestException('CASH_PAYMENT requires expectedVersion');
    const settlementId = requiredString(dto.payload.settlementId ?? dto.entityId, 'settlementId');
    if (settlementId !== dto.entityId) throw new BadRequestException('CASH_PAYMENT entityId must equal settlementId');
    const amountMinor = positiveMinor(dto.payload.amountMinor);
    const currency = requiredString(dto.payload.currency, 'currency', 3).toUpperCase();
    const operatorUserId = requiredString(dto.payload.operatorUserId, 'operatorUserId');
    const allocationKind = requiredString(dto.payload.allocationKind, 'allocationKind') as PaymentAllocationKind;
    if (!Object.values(PaymentAllocationKind).includes(allocationKind)) throw new BadRequestException('Invalid allocationKind');
    if (!Array.isArray(dto.payload.allocations) || dto.payload.allocations.length < 1) throw new BadRequestException('allocations are required');
    const allocations = dto.payload.allocations.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException(`allocations[${index}] must be an object`);
      const row = raw as Record<string, unknown>;
      const snapshotId = requiredString(row.snapshotId, `allocations[${index}].snapshotId`);
      const amount = requiredString(row.amount, `allocations[${index}].amount`, 40);
      const decimal = new Prisma.Decimal(amount);
      if (decimal.lte(0)) throw new BadRequestException('Allocation amount must be positive');
      return { snapshotId, amount, decimal };
    });
    const totalMinor = allocations.reduce((sum, row) => sum.add(row.decimal), new Prisma.Decimal(0))
      .mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    if (totalMinor !== amountMinor) throw new BadRequestException('amountMinor must equal the exact allocation total');
    return { settlementId, amountMinor, currency, operatorUserId, allocationKind, allocations: allocations.map(({ snapshotId, amount }) => ({ snapshotId, amount })) };
  }

  private async replayCash(shopId: string, edgeDeviceId: string, dto: ApplyOfflineOperationDto) {
    const { requestHash } = this.validateEnvelope(shopId, dto);
    const parsed = this.normalizeCashPayload(dto);
    const actor = await this.actorForOperator(shopId, parsed.operatorUserId);
    this.assertCheckoutWrite(actor);
    const key = `${edgeDeviceId}:${dto.operationId}`;
    const correlationId = `offline:${dto.operationId}`;
    const existing = await this.existingReceipt(shopId, CASH_SCOPE, key, requestHash);
    if (existing && !('status' in existing && existing.status === 'PENDING')) return existing;

    const recover = async () => {
      const payment = await this.prisma.payment.findFirst({
        where: { shopId, settlementId: parsed.settlementId, method: CheckoutPaymentMethod.CASH, correlationId, status: 'SUCCESS' },
        orderBy: { createdAt: 'asc' },
      });
      if (!payment) return null;
      const state = await this.checkout.getPaymentState(actor, parsed.settlementId);
      const response = this.envelope(dto, { entityId: parsed.settlementId, version: state.guestCheckVersion, status: state.state }, { paymentState: state, recoveredAfterInterruptedAck: true });
      await this.completeReceipt(shopId, CASH_SCOPE, key, response);
      return response;
    };

    if (existing && 'status' in existing && existing.status === 'PENDING') {
      const recovered = await recover();
      if (recovered) return recovered;
      throw new ServiceUnavailableException('Offline cash replay is already in progress');
    }
    const started = await this.beginReceipt(shopId, CASH_SCOPE, key, requestHash, correlationId);
    if (!started) throw new ServiceUnavailableException('Offline cash replay is already in progress');
    try {
      const settlement = await this.prisma.checkSettlement.findFirst({ where: { id: parsed.settlementId, shopId }, select: { currency: true } });
      if (!settlement) throw new NotFoundException('Settlement not found');
      if (settlement.currency !== parsed.currency) throw new ConflictException('Offline cash currency differs from settlement currency');
      const state = await this.checkout.createPayment(actor, parsed.settlementId, {
        expectedCheckVersion: dto.expectedVersion!,
        method: CheckoutPaymentMethod.CASH,
        allocationKind: parsed.allocationKind,
        allocations: parsed.allocations,
        note: `Edge offline cash ${dto.operationId}`,
      }, correlationId);
      const response = this.envelope(dto, { entityId: parsed.settlementId, version: state.guestCheckVersion, status: state.state }, { paymentState: state });
      await this.completeReceipt(shopId, CASH_SCOPE, key, response);
      return response;
    } catch (error) {
      const recovered = await recover().catch(() => null);
      if (recovered) return recovered;
      await this.prisma.idempotencyReceipt.deleteMany({ where: { shopId, scope: CASH_SCOPE, key, status: 'PENDING' } });
      throw error;
    }
  }

  async replayExtended(shopId: string, edgeDeviceId: string, dto: ApplyOfflineOperationDto) {
    const operationType = dto.operationType as string;
    if (operationType === 'SESSION_PAUSE') return this.replaySessionState(shopId, edgeDeviceId, dto, 'PAUSE');
    if (operationType === 'SESSION_RESUME') return this.replaySessionState(shopId, edgeDeviceId, dto, 'RESUME');
    if (operationType === 'CASH_PAYMENT') return this.replayCash(shopId, edgeDeviceId, dto);
    throw new BadRequestException(`Unsupported Phase 12 extended operation ${operationType}`);
  }

  async snapshot(shopId: string) {
    const [venue, devices, resources, rates, catalog, openChecks, activeSessions, tickets, ticketLines] = await Promise.all([
      this.prisma.shop.findUnique({ where: { id: shopId } }),
      this.prisma.device.findMany({ where: { shopId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
      this.prisma.resource.findMany({ where: { shopId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.operationsRatePlan.findMany({ where: { shopId, active: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.menuItem.findMany({ where: { shopId }, orderBy: { name: 'asc' } }),
      this.prisma.guestCheck.findMany({ where: { shopId, status: 'OPEN' }, orderBy: { openedAt: 'asc' } }),
      this.prisma.operationsSession.findMany({ where: { shopId, status: { in: ['ACTIVE', 'PAUSED'] } }, orderBy: { startedAt: 'asc' } }),
      this.prisma.prepTicket.findMany({ where: { shopId, status: { in: ['NEW', 'PREPARING', 'READY'] } }, orderBy: { openedAt: 'asc' } }),
      this.prisma.prepTicketLine.findMany({ where: { shopId, status: { in: ['NEW', 'PREPARING', 'READY'] } }, orderBy: { routedAt: 'asc' } }),
    ]);
    if (!venue) throw new NotFoundException('Venue not found');
    const generatedAt = new Date().toISOString();
    const snapshot = {
      generatedAt,
      venue: {
        id: venue.id, name: venue.name, displayName: venue.displayName, currency: venue.currency,
        timezone: venue.timezone, businessDayStartMinutes: venue.businessDayStartMinutes, version: venue.version,
      },
      devices: devices.map((row) => ({ id: row.id, type: row.type, status: row.status, label: row.label, lastSeenAt: row.lastSeenAt?.toISOString() ?? null })),
      resources: resources.map((row) => ({
        id: row.id, categoryId: row.categoryId, code: row.code, name: row.name, type: row.type,
        status: row.status, configurationState: row.configurationState, version: row.version,
        hourlyRate: row.hourlyRate.toString(), layoutX: row.layoutX, layoutY: row.layoutY,
      })),
      rates: rates.map((row) => ({
        id: row.id, name: row.name, resourceId: row.resourceId, resourceCategoryId: row.resourceCategoryId,
        billingMode: row.billingMode, unitPriceMinor: row.unitPriceMinor, hourlyRateMinor: row.hourlyRateMinor,
        fixedDurationMinutes: row.fixedDurationMinutes, minimumChargeMinor: row.minimumChargeMinor,
        graceMinutes: row.graceMinutes, overtimeRateMinor: row.overtimeRateMinor, overtimeAfterMinutes: row.overtimeAfterMinutes,
        roundingMinutes: row.roundingMinutes, minimumMinutes: row.minimumMinutes, capMinor: row.capMinor,
        weekdays: row.weekdays, startMinute: row.startMinute, endMinute: row.endMinute, priority: row.priority,
        membershipHookKey: row.membershipHookKey, membershipOnly: row.membershipOnly, groupPackage: row.groupPackage,
        effectiveFrom: row.effectiveFrom?.toISOString() ?? null, effectiveTo: row.effectiveTo?.toISOString() ?? null,
      })),
      catalog: catalog.map((row) => ({
        id: row.id, sectionId: row.sectionId, name: row.name, kind: row.kind, unit: row.unit,
        sku: row.sku, barcode: row.barcode, price: row.price.toString(), stock: row.stock,
      })),
      openChecks: openChecks.map((row) => ({
        id: row.id, status: row.status, version: row.version, currency: row.currency, guestName: row.guestName,
        label: row.label, partySize: row.partySize, currentSettlementId: row.currentSettlementId,
        openedAt: row.openedAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      })),
      activeSessions: activeSessions.map((row) => ({
        id: row.id, resourceId: row.resourceId, guestCheckId: row.guestCheckId, reservationId: row.reservationId,
        status: row.status, version: row.version, startedAt: row.startedAt.toISOString(), pausedAt: row.pausedAt?.toISOString() ?? null,
        totalPausedSeconds: row.totalPausedSeconds, currency: row.currency, hourlyRateMinor: row.hourlyRateMinor,
        rateSnapshot: row.rateSnapshot,
      })),
      kdsTickets: tickets.map((ticket) => ({
        id: ticket.id, stationId: ticket.stationId, orderId: ticket.orderId, status: ticket.status,
        openedAt: ticket.openedAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(),
        lines: ticketLines.filter((line) => line.ticketId === ticket.id).map((line) => ({ id: line.id, orderLineId: line.orderLineId, quantity: line.quantity, status: line.status })),
      })),
    };
    const cursor = sha256(canonicalJson(snapshot));
    return { ...snapshot, cursor };
  }
}
