import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommercialAdjustmentScope,
  CommercialAdjustmentSource,
  CommercialAdjustmentType,
  CommercialReopenDisposition,
  Prisma,
} from '@prisma/client';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import { assertExpectedVersion } from '../../common/optimistic-concurrency.util';
import {
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
} from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { DomainEventOutboxService } from '../foundation/domain-event-outbox.service';
import { CommercialSettlementService } from './commercial-settlement.service';
import {
  AddServiceChargeDto,
  AddTipDto,
  ApplyCommercialAdjustmentDto,
  CompleteVenueOrderDto,
  ReopenGuestCheckDto,
  TransferGuestCheckDto,
  UpdateCommercialPolicyDto,
  UpsertCommercialProfileDto,
  VoidCommercialMutationDto,
} from './dto/phase4-commercial.dto';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CommercialCoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: CommercialSettlementService,
    private readonly outbox: DomainEventOutboxService,
    private readonly audit: AuditService,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: PermissionKey) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  private has(actor: JwtAccessPayload, permission: PermissionKey) {
    return actor.shopRole === 'OWNER' || hasPermission(actor.perms ?? '', permission);
  }

  private async policy(db: Db, shopId: string) {
    return db.commercialPolicy.upsert({
      where: { shopId },
      create: { shopId },
      update: {},
    });
  }

  async getPolicy(actor: JwtAccessPayload) {
    this.assertPermission(actor, PERMISSIONS.SETTINGS_READ);
    return this.policy(this.prisma, requireShopId(actor));
  }

  async updatePolicy(actor: JwtAccessPayload, dto: UpdateCommercialPolicyDto) {
    this.assertPermission(actor, PERMISSIONS.SETTINGS_WRITE);
    const shopId = requireShopId(actor);
    const row = await this.prisma.commercialPolicy.upsert({
      where: { shopId },
      create: { shopId, ...dto },
      update: dto,
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'commercial.policy.update',
      summary: 'Updated commercial-core control limits',
      meta: dto,
    });
    return row;
  }

  private async lockMutableCheck(
    tx: Prisma.TransactionClient,
    shopId: string,
    checkId: string,
    expectedVersion: number,
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "GuestCheck" WHERE "id"=${checkId} AND "shopId"=${shopId} FOR UPDATE`,
    );
    const check = await tx.guestCheck.findFirst({ where: { id: checkId, shopId } });
    if (!check) throw new NotFoundException('Guest check not found');
    if (check.status !== 'OPEN') throw new ConflictException('Guest check is not open');
    assertExpectedVersion(check.version, expectedVersion, {
      aggregateType: 'guest_check',
      aggregateId: checkId,
    });
    if (check.currentSettlementId) {
      const paid = await tx.payment.count({
        where: {
          shopId,
          settlementId: check.currentSettlementId,
          status: 'SUCCESS',
        },
      });
      if (paid > 0) {
        throw apiConflictException(
          ApiDomainErrorCode.STATE_CONFLICT,
          'Paid checkout is immutable. Use the refund/re-sale boundary.',
          { stage: 'PAID_SETTLEMENT_IMMUTABLE', settlementId: check.currentSettlementId },
        );
      }
      await tx.checkSettlement.updateMany({
        where: { id: check.currentSettlementId, shopId, state: { not: 'VOID' } },
        data: { state: 'VOID' },
      });
    }
    return check;
  }

  private async claimCheckMutation(
    tx: Prisma.TransactionClient,
    shopId: string,
    checkId: string,
    expectedVersion: number,
  ) {
    const result = await tx.guestCheck.updateMany({
      where: { id: checkId, shopId, status: 'OPEN', version: expectedVersion },
      data: { currentSettlementId: null, version: { increment: 1 } },
    });
    if (result.count !== 1) {
      throw apiConflictException(
        ApiDomainErrorCode.VERSION_CONFLICT,
        'Guest check changed while the commercial mutation was applied',
        { aggregateType: 'guest_check', aggregateId: checkId },
      );
    }
  }

  private async validateProfileTargets(
    db: Db,
    shopId: string,
    dto: {
      assignedOperatorId?: string;
      resourceId?: string;
      operationsSessionId?: string;
      customerId?: string;
    },
  ) {
    if (dto.assignedOperatorId) {
      const membership = await db.membership.findFirst({
        where: { shopId, userId: dto.assignedOperatorId },
        select: { id: true },
      });
      if (!membership) throw new NotFoundException('Assigned operator is not venue staff');
    }
    if (dto.resourceId) {
      const resource = await db.resource.findFirst({
        where: { shopId, id: dto.resourceId },
        select: { id: true },
      });
      if (!resource) throw new NotFoundException('Resource not found');
    }
    if (dto.operationsSessionId) {
      const session = await db.operationsSession.findFirst({
        where: { shopId, id: dto.operationsSessionId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Operations session not found');
    }
    if (dto.customerId) {
      const customer = await db.customer.findFirst({
        where: { shopId, id: dto.customerId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }
  }

  async getCheck(actor: JwtAccessPayload, checkId: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    const check = await this.prisma.guestCheck.findFirst({
      where: { id: checkId, shopId },
      select: { id: true, status: true, version: true, openedAt: true, settledAt: true },
    });
    if (!check) throw new NotFoundException('Guest check not found');
    const [profile, adjustments, serviceCharges, tips, transfers, reopens, projection] =
      await Promise.all([
        this.prisma.guestCheckCommercialProfile.findFirst({ where: { shopId, guestCheckId: checkId } }),
        this.prisma.commercialAdjustment.findMany({ where: { shopId, guestCheckId: checkId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.guestCheckServiceCharge.findMany({ where: { shopId, guestCheckId: checkId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.guestCheckTip.findMany({ where: { shopId, guestCheckId: checkId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.guestCheckTransferEvent.findMany({ where: { shopId, guestCheckId: checkId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.guestCheckReopenEvent.findMany({ where: { shopId, guestCheckId: checkId }, orderBy: { createdAt: 'asc' } }),
        check.status === 'OPEN'
          ? this.settlement.preview(actor, checkId)
          : Promise.resolve(null),
      ]);
    return { check, profile, adjustments, serviceCharges, tips, transfers, reopens, projection };
  }

  async upsertProfile(actor: JwtAccessPayload, checkId: string, dto: UpsertCommercialProfileDto) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockMutableCheck(tx, shopId, checkId, dto.expectedCheckVersion);
      await this.validateProfileTargets(tx, shopId, dto);
      const profile = await tx.guestCheckCommercialProfile.upsert({
        where: { guestCheckId: checkId },
        create: {
          shopId,
          guestCheckId: checkId,
          checkType: dto.checkType,
          assignedOperatorId: dto.assignedOperatorId,
          resourceId: dto.resourceId,
          operationsSessionId: dto.operationsSessionId,
          tableReference: dto.tableReference,
          customerId: dto.customerId,
          serviceArea: dto.serviceArea,
        },
        update: {
          checkType: dto.checkType,
          assignedOperatorId: dto.assignedOperatorId,
          resourceId: dto.resourceId,
          operationsSessionId: dto.operationsSessionId,
          tableReference: dto.tableReference,
          customerId: dto.customerId,
          serviceArea: dto.serviceArea,
          version: { increment: 1 },
        },
      });
      await this.claimCheckMutation(tx, shopId, checkId, dto.expectedCheckVersion);
      return profile;
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'guest-check.commercial-profile.update',
      summary: 'Updated commercial tab context',
      meta: { checkId, checkType: row.checkType, resourceId: row.resourceId, serviceArea: row.serviceArea },
    });
    return row;
  }

  async transfer(actor: JwtAccessPayload, checkId: string, dto: TransferGuestCheckDto) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    const policy = await this.policy(this.prisma, shopId);
    if (!policy.allowResourceTransfer && (dto.resourceId || dto.operationsSessionId)) {
      throw new ForbiddenException('Resource transfer is disabled by venue commercial policy');
    }
    const event = await this.prisma.$transaction(async (tx) => {
      await this.lockMutableCheck(tx, shopId, checkId, dto.expectedCheckVersion);
      await this.validateProfileTargets(tx, shopId, dto);
      const before = await tx.guestCheckCommercialProfile.upsert({
        where: { guestCheckId: checkId },
        create: { shopId, guestCheckId: checkId },
        update: {},
      });
      const after = await tx.guestCheckCommercialProfile.update({
        where: { guestCheckId: checkId },
        data: {
          assignedOperatorId: dto.assignedOperatorId ?? before.assignedOperatorId,
          resourceId: dto.resourceId ?? before.resourceId,
          operationsSessionId: dto.operationsSessionId ?? before.operationsSessionId,
          serviceArea: dto.serviceArea ?? before.serviceArea,
          version: { increment: 1 },
        },
      });
      const created = await tx.guestCheckTransferEvent.create({
        data: {
          shopId,
          guestCheckId: checkId,
          actorId: actor.sub,
          reason: dto.reason.trim(),
          fromOperatorId: before.assignedOperatorId,
          toOperatorId: after.assignedOperatorId,
          fromResourceId: before.resourceId,
          toResourceId: after.resourceId,
          fromOperationsSessionId: before.operationsSessionId,
          toOperationsSessionId: after.operationsSessionId,
          fromServiceArea: before.serviceArea,
          toServiceArea: after.serviceArea,
        },
      });
      await this.claimCheckMutation(tx, shopId, checkId, dto.expectedCheckVersion);
      return created;
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'guest-check.transfer',
      summary: 'Transferred open tab context without changing charge history',
      meta: { checkId, transferEventId: event.id, reason: dto.reason },
    });
    return event;
  }

  private requiredAdjustmentPermission(type: CommercialAdjustmentType): PermissionKey {
    if (type === CommercialAdjustmentType.MANAGER_COMP) return PERMISSIONS.COMP_APPLY;
    if (type === CommercialAdjustmentType.PRICE_OVERRIDE) return PERMISSIONS.PRICE_OVERRIDE;
    if (
      type === CommercialAdjustmentType.PERCENTAGE_DISCOUNT ||
      type === CommercialAdjustmentType.FIXED_DISCOUNT ||
      type === CommercialAdjustmentType.PROMOTION
    ) {
      return PERMISSIONS.DISCOUNT_MANUAL;
    }
    return PERMISSIONS.CHECKOUT_WRITE;
  }

  private projectionMinor(total: Prisma.Decimal) {
    return Number(roundMoneyDecimal(total.mul(100), 0).toString());
  }

  async applyAdjustment(actor: JwtAccessPayload, checkId: string, dto: ApplyCommercialAdjustmentDto) {
    this.assertPermission(actor, this.requiredAdjustmentPermission(dto.type));
    const shopId = requireShopId(actor);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockMutableCheck(tx, shopId, checkId, dto.expectedCheckVersion);
      const policy = await this.policy(tx, shopId);
      const before = (await this.settlement.buildProjection(tx, shopId, checkId)).projection;
      const scope = dto.scope ?? CommercialAdjustmentScope.CHECK;
      const source = dto.source ?? CommercialAdjustmentSource.MANUAL;

      if (dto.type === CommercialAdjustmentType.PERCENTAGE_DISCOUNT) {
        if (!dto.percentageBps) throw new BadRequestException('Percentage discount requires percentageBps');
        if (dto.percentageBps > policy.maxManualDiscountBps) {
          throw new ForbiddenException('Discount exceeds venue maximum');
        }
      } else if (dto.type === CommercialAdjustmentType.PRICE_OVERRIDE) {
        if (scope !== CommercialAdjustmentScope.LINE || dto.amountMinor == null) {
          throw new BadRequestException('Price override requires LINE scope and target amountMinor');
        }
        const targets = before.lines.filter(
          (line) =>
            (!dto.targetSourceType || line.sourceType === dto.targetSourceType) &&
            (!dto.targetSourceId || line.sourceId === dto.targetSourceId) &&
            (!dto.targetLineReference || line.lineReference === dto.targetLineReference),
        );
        if (targets.length !== 1) throw new BadRequestException('Price override must resolve to exactly one line');
        const oldMinor = this.projectionMinor(targets[0].finalAmount);
        const reduction = Math.max(0, oldMinor - dto.amountMinor);
        const reductionBps = oldMinor > 0 ? Math.round((reduction * 10000) / oldMinor) : 0;
        if (reductionBps > policy.maxPriceOverrideBps) {
          throw new ForbiddenException('Price override exceeds venue maximum');
        }
      } else {
        if (dto.amountMinor == null || dto.amountMinor <= 0) {
          throw new BadRequestException('This adjustment requires a positive amountMinor');
        }
        if (
          dto.type === CommercialAdjustmentType.MANAGER_COMP &&
          dto.amountMinor > policy.maxCompAmountMinor
        ) {
          throw new ForbiddenException('Comp exceeds venue maximum');
        }
      }

      if (scope === CommercialAdjustmentScope.LINE && (!dto.targetSourceId || !dto.targetLineReference)) {
        throw new BadRequestException('Line adjustment requires targetSourceId and targetLineReference');
      }

      if (dto.type === CommercialAdjustmentType.DEPOSIT_APPLICATION) {
        if (dto.targetSourceType !== 'RESERVATION_DEPOSIT' || !dto.targetSourceId) {
          throw new BadRequestException('Deposit application requires a RESERVATION_DEPOSIT source');
        }
        const captured = await tx.reservationDepositCheckoutAttempt.aggregate({
          where: { shopId, reservationId: dto.targetSourceId, status: 'SUCCEEDED' },
          _sum: { amountMinor: true },
        });
        const used = await tx.commercialAdjustment.aggregate({
          where: {
            shopId,
            type: CommercialAdjustmentType.DEPOSIT_APPLICATION,
            targetSourceType: 'RESERVATION_DEPOSIT',
            targetSourceId: dto.targetSourceId,
            voidedAt: null,
          },
          _sum: { amountMinor: true },
        });
        const remaining = (captured._sum.amountMinor ?? 0) - (used._sum.amountMinor ?? 0);
        if ((dto.amountMinor ?? 0) > remaining) {
          throw new ConflictException('Deposit application exceeds captured unused deposit balance');
        }
      }

      const row = await tx.commercialAdjustment.create({
        data: {
          shopId,
          guestCheckId: checkId,
          type: dto.type,
          scope,
          targetSourceType: dto.targetSourceType,
          targetSourceId: dto.targetSourceId,
          targetLineReference: dto.targetLineReference,
          amountMinor: dto.amountMinor,
          percentageBps: dto.percentageBps,
          beforeTotalMinor: this.projectionMinor(before.total),
          afterTotalMinor: this.projectionMinor(before.total),
          reason: dto.reason.trim(),
          source,
          createdById: actor.sub,
        },
      });
      const after = (await this.settlement.buildProjection(tx, shopId, checkId)).projection;
      const updated = await tx.commercialAdjustment.update({
        where: { id: row.id },
        data: { afterTotalMinor: this.projectionMinor(after.total) },
      });
      await this.claimCheckMutation(tx, shopId, checkId, dto.expectedCheckVersion);
      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'guest_check',
        aggregateId: checkId,
        eventType: 'guest-check.adjustment-applied',
        payload: {
          schemaVersion: 1,
          adjustmentId: updated.id,
          type: updated.type,
          scope: updated.scope,
          beforeTotalMinor: updated.beforeTotalMinor,
          afterTotalMinor: updated.afterTotalMinor,
          reason: updated.reason,
        },
      });
      return updated;
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'guest-check.adjustment.apply',
      summary: `Applied ${created.type.toLowerCase().replaceAll('_', ' ')}`,
      meta: { checkId, adjustmentId: created.id, beforeTotalMinor: created.beforeTotalMinor, afterTotalMinor: created.afterTotalMinor, reason: created.reason },
    });
    return created;
  }

  async voidAdjustment(actor: JwtAccessPayload, checkId: string, adjustmentId: string, dto: VoidCommercialMutationDto) {
    const shopId = requireShopId(actor);
    const existing = await this.prisma.commercialAdjustment.findFirst({ where: { id: adjustmentId, shopId, guestCheckId: checkId } });
    if (!existing) throw new NotFoundException('Adjustment not found');
    this.assertPermission(actor, this.requiredAdjustmentPermission(existing.type));
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockMutableCheck(tx, shopId, checkId, dto.expectedCheckVersion);
      const updated = await tx.commercialAdjustment.update({ where: { id: adjustmentId }, data: { voidedAt: new Date(), voidedById: actor.sub, voidReason: dto.reason.trim() } });
      await this.claimCheckMutation(tx, shopId, checkId, dto.expectedCheckVersion);
      return updated;
    });
    await this.audit.record(actor, { section: 'finance', action: 'guest-check.adjustment.void', summary: 'Voided commercial adjustment', meta: { checkId, adjustmentId, reason: dto.reason } });
    return row;
  }

  async addServiceCharge(actor: JwtAccessPayload, checkId: string, dto: AddServiceChargeDto) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    if (dto.mode === 'FIXED' && !dto.amountMinor) throw new BadRequestException('Fixed service charge requires amountMinor');
    if (dto.mode === 'PERCENTAGE' && !dto.percentageBps) throw new BadRequestException('Percentage service charge requires percentageBps');
    const shopId = requireShopId(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockMutableCheck(tx, shopId, checkId, dto.expectedCheckVersion);
      const created = await tx.guestCheckServiceCharge.create({ data: { shopId, guestCheckId: checkId, mode: dto.mode, amountMinor: dto.amountMinor, percentageBps: dto.percentageBps, reason: dto.reason.trim(), createdById: actor.sub } });
      await this.claimCheckMutation(tx, shopId, checkId, dto.expectedCheckVersion);
      return created;
    });
    await this.audit.record(actor, { section: 'finance', action: 'guest-check.service-charge.add', summary: 'Added separate service charge', meta: { checkId, serviceChargeId: row.id, mode: row.mode } });
    return row;
  }

  async voidServiceCharge(actor: JwtAccessPayload, checkId: string, id: string, dto: VoidCommercialMutationDto) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lockMutableCheck(tx, shopId, checkId, dto.expectedCheckVersion);
      const found = await tx.guestCheckServiceCharge.findFirst({ where: { id, shopId, guestCheckId: checkId, voidedAt: null } });
      if (!found) throw new NotFoundException('Service charge not found');
      const updated = await tx.guestCheckServiceCharge.update({ where: { id }, data: { voidedAt: new Date(), voidedById: actor.sub, voidReason: dto.reason.trim() } });
      await this.claimCheckMutation(tx, shopId, checkId, dto.expectedCheckVersion);
      return updated;
    });
  }

  async addTip(actor: JwtAccessPayload, checkId: string, dto: AddTipDto) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockMutableCheck(tx, shopId, checkId, dto.expectedCheckVersion);
      const created = await tx.guestCheckTip.create({ data: { shopId, guestCheckId: checkId, method: dto.method, amountMinor: dto.amountMinor, note: dto.note?.trim() || null, createdById: actor.sub } });
      await this.claimCheckMutation(tx, shopId, checkId, dto.expectedCheckVersion);
      return created;
    });
    await this.audit.record(actor, { section: 'finance', action: 'guest-check.tip.add', summary: 'Added separate gratuity', meta: { checkId, tipId: row.id, method: row.method, amountMinor: row.amountMinor } });
    return row;
  }

  async voidTip(actor: JwtAccessPayload, checkId: string, id: string, dto: VoidCommercialMutationDto) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lockMutableCheck(tx, shopId, checkId, dto.expectedCheckVersion);
      const found = await tx.guestCheckTip.findFirst({ where: { id, shopId, guestCheckId: checkId, voidedAt: null } });
      if (!found) throw new NotFoundException('Tip not found');
      const updated = await tx.guestCheckTip.update({ where: { id }, data: { voidedAt: new Date(), voidedById: actor.sub, voidReason: dto.reason.trim() } });
      await this.claimCheckMutation(tx, shopId, checkId, dto.expectedCheckVersion);
      return updated;
    });
  }

  async completeVenueOrder(actor: JwtAccessPayload, orderId: string, dto: CompleteVenueOrderDto) {
    this.assertPermission(actor, PERMISSIONS.ORDER_WRITE);
    const shopId = requireShopId(actor);
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "VenueOrder" WHERE "id"=${orderId} AND "shopId"=${shopId} FOR UPDATE`);
      const current = await tx.venueOrder.findFirst({ where: { id: orderId, shopId } });
      if (!current) throw new NotFoundException('Order not found');
      if (current.status === 'COMPLETED') return current;
      if (current.status === 'CANCELED' || current.status === 'REFUNDED') throw new ConflictException('Terminal order cannot be completed');
      if (current.version !== dto.expectedVersion) throw apiConflictException(ApiDomainErrorCode.VERSION_CONFLICT, 'Order changed before completion', { aggregateType: 'venue_order', aggregateId: orderId, expectedVersion: dto.expectedVersion, actualVersion: current.version });
      return tx.venueOrder.update({ where: { id: orderId }, data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } } });
    });
    await this.audit.record(actor, { section: 'operations', action: 'order.complete', summary: 'Finalized venue order for commercial settlement', meta: { orderId, guestCheckId: order.guestCheckId, totalMinor: order.totalMinor } });
    return order;
  }

  async reopen(actor: JwtAccessPayload, checkId: string, dto: ReopenGuestCheckDto) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_REOPEN);
    const shopId = requireShopId(actor);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GuestCheck" WHERE "id"=${checkId} AND "shopId"=${shopId} FOR UPDATE`);
      const check = await tx.guestCheck.findFirst({ where: { id: checkId, shopId } });
      if (!check) throw new NotFoundException('Guest check not found');
      if (check.status !== 'SETTLED') throw new ConflictException('Only a settled GuestCheck can be reopened');
      assertExpectedVersion(check.version, dto.expectedCheckVersion, { aggregateType: 'guest_check', aggregateId: checkId });
      const settlement = await tx.checkSettlement.findFirst({ where: { shopId, guestCheckId: checkId, state: 'CLOSED' }, orderBy: { updatedAt: 'desc' } });
      const successfulPayments = settlement ? await tx.payment.count({ where: { shopId, settlementId: settlement.id, status: 'SUCCESS' } }) : 0;
      const financialFacts = await tx.ledgerEntry.count({ where: { shopId, guestCheckId: checkId, amount: { not: new Prisma.Decimal(0) } } });
      if (successfulPayments > 0 || financialFacts > 0) {
        const event = await tx.guestCheckReopenEvent.create({ data: { shopId, guestCheckId: checkId, settlementId: settlement?.id ?? null, actorId: actor.sub, reason: dto.reason.trim(), disposition: CommercialReopenDisposition.REFUND_RESALE_REQUIRED } });
        return { reopened: false as const, event, settlementId: settlement?.id ?? null };
      }
      const event = await tx.guestCheckReopenEvent.create({ data: { shopId, guestCheckId: checkId, settlementId: settlement?.id ?? null, actorId: actor.sub, reason: dto.reason.trim(), disposition: CommercialReopenDisposition.REOPENED_UNPAID } });
      await tx.guestCheck.update({ where: { id: checkId }, data: { status: 'OPEN', settledAt: null, paymentMethod: null, currentSettlementId: null, version: { increment: 1 } } });
      await this.outbox.enqueue(tx, { shopId, aggregateType: 'guest_check', aggregateId: checkId, eventType: 'guest-check.reopened', payload: { schemaVersion: 1, guestCheckId: checkId, priorSettlementId: settlement?.id ?? null, reason: dto.reason.trim(), actorId: actor.sub } });
      return { reopened: true as const, event, settlementId: settlement?.id ?? null };
    });
    await this.audit.record(actor, { section: 'finance', action: result.reopened ? 'guest-check.reopen' : 'guest-check.reopen.blocked', summary: result.reopened ? 'Reopened zero-financial-impact guest check' : 'Blocked reopen at refund/re-sale boundary', meta: { checkId, settlementId: result.settlementId, reason: dto.reason } });
    if (!result.reopened) {
      throw apiConflictException(ApiDomainErrorCode.STATE_CONFLICT, 'This settled check has financial facts. Refund/re-sale is required; destructive reopen is prohibited.', { stage: 'REFUND_RESALE_REQUIRED', guestCheckId: checkId, settlementId: result.settlementId, reopenEventId: result.event.id });
    }
    return { reopened: true, checkId, priorSettlementId: result.settlementId, eventId: result.event.id };
  }

  async openTabGuard(actor: JwtAccessPayload) {
    this.assertPermission(actor, PERMISSIONS.CASH_CLOSE);
    const shopId = requireShopId(actor);
    const policy = await this.policy(this.prisma, shopId);
    const openChecks = await this.prisma.guestCheck.findMany({
      where: { shopId, status: 'OPEN' },
      select: { id: true, label: true, guestName: true, openedAt: true },
      orderBy: { openedAt: 'asc' },
      take: 200,
    });
    return {
      allowed: openChecks.length === 0 || policy.allowCashShiftCloseWithOpenTabs,
      policyAllowsOpenTabs: policy.allowCashShiftCloseWithOpenTabs,
      requiresManagerPolicyAction: openChecks.length > 0 && !policy.allowCashShiftCloseWithOpenTabs,
      openChecks,
    };
  }
}
