import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  GuestCheck,
  GuestCheckStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import { guestCheckCloseReadiness } from '../../common/guest-check-close.util';
import { computeGuestCheckRunningTotal } from '../../common/guest-check-total.util';
import { postReservationBilled } from '../../common/ledger-post.util';
import { serializeMoney, sumMoneyDecimal } from '../../common/money.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AttachGuestCheckDto,
  CreateGuestCheckDto,
  DetachGuestCheckDto,
  SettleGuestCheckDto,
  UpdateGuestCheckDto,
} from './dto/guest-check.dto';

const childInclude = {
  shopOrders: {
    select: {
      id: true,
      status: true,
      total: true,
      label: true,
      reservationFee: true,
      guestCount: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  playSessions: {
    select: {
      id: true,
      status: true,
      amount: true,
      reservationId: true,
      label: true,
      startedAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  reservations: {
    select: {
      id: true,
      guestName: true,
      billedAmount: true,
      billedAt: true,
      resourceId: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
    orderBy: { startsAt: 'desc' as const },
  },
} satisfies Prisma.GuestCheckInclude;

const currentSettlementSelect = {
  id: true,
  state: true,
  amountDue: true,
  currency: true,
  snapshots: {
    select: {
      sourceType: true,
      sourceId: true,
      finalAmount: true,
    },
  },
  payments: {
    where: { status: 'SUCCESS' as const },
    select: { method: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CheckSettlementSelect;

type CheckWithChildren = Prisma.GuestCheckGetPayload<{
  include: typeof childInclude;
}>;

type CurrentSettlement = Prisma.CheckSettlementGetPayload<{
  select: typeof currentSettlementSelect;
}>;

@Injectable()
export class GuestCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assert(actor: JwtAccessPayload, perm: string) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (
      hasPermission(
        actor.perms ?? '',
        perm as (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
      )
    ) {
      return;
    }
    throw new ForbiddenException(`Missing ${perm}`);
  }

  private serialize(check: CheckWithChildren) {
    const totals = computeGuestCheckRunningTotal({
      orders: check.shopOrders,
      playSessions: check.playSessions,
      reservations: check.reservations,
    });
    return {
      id: check.id,
      shopId: check.shopId,
      status: check.status,
      version: check.version,
      currentSettlementId: check.currentSettlementId,
      guestName: check.guestName,
      guestEmail: check.guestEmail,
      guestPhone: check.guestPhone,
      partySize: check.partySize,
      label: check.label,
      note: check.note,
      currency: check.currency,
      paymentMethod: check.paymentMethod,
      openedAt: check.openedAt.toISOString(),
      settledAt: check.settledAt?.toISOString() ?? null,
      voidedAt: check.voidedAt?.toISOString() ?? null,
      createdById: check.createdById,
      createdAt: check.createdAt.toISOString(),
      updatedAt: check.updatedAt.toISOString(),
      shopOrders: check.shopOrders.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total.toFixed(4),
        label: o.label,
        reservationFee: o.reservationFee?.toFixed(4) ?? null,
        guestCount: o.guestCount,
        createdAt: o.createdAt.toISOString(),
        completedAt: o.completedAt?.toISOString() ?? null,
      })),
      playSessions: check.playSessions.map((p) => ({
        id: p.id,
        status: p.status,
        amount: p.amount.toFixed(4),
        reservationId: p.reservationId,
        label: p.label,
        startedAt: p.startedAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
      })),
      reservations: check.reservations.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        billedAmount: r.billedAmount?.toFixed(4) ?? null,
        billedAt: r.billedAt?.toISOString() ?? null,
        resourceId: r.resourceId,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        status: r.status,
      })),
      runningTotal: totals.runningTotal,
      menuTotal: totals.menuTotal,
      playTotal: totals.playTotal,
      reservationTotal: totals.reservationTotal,
      totalLines: totals.lines,
      closeReadiness: guestCheckCloseReadiness(check),
    };
  }

  private async loadCheck(shopId: string, id: string): Promise<CheckWithChildren> {
    const check = await this.prisma.guestCheck.findFirst({
      where: { id, shopId },
      include: childInclude,
    });
    if (!check) throw new NotFoundException('Guest check not found');
    return check;
  }

  private assertOpen(check: Pick<GuestCheck, 'status'>) {
    if (check.status !== 'OPEN') {
      throw new ConflictException('Guest check is not open');
    }
  }

  private async loadCurrentSettlement(
    shopId: string,
    check: Pick<CheckWithChildren, 'id' | 'currentSettlementId'>,
  ): Promise<CurrentSettlement | null> {
    if (!check.currentSettlementId) return null;
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: {
        id: check.currentSettlementId,
        shopId,
        guestCheckId: check.id,
      },
      select: currentSettlementSelect,
    });
    if (!settlement) {
      throw apiConflictException(
        ApiDomainErrorCode.STATE_CONFLICT,
        'Checkout state is stale. Refresh this check before continuing.',
        { guestCheckId: check.id },
      );
    }
    return settlement;
  }

  private paymentLockError(settlement: CurrentSettlement): ConflictException {
    return apiConflictException(
      ApiDomainErrorCode.GUEST_CHECK_PAYMENT_LOCKED,
      'This check already has recorded payments. Its bill can no longer be changed or voided.',
      {
        settlementId: settlement.id,
        settlementState: settlement.state,
        amountDue: serializeMoney(settlement.amountDue),
      },
    );
  }

  private assertSettlementHasNoPayment(settlement: CurrentSettlement | null) {
    if (!settlement) return;
    if (
      settlement.payments.length > 0 ||
      settlement.state === 'PARTIALLY_PAID' ||
      settlement.state === 'PAID' ||
      settlement.state === 'CLOSED'
    ) {
      throw this.paymentLockError(settlement);
    }
  }

  private async voidUnpaidSettlement(
    db: Prisma.TransactionClient,
    shopId: string,
    settlement: CurrentSettlement | null,
  ) {
    if (!settlement) return;
    this.assertSettlementHasNoPayment(settlement);
    if (settlement.state === 'VOID') return;
    const result = await db.checkSettlement.updateMany({
      where: {
        id: settlement.id,
        shopId,
        state: { in: ['OPEN', 'CALCULATED'] },
      },
      data: { state: 'VOID' },
    });
    if (result.count !== 1) {
      const latest = await db.checkSettlement.findFirst({
        where: { id: settlement.id, shopId },
        select: currentSettlementSelect,
      });
      if (latest) throw this.paymentLockError(latest);
      throw new ConflictException('Checkout changed while the bill was being edited');
    }
  }

  private legacyPaymentMethod(settlement: CurrentSettlement): PaymentMethod | null {
    const methods = [...new Set(settlement.payments.map((payment) => payment.method))];
    if (methods.length === 0) return null;
    if (methods.length === 1 && methods[0] === 'CASH') return 'CASH';
    if (methods.length === 1 && methods[0] === 'MANUAL_CARD') return 'CARD';
    return 'OTHER';
  }

  private assertSettlementPaid(settlement: CurrentSettlement | null) {
    if (!settlement) return;
    const zeroDue = settlement.amountDue.isZero();
    const zeroChargeCalculated =
      settlement.state === 'CALCULATED' &&
      zeroDue &&
      settlement.payments.length === 0;
    if ((settlement.state === 'PAID' && zeroDue) || zeroChargeCalculated) return;
    throw apiConflictException(
      ApiDomainErrorCode.GUEST_CHECK_PAYMENT_INCOMPLETE,
      'Finish payment before closing this check.',
      {
        settlementId: settlement.id,
        settlementState: settlement.state,
        amountDue: serializeMoney(settlement.amountDue),
      },
    );
  }

  private async reconcilePaidReservationBilling(
    actor: JwtAccessPayload,
    shopId: string,
    check: CheckWithChildren,
    settlement: CurrentSettlement | null,
  ): Promise<number> {
    if (!settlement || !settlement.amountDue.isZero()) return 0;
    if (settlement.state !== 'PAID' && settlement.state !== 'CALCULATED') return 0;

    const candidates = check.reservations.filter(
      (reservation) =>
        reservation.resourceId != null &&
        reservation.billedAmount == null &&
        reservation.status !== 'CANCELED' &&
        reservation.status !== 'NO_SHOW',
    );
    if (candidates.length === 0) return 0;

    const now = new Date();
    const paymentMethod = this.legacyPaymentMethod(settlement) ?? 'OTHER';
    let finalized = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const reservation of candidates) {
        const snapshots = settlement.snapshots.filter(
          (snapshot) =>
            snapshot.sourceType === 'RESERVATION' &&
            snapshot.sourceId === reservation.id,
        );
        if (snapshots.length === 0) continue;
        const billedAmount = sumMoneyDecimal(
          ...snapshots.map((snapshot) => snapshot.finalAmount),
        );
        const claimed = await tx.reservation.updateMany({
          where: {
            id: reservation.id,
            shopId,
            guestCheckId: check.id,
            billedAmount: null,
            status: { notIn: ['CANCELED', 'NO_SHOW'] },
          },
          data: {
            billedAmount,
            billedAt: now,
            billingPaymentMethod: paymentMethod,
          },
        });
        if (claimed.count !== 1) continue;
        finalized += 1;
        await postReservationBilled(tx, {
          shopId,
          reservationId: reservation.id,
          billedAmount,
          currency: settlement.currency,
          billedAt: now,
          resourceId: reservation.resourceId,
          createdById: actor.sub,
        });
      }
    });

    return finalized;
  }

  private requireAttachTarget(dto: AttachGuestCheckDto | DetachGuestCheckDto) {
    if (!dto.shopOrderId && !dto.playSessionId && !dto.reservationId) {
      throw new BadRequestException(
        'Provide shopOrderId, playSessionId, or reservationId',
      );
    }
  }

  async list(
    actor: JwtAccessPayload,
    status: GuestCheckStatus | 'ALL' = 'OPEN',
  ) {
    this.assert(actor, PERMISSIONS.TRANSACTION_READ);
    const shopId = requireShopId(actor);
    const where: Prisma.GuestCheckWhereInput = { shopId };
    if (status !== 'ALL') where.status = status;
    const rows = await this.prisma.guestCheck.findMany({
      where,
      include: childInclude,
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    return {
      checks: rows.map((c) => this.serialize(c)),
      canWrite:
        actor.shopRole === 'OWNER' ||
        hasPermission(actor.perms ?? '', PERMISSIONS.TRANSACTION_WRITE),
    };
  }

  async get(actor: JwtAccessPayload, id: string) {
    this.assert(actor, PERMISSIONS.TRANSACTION_READ);
    const shopId = requireShopId(actor);
    return this.serialize(await this.loadCheck(shopId, id));
  }

  async create(actor: JwtAccessPayload, dto: CreateGuestCheckDto) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId },
      select: { currency: true },
    });
    if (!shop) throw new NotFoundException('Shop not found');

    const created = await this.prisma.guestCheck.create({
      data: {
        shopId,
        guestName: dto.guestName?.trim() || null,
        guestEmail: dto.guestEmail?.trim() || null,
        guestPhone: dto.guestPhone?.trim() || null,
        partySize: dto.partySize ?? 1,
        label: dto.label?.trim() || null,
        note: dto.note?.trim() || null,
        currency: shop.currency,
        createdById: actor.sub,
      },
      include: childInclude,
    });

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.create',
      summary: `Opened guest check${created.label ? ` (${created.label})` : ''}`,
      meta: { guestCheckId: created.id },
    });

    return this.serialize(created);
  }

  async update(actor: JwtAccessPayload, id: string, dto: UpdateGuestCheckDto) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    const existing = await this.loadCheck(shopId, id);
    this.assertOpen(existing);
    const settlement = await this.loadCurrentSettlement(shopId, existing);
    this.assertSettlementHasNoPayment(settlement);

    await this.prisma.$transaction(async (tx) => {
      await this.voidUnpaidSettlement(tx, shopId, settlement);
      const result = await tx.guestCheck.updateMany({
        where: { id, shopId, status: 'OPEN', version: existing.version },
        data: {
          ...(dto.guestName !== undefined
            ? { guestName: dto.guestName?.trim() || null }
            : {}),
          ...(dto.guestEmail !== undefined
            ? { guestEmail: dto.guestEmail?.trim() || null }
            : {}),
          ...(dto.guestPhone !== undefined
            ? { guestPhone: dto.guestPhone?.trim() || null }
            : {}),
          ...(dto.partySize !== undefined ? { partySize: dto.partySize } : {}),
          ...(dto.label !== undefined
            ? { label: dto.label?.trim() || null }
            : {}),
          ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
          currentSettlementId: null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException('Guest check changed while it was being updated');
      }
    });

    return this.serialize(await this.loadCheck(shopId, id));
  }

  async void(actor: JwtAccessPayload, id: string) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    const existing = await this.loadCheck(shopId, id);
    this.assertOpen(existing);
    const settlement = await this.loadCurrentSettlement(shopId, existing);
    this.assertSettlementHasNoPayment(settlement);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.voidUnpaidSettlement(tx, shopId, settlement);
      await tx.shopOrder.updateMany({
        where: { guestCheckId: id, shopId },
        data: { guestCheckId: null },
      });
      await tx.playSession.updateMany({
        where: { guestCheckId: id, shopId },
        data: { guestCheckId: null },
      });
      await tx.reservation.updateMany({
        where: { guestCheckId: id, shopId },
        data: { guestCheckId: null },
      });
      const result = await tx.guestCheck.updateMany({
        where: { id, shopId, status: 'OPEN', version: existing.version },
        data: {
          status: 'VOID',
          voidedAt: new Date(),
          currentSettlementId: null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException('Guest check changed while it was being voided');
      }
      return tx.guestCheck.findFirst({
        where: { id, shopId },
        include: childInclude,
      });
    });

    if (!updated) throw new NotFoundException('Guest check not found');

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.void',
      summary: 'Voided unpaid guest check (linked activity detached)',
      meta: { guestCheckId: id },
    });

    return this.serialize(updated);
  }

  /**
   * Close-out contract: tender must be complete, linked operations must be finalized,
   * then GuestCheck OPEN → SETTLED and CheckSettlement PAID → CLOSED atomically.
   * Paid resource reservations are reconciled from the immutable checkout snapshot so
   * Checkout V2 never asks the cashier to record the same payment a second time.
   */
  async settle(actor: JwtAccessPayload, id: string, dto: SettleGuestCheckDto = {}) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    const shopId = requireShopId(actor);
    let existing = await this.loadCheck(shopId, id);
    this.assertOpen(existing);
    const settlement = await this.loadCurrentSettlement(shopId, existing);
    this.assertSettlementPaid(settlement);

    const autoFinalizedReservations = await this.reconcilePaidReservationBilling(
      actor,
      shopId,
      existing,
      settlement,
    );
    if (autoFinalizedReservations > 0) {
      existing = await this.loadCheck(shopId, id);
    }

    const readiness = guestCheckCloseReadiness(existing);
    if (!readiness.ready) {
      throw apiConflictException(
        ApiDomainErrorCode.GUEST_CHECK_ACTIVITY_OPEN,
        'This check still has linked activity that needs attention before it can close.',
        { blockers: readiness.blockers },
      );
    }

    const totals = computeGuestCheckRunningTotal({
      orders: existing.shopOrders,
      playSessions: existing.playSessions,
      reservations: existing.reservations,
    });
    const effectivePaymentMethod =
      dto.paymentMethod ??
      (settlement ? this.legacyPaymentMethod(settlement) ?? undefined : undefined);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (settlement) {
        if (
          settlement.state === 'CALCULATED' &&
          settlement.amountDue.isZero() &&
          settlement.payments.length === 0
        ) {
          const promoted = await tx.checkSettlement.updateMany({
            where: {
              id: settlement.id,
              shopId,
              guestCheckId: id,
              state: 'CALCULATED',
              amountDue: 0,
            },
            data: { state: 'PAID' },
          });
          if (promoted.count !== 1) {
            throw new ConflictException('Checkout changed while it was being closed');
          }
        }
        const closedSettlement = await tx.checkSettlement.updateMany({
          where: {
            id: settlement.id,
            shopId,
            guestCheckId: id,
            state: 'PAID',
            amountDue: 0,
          },
          data: { state: 'CLOSED' },
        });
        if (closedSettlement.count !== 1) {
          throw new ConflictException('Checkout changed while it was being closed');
        }
      }

      const result = await tx.guestCheck.updateMany({
        where: {
          id,
          shopId,
          status: 'OPEN',
          version: existing.version,
          ...(settlement ? { currentSettlementId: settlement.id } : {}),
        },
        data: {
          status: 'SETTLED',
          settledAt: new Date(),
          currentSettlementId: null,
          version: { increment: 1 },
          ...(effectivePaymentMethod !== undefined
            ? { paymentMethod: effectivePaymentMethod }
            : {}),
          ...(dto.note !== undefined
            ? { note: dto.note?.trim() || null }
            : {}),
        },
      });
      if (result.count !== 1) {
        throw new ConflictException('Guest check changed while it was being closed');
      }
      return tx.guestCheck.findFirst({
        where: { id, shopId },
        include: childInclude,
      });
    });

    if (!updated) throw new NotFoundException('Guest check not found');

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.settle',
      summary: 'Closed paid guest check',
      meta: {
        guestCheckId: id,
        settlementId: settlement?.id ?? null,
        runningTotal: totals.runningTotal,
        paymentMethod: effectivePaymentMethod ?? null,
        autoFinalizedReservations,
      },
    });

    return this.serialize(updated);
  }

  async attach(actor: JwtAccessPayload, id: string, dto: AttachGuestCheckDto) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    this.requireAttachTarget(dto);
    const shopId = requireShopId(actor);
    const check = await this.loadCheck(shopId, id);
    this.assertOpen(check);
    const settlement = await this.loadCurrentSettlement(shopId, check);
    this.assertSettlementHasNoPayment(settlement);

    await this.prisma.$transaction(async (tx) => {
      await this.voidUnpaidSettlement(tx, shopId, settlement);

      if (dto.shopOrderId) {
        const order = await tx.shopOrder.findFirst({
          where: { id: dto.shopOrderId, shopId },
          select: { id: true, guestCheckId: true },
        });
        if (!order) throw new NotFoundException('Shop order not found');
        if (order.guestCheckId && order.guestCheckId !== id) {
          throw new ConflictException('Shop order already attached to another check');
        }
        await tx.shopOrder.updateMany({
          where: { id: order.id, shopId },
          data: { guestCheckId: id },
        });
      }

      if (dto.playSessionId) {
        const play = await tx.playSession.findFirst({
          where: { id: dto.playSessionId, shopId },
          select: { id: true, guestCheckId: true },
        });
        if (!play) throw new NotFoundException('Play session not found');
        if (play.guestCheckId && play.guestCheckId !== id) {
          throw new ConflictException(
            'Play session already attached to another check',
          );
        }
        await tx.playSession.updateMany({
          where: { id: play.id, shopId },
          data: { guestCheckId: id },
        });
      }

      if (dto.reservationId) {
        const reservation = await tx.reservation.findFirst({
          where: { id: dto.reservationId, shopId },
          select: { id: true, guestCheckId: true },
        });
        if (!reservation) throw new NotFoundException('Reservation not found');
        if (reservation.guestCheckId && reservation.guestCheckId !== id) {
          throw new ConflictException(
            'Reservation already attached to another check',
          );
        }
        await tx.reservation.updateMany({
          where: { id: reservation.id, shopId },
          data: { guestCheckId: id },
        });
      }

      const invalidated = await tx.guestCheck.updateMany({
        where: { id, shopId, status: 'OPEN', version: check.version },
        data: { currentSettlementId: null, version: { increment: 1 } },
      });
      if (invalidated.count !== 1) {
        throw new ConflictException('Guest check changed while activity was attached');
      }
    });

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.attach',
      summary: 'Attached activity to guest check',
      meta: {
        guestCheckId: id,
        shopOrderId: dto.shopOrderId ?? null,
        playSessionId: dto.playSessionId ?? null,
        reservationId: dto.reservationId ?? null,
      },
    });

    return this.serialize(await this.loadCheck(shopId, id));
  }

  async detach(actor: JwtAccessPayload, id: string, dto: DetachGuestCheckDto) {
    this.assert(actor, PERMISSIONS.TRANSACTION_WRITE);
    this.requireAttachTarget(dto);
    const shopId = requireShopId(actor);
    const check = await this.loadCheck(shopId, id);
    this.assertOpen(check);
    const settlement = await this.loadCurrentSettlement(shopId, check);
    this.assertSettlementHasNoPayment(settlement);

    await this.prisma.$transaction(async (tx) => {
      await this.voidUnpaidSettlement(tx, shopId, settlement);

      if (dto.shopOrderId) {
        const result = await tx.shopOrder.updateMany({
          where: { id: dto.shopOrderId, shopId, guestCheckId: id },
          data: { guestCheckId: null },
        });
        if (result.count === 0) {
          throw new NotFoundException('Shop order not attached to this check');
        }
      }
      if (dto.playSessionId) {
        const result = await tx.playSession.updateMany({
          where: { id: dto.playSessionId, shopId, guestCheckId: id },
          data: { guestCheckId: null },
        });
        if (result.count === 0) {
          throw new NotFoundException('Play session not attached to this check');
        }
      }
      if (dto.reservationId) {
        const result = await tx.reservation.updateMany({
          where: { id: dto.reservationId, shopId, guestCheckId: id },
          data: { guestCheckId: null },
        });
        if (result.count === 0) {
          throw new NotFoundException('Reservation not attached to this check');
        }
      }

      const invalidated = await tx.guestCheck.updateMany({
        where: { id, shopId, status: 'OPEN', version: check.version },
        data: { currentSettlementId: null, version: { increment: 1 } },
      });
      if (invalidated.count !== 1) {
        throw new ConflictException('Guest check changed while activity was detached');
      }
    });

    await this.audit.record(actor, {
      section: 'operations',
      action: 'guest_check.detach',
      summary: 'Detached activity from guest check',
      meta: {
        guestCheckId: id,
        shopOrderId: dto.shopOrderId ?? null,
        playSessionId: dto.playSessionId ?? null,
        reservationId: dto.reservationId ?? null,
      },
    });

    return this.serialize(await this.loadCheck(shopId, id));
  }
}
