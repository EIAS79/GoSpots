import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckoutPaymentMethod,
  CheckoutPaymentStatus,
  Prisma,
} from '@prisma/client';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import { checkoutBillReadiness } from '../../common/checkout-integrity.util';
import { assertExpectedVersion } from '../../common/optimistic-concurrency.util';
import {
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
} from '../../common/permissions';
import {
  roundMoneyDecimal,
  serializeMoney,
  sumMoneyDecimal,
  toPrismaDecimal,
} from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CashService } from '../cash/cash.service';
import { DomainEventOutboxService } from '../foundation/domain-event-outbox.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import {
  CreateCheckoutPaymentDto,
  PreviewPaymentGroupsDto,
} from './dto/chunk04.dto';
import {
  PaymentAllocationService,
  type AllocationSnapshotInput,
} from './payment-allocation.service';
import { SettlementStateService } from './settlement-state.service';

const paymentSettlementInclude = {
  guestCheck: {
    select: {
      id: true,
      status: true,
      version: true,
      currentSettlementId: true,
      shopOrders: {
        select: { id: true, status: true, label: true, updatedAt: true },
      },
      playSessions: {
        select: {
          id: true,
          status: true,
          reservationId: true,
          label: true,
          endedAt: true,
          updatedAt: true,
        },
      },
      reservations: {
        select: {
          id: true,
          status: true,
          guestName: true,
          resourceId: true,
          billedAmount: true,
          updatedAt: true,
        },
      },
    },
  },
  snapshots: {
    orderBy: { position: 'asc' as const },
    include: {
      allocations: {
        where: { payment: { status: CheckoutPaymentStatus.SUCCESS } },
        select: { amount: true },
      },
    },
  },
  payments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      allocations: { orderBy: { createdAt: 'asc' as const } },
    },
  },
} satisfies Prisma.CheckSettlementInclude;

type PaymentSettlement = Prisma.CheckSettlementGetPayload<{
  include: typeof paymentSettlementInclude;
}>;

@Injectable()
export class CheckoutPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly allocator: PaymentAllocationService,
    private readonly states: SettlementStateService,
    private readonly outbox: DomainEventOutboxService,
    private readonly audit: AuditService,
    private readonly cash: CashService,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: PermissionKey) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  private async requireChunk04(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'checkout_split'))) {
      throw new ForbiddenException(
        'Split and partial checkout is not enabled for this venue',
      );
    }
  }

  private allocationInputs(settlement: PaymentSettlement): AllocationSnapshotInput[] {
    return settlement.snapshots.map((snapshot) => ({
      id: snapshot.id,
      position: snapshot.position,
      sourceType: snapshot.sourceType,
      sourceId: snapshot.sourceId,
      lineReference: snapshot.lineReference,
      description: snapshot.description,
      quantity: snapshot.quantity,
      finalAmount: snapshot.finalAmount,
      allocatedAmount: sumMoneyDecimal(
        ...snapshot.allocations.map((allocation) => allocation.amount),
      ),
      currency: snapshot.currency,
    }));
  }

  private assertCurrentSettlement(settlement: PaymentSettlement) {
    if (settlement.guestCheck.status !== 'OPEN') {
      throw new ConflictException('Guest check is no longer open');
    }
    if (settlement.guestCheck.currentSettlementId !== settlement.id) {
      throw new ConflictException(
        'Settlement is stale. Refresh checkout before recording payment.',
      );
    }
    if (settlement.state === 'PAID' || settlement.state === 'CLOSED') {
      throw new ConflictException('Settlement is already fully paid');
    }
    if (settlement.state === 'VOID') {
      throw new ConflictException('Settlement is void');
    }
  }

  private assertBillReadyForPayment(settlement: PaymentSettlement) {
    const readiness = checkoutBillReadiness(settlement.guestCheck);
    if (!readiness.ready) {
      throw apiConflictException(
        ApiDomainErrorCode.STATE_CONFLICT,
        'Finalize open orders and standalone play timers before taking payment.',
        {
          stage: 'FINALIZE_BILL',
          blockers: readiness.blockers,
        },
      );
    }

    const changedSources = [
      ...settlement.guestCheck.shopOrders.map((row) => ({
        sourceType: 'SHOP_ORDER',
        sourceId: row.id,
        updatedAt: row.updatedAt,
      })),
      ...settlement.guestCheck.playSessions.map((row) => ({
        sourceType: 'PLAY_SESSION',
        sourceId: row.id,
        updatedAt: row.updatedAt,
      })),
      ...settlement.guestCheck.reservations.map((row) => ({
        sourceType: 'RESERVATION',
        sourceId: row.id,
        updatedAt: row.updatedAt,
      })),
    ].filter((row) => row.updatedAt.getTime() > settlement.createdAt.getTime());

    if (changedSources.length > 0) {
      throw apiConflictException(
        ApiDomainErrorCode.VERSION_CONFLICT,
        'Linked activity changed after this bill was calculated. Recalculate checkout before taking payment.',
        {
          stage: 'SOURCE_CHANGED',
          sources: changedSources.map(({ sourceType, sourceId }) => ({
            sourceType,
            sourceId,
          })),
        },
      );
    }
  }

  private serializePaymentState(settlement: PaymentSettlement) {
    const successful = settlement.payments.filter(
      (payment) => payment.status === CheckoutPaymentStatus.SUCCESS,
    );
    const paidAmount = sumMoneyDecimal(
      ...successful.map((payment) => payment.amount),
    );
    return {
      settlementId: settlement.id,
      guestCheckId: settlement.guestCheckId,
      guestCheckVersion: settlement.guestCheck.version,
      state: settlement.state,
      currency: settlement.currency,
      total: serializeMoney(settlement.total),
      paidAmount: serializeMoney(paidAmount),
      amountDue: serializeMoney(settlement.amountDue),
      payments: settlement.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: serializeMoney(payment.amount),
        currency: payment.currency,
        note: payment.note,
        succeededAt: payment.succeededAt?.toISOString() ?? null,
        failedAt: payment.failedAt?.toISOString() ?? null,
        createdAt: payment.createdAt.toISOString(),
        allocations: payment.allocations.map((allocation) => ({
          id: allocation.id,
          snapshotId: allocation.snapshotId,
          allocationKind: allocation.allocationKind,
          amount: serializeMoney(allocation.amount),
          quantity: serializeMoney(allocation.quantity),
          sourceType: allocation.sourceType,
          sourceId: allocation.sourceId,
        })),
      })),
    };
  }

  async getPaymentState(actor: JwtAccessPayload, settlementId: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    await this.requireChunk04(shopId);
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId },
      include: paymentSettlementInclude,
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return this.serializePaymentState(settlement);
  }

  async previewGroups(
    actor: JwtAccessPayload,
    settlementId: string,
    dto: PreviewPaymentGroupsDto,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    await this.requireChunk04(shopId);
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId },
      include: paymentSettlementInclude,
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    this.assertCurrentSettlement(settlement);

    const result = this.allocator.previewGroups(
      dto.mode,
      this.allocationInputs(settlement),
      {
        parts: dto.parts,
        percentage: dto.percentage,
        customAmounts: dto.customAmounts,
      },
    );
    return {
      settlementId: settlement.id,
      guestCheckId: settlement.guestCheckId,
      guestCheckVersion: settlement.guestCheck.version,
      state: settlement.state,
      amountDue: serializeMoney(settlement.amountDue),
      ...result,
    };
  }

  async createPayment(
    actor: JwtAccessPayload,
    settlementId: string,
    dto: CreateCheckoutPaymentDto,
    correlationId?: string,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requireChunk04(shopId);

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CheckSettlement" WHERE "id" = ${settlementId} AND "shopId" = ${shopId} FOR UPDATE`,
      );

      const settlement = await tx.checkSettlement.findFirst({
        where: { id: settlementId, shopId },
        include: paymentSettlementInclude,
      });
      if (!settlement) throw new NotFoundException('Settlement not found');
      this.assertCurrentSettlement(settlement);
      assertExpectedVersion(
        settlement.guestCheck.version,
        dto.expectedCheckVersion,
        {
          aggregateType: 'guest_check',
          aggregateId: settlement.guestCheckId,
        },
      );
      this.assertBillReadyForPayment(settlement);

      const cashSessionId =
        dto.method === CheckoutPaymentMethod.CASH
          ? await this.cash.requireSessionForCashPayment(
              tx,
              actor,
              settlement.currency,
            )
          : null;

      const remainingRows = this.allocator.buildRemainingSnapshots(
        this.allocationInputs(settlement),
      );
      const byId = new Map(
        remainingRows.map((row) => [row.id, row] as const),
      );
      const seen = new Set<string>();
      const normalized = dto.allocations.map((allocation) => {
        if (seen.has(allocation.snapshotId)) {
          throw new BadRequestException(
            `Duplicate allocation for snapshot ${allocation.snapshotId}`,
          );
        }
        seen.add(allocation.snapshotId);
        const row = byId.get(allocation.snapshotId);
        if (!row) {
          throw new BadRequestException(
            `Snapshot ${allocation.snapshotId} has no remaining balance`,
          );
        }
        const amount = roundMoneyDecimal(allocation.amount, 4);
        if (amount.lte(0)) {
          throw new BadRequestException(
            'Allocation amount must be greater than zero',
          );
        }
        if (amount.gt(row.remainingAmountDecimal)) {
          throw new BadRequestException(
            `Allocation exceeds remaining balance for snapshot ${row.id}`,
          );
        }
        const quantity = row.finalAmountDecimal.gt(0)
          ? roundMoneyDecimal(
              toPrismaDecimal(row.quantity)
                .mul(amount)
                .div(row.finalAmountDecimal),
              4,
            )
          : new Prisma.Decimal(0);
        return { row, amount, quantity };
      });

      const paymentAmount = sumMoneyDecimal(
        ...normalized.map((allocation) => allocation.amount),
      );
      if (paymentAmount.lte(0)) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
      if (paymentAmount.gt(settlement.amountDue)) {
        throw new BadRequestException('Payment exceeds settlement amount due');
      }

      const newAmountDue = roundMoneyDecimal(
        settlement.amountDue.sub(paymentAmount),
        4,
      );
      if (newAmountDue.isNegative()) {
        throw new ConflictException('Payment would make amount due negative');
      }
      const nextState = newAmountDue.isZero() ? 'PAID' : 'PARTIALLY_PAID';
      if (settlement.state !== nextState) {
        this.states.assertTransition(settlement.state, nextState);
      }

      const claimedCheck = await tx.guestCheck.updateMany({
        where: {
          id: settlement.guestCheckId,
          shopId,
          status: 'OPEN',
          version: dto.expectedCheckVersion,
          currentSettlementId: settlement.id,
        },
        data: { version: { increment: 1 } },
      });
      if (claimedCheck.count !== 1) {
        throw new ConflictException(
          'Guest check changed while payment was being recorded',
        );
      }

      const payment = await tx.payment.create({
        data: {
          shopId,
          settlementId: settlement.id,
          method: dto.method,
          status: CheckoutPaymentStatus.SUCCESS,
          amount: paymentAmount,
          currency: settlement.currency,
          note: dto.note?.trim() || null,
          createdById: actor.sub,
          correlationId: correlationId ?? null,
          succeededAt: now,
        },
      });

      const cashMovement =
        dto.method === CheckoutPaymentMethod.CASH
          ? await this.cash.recordCashSale(tx, {
              shopId,
              cashSessionId,
              actorId: actor.sub,
              paymentId: payment.id,
              amount: paymentAmount,
              currency: settlement.currency,
            })
          : null;

      await tx.paymentAllocation.createMany({
        data: normalized.map(({ row, amount, quantity }) => ({
          shopId,
          paymentId: payment.id,
          settlementId: settlement.id,
          snapshotId: row.id,
          allocationKind: dto.allocationKind,
          amount,
          quantity,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
        })),
      });

      await tx.checkSettlement.update({
        where: { id: settlement.id },
        data: {
          amountDue: newAmountDue,
          state: nextState,
        },
      });

      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'check_settlement',
        aggregateId: settlement.id,
        eventType: 'settlement.payment-recorded',
        payload: {
          settlementId: settlement.id,
          guestCheckId: settlement.guestCheckId,
          paymentId: payment.id,
          method: dto.method,
          allocationKind: dto.allocationKind,
          amount: serializeMoney(paymentAmount),
          amountDue: serializeMoney(newAmountDue),
          state: nextState,
          correlationId: correlationId ?? null,
        },
      });

      const hydrated = await tx.checkSettlement.findFirst({
        where: { id: settlement.id, shopId },
        include: paymentSettlementInclude,
      });
      if (!hydrated) throw new NotFoundException('Settlement not found');
      return {
        paymentId: payment.id,
        cashSessionId,
        cashMovementId: cashMovement?.id ?? null,
        settlement: hydrated,
      };
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'checkout.payment.record',
      summary: 'Recorded checkout payment allocation',
      meta: {
        settlementId,
        guestCheckId: result.settlement.guestCheckId,
        paymentId: result.paymentId,
        cashSessionId: result.cashSessionId,
        cashMovementId: result.cashMovementId,
        method: dto.method,
        allocationKind: dto.allocationKind,
        amountDue: serializeMoney(result.settlement.amountDue),
        correlationId: correlationId ?? null,
        providerChargeCreated: false,
        transactionRevenueCreated: false,
        ledgerEntryCreated: false,
      },
    });

    return this.serializePaymentState(result.settlement);
  }
}
