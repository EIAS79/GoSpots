import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  Prisma,
  ShiftCloseApprovalStatus,
} from '@prisma/client';
import {
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
} from '../../common/permissions';
import {
  roundMoneyDecimal,
  serializeMoney,
  sumMoneyDecimal,
} from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { DomainEventOutboxService } from '../foundation/domain-event-outbox.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import {
  ApproveCashVarianceDto,
  CloseCashSessionDto,
  CreateCashMovementDto,
  OpenCashSessionDto,
  SubmitCashCountDto,
  UpdateCashPolicyDto,
} from './dto/cash.dto';

const sessionInclude = {
  drawer: true,
  movements: { orderBy: { occurredAt: 'asc' as const } },
  counts: { orderBy: { submittedAt: 'desc' as const } },
  approvals: { orderBy: { requestedAt: 'desc' as const } },
} satisfies Prisma.CashSessionInclude;

type SessionWithDetails = Prisma.CashSessionGetPayload<{
  include: typeof sessionInclude;
}>;

type CashPolicy = {
  cashSessionRequired: boolean;
  cashBlindCountEnabled: boolean;
  cashVarianceApprovalThreshold: Prisma.Decimal;
  currency: string;
};

function positiveMoney(raw: string, label: string): Prisma.Decimal {
  let value: Prisma.Decimal;
  try {
    value = roundMoneyDecimal(raw, 4);
  } catch {
    throw new BadRequestException(`${label} must be a valid amount`);
  }
  if (value.lte(0)) {
    throw new BadRequestException(`${label} must be greater than zero`);
  }
  return value;
}

function nonNegativeMoney(raw: string, label: string): Prisma.Decimal {
  let value: Prisma.Decimal;
  try {
    value = roundMoneyDecimal(raw, 4);
  } catch {
    throw new BadRequestException(`${label} must be a valid amount`);
  }
  if (value.lt(0)) {
    throw new BadRequestException(`${label} cannot be negative`);
  }
  return value;
}

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly outbox: DomainEventOutboxService,
    private readonly audit: AuditService,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: PermissionKey) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  private can(actor: JwtAccessPayload, permission: PermissionKey) {
    return (
      actor.shopRole === 'OWNER' ||
      hasPermission(actor.perms ?? '', permission)
    );
  }

  private async requireChunk05(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'cash_sessions'))) {
      throw new ForbiddenException('Cash sessions are not enabled for this venue');
    }
  }

  private async policy(
    db: Prisma.TransactionClient | PrismaService,
    shopId: string,
  ): Promise<CashPolicy> {
    const shop = await db.shop.findUnique({
      where: { id: shopId },
      select: {
        cashSessionRequired: true,
        cashBlindCountEnabled: true,
        cashVarianceApprovalThreshold: true,
        currency: true,
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  private expectedCash(
    openingFloat: Prisma.Decimal,
    movements: Array<{ type: CashMovementType; amount: Prisma.Decimal }>,
  ) {
    let expected = roundMoneyDecimal(openingFloat, 4);
    for (const movement of movements) {
      const amount = roundMoneyDecimal(movement.amount, 4);
      if (
        movement.type === CashMovementType.CASH_SALE ||
        movement.type === CashMovementType.PAY_IN
      ) {
        expected = expected.add(amount);
      } else {
        expected = expected.sub(amount);
      }
    }
    return roundMoneyDecimal(expected, 4);
  }

  private movementTotals(
    movements: Array<{ type: CashMovementType; amount: Prisma.Decimal }>,
  ) {
    const byType = (type: CashMovementType) =>
      sumMoneyDecimal(
        ...movements
          .filter((movement) => movement.type === type)
          .map((movement) => movement.amount),
      );
    return {
      cashSales: byType(CashMovementType.CASH_SALE),
      payIns: byType(CashMovementType.PAY_IN),
      payOuts: byType(CashMovementType.PAY_OUT),
      cashRefunds: byType(CashMovementType.CASH_REFUND),
      safeDrops: byType(CashMovementType.SAFE_DROP),
    };
  }

  private serializeSession(
    session: SessionWithDetails,
    options: { revealExpected: boolean },
  ) {
    const expected = this.expectedCash(session.openingFloat, session.movements);
    const totals = this.movementTotals(session.movements);
    const latestCount = session.counts[0] ?? null;
    const latestApproval = latestCount
      ? session.approvals.find(
          (approval) => approval.cashCountId === latestCount.id,
        ) ?? null
      : null;

    return {
      id: session.id,
      status: session.status,
      drawer: {
        id: session.drawer.id,
        name: session.drawer.name,
      },
      openedById: session.openedById,
      openedAt: session.openedAt.toISOString(),
      openingFloat: serializeMoney(session.openingFloat),
      currency: session.currency,
      version: session.version,
      expectedCash: options.revealExpected ? serializeMoney(expected) : null,
      expectedHidden: !options.revealExpected,
      movementTotals: {
        cashSales: serializeMoney(totals.cashSales),
        payIns: serializeMoney(totals.payIns),
        payOuts: serializeMoney(totals.payOuts),
        cashRefunds: serializeMoney(totals.cashRefunds),
        safeDrops: serializeMoney(totals.safeDrops),
      },
      movements: session.movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: serializeMoney(movement.amount),
        currency: movement.currency,
        reasonCategory: movement.reasonCategory,
        note: movement.note,
        actorId: movement.actorId,
        paymentId: movement.paymentId,
        occurredAt: movement.occurredAt.toISOString(),
      })),
      latestCount: latestCount
        ? {
            id: latestCount.id,
            countedAmount: serializeMoney(latestCount.countedAmount),
            expectedCashAtSubmission: serializeMoney(
              latestCount.expectedCashAtSubmission,
            ),
            variance: serializeMoney(latestCount.variance),
            blindCount: latestCount.blindCount,
            actorId: latestCount.actorId,
            submittedAt: latestCount.submittedAt.toISOString(),
            approval: latestApproval
              ? {
                  id: latestApproval.id,
                  status: latestApproval.status,
                  approvedById: latestApproval.approvedById,
                  requestedAt: latestApproval.requestedAt.toISOString(),
                  decidedAt: latestApproval.decidedAt?.toISOString() ?? null,
                }
              : null,
          }
        : null,
      closedExpectedCash: session.closedExpectedCash
        ? serializeMoney(session.closedExpectedCash)
        : null,
      countedCash: session.countedCash
        ? serializeMoney(session.countedCash)
        : null,
      variance: session.variance ? serializeMoney(session.variance) : null,
      closedAt: session.closedAt?.toISOString() ?? null,
      closedById: session.closedById,
      closeNote: session.closeNote,
    };
  }

  async getPolicy(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);
    const policy = await this.policy(this.prisma, shopId);
    return {
      cashSessionRequired: policy.cashSessionRequired,
      cashBlindCountEnabled: policy.cashBlindCountEnabled,
      cashVarianceApprovalThreshold: serializeMoney(
        policy.cashVarianceApprovalThreshold,
      ),
      currency: policy.currency,
      canManage: this.can(actor, PERMISSIONS.SHOP_MANAGE),
    };
  }

  async updatePolicy(actor: JwtAccessPayload, dto: UpdateCashPolicyDto) {
    this.assertPermission(actor, PERMISSIONS.SHOP_MANAGE);
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);
    const threshold =
      dto.cashVarianceApprovalThreshold === undefined
        ? undefined
        : nonNegativeMoney(
            dto.cashVarianceApprovalThreshold,
            'Variance approval threshold',
          );

    await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        cashSessionRequired: dto.cashSessionRequired,
        cashBlindCountEnabled: dto.cashBlindCountEnabled,
        cashVarianceApprovalThreshold: threshold,
      },
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'cash.policy.update',
      summary: 'Updated cash-session policy',
      meta: {
        cashSessionRequired: dto.cashSessionRequired,
        cashBlindCountEnabled: dto.cashBlindCountEnabled,
        cashVarianceApprovalThreshold:
          threshold === undefined ? undefined : serializeMoney(threshold),
      },
    });
    return this.getPolicy(actor);
  }

  async openSession(actor: JwtAccessPayload, dto: OpenCashSessionDto) {
    this.assertPermission(actor, PERMISSIONS.CASH_OPEN);
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);
    const openingFloat = nonNegativeMoney(dto.openingFloat, 'Opening float');

    let session: SessionWithDetails;
    try {
      session = await this.prisma.$transaction(async (tx) => {
        const policy = await this.policy(tx, shopId);
        const alreadyOpen = await tx.cashSession.findFirst({
          where: {
            shopId,
            openedById: actor.sub,
            status: CashSessionStatus.OPEN,
          },
        });
        if (alreadyOpen) {
          throw new ConflictException('You already have an open cash session');
        }

        let drawer = dto.drawerId
          ? await tx.cashDrawer.findFirst({
              where: { id: dto.drawerId, shopId, isActive: true },
            })
          : await tx.cashDrawer.findFirst({
              where: { shopId, isActive: true },
              orderBy: { createdAt: 'asc' },
            });
        if (dto.drawerId && !drawer) {
          throw new NotFoundException('Cash drawer not found');
        }
        if (!drawer) {
          drawer = await tx.cashDrawer.create({
            data: { shopId, name: 'Main drawer' },
          });
        }

        const created = await tx.cashSession.create({
          data: {
            shopId,
            drawerId: drawer.id,
            openedById: actor.sub,
            openingFloat,
            currency: policy.currency,
          },
          include: sessionInclude,
        });
        await this.outbox.enqueue(tx, {
          shopId,
          aggregateType: 'cash_session',
          aggregateId: created.id,
          eventType: 'cash-session.opened',
          payload: {
            cashSessionId: created.id,
            drawerId: drawer.id,
            openedById: actor.sub,
            openingFloat: serializeMoney(openingFloat),
            currency: policy.currency,
          },
        });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Cash drawer already has an open session');
      }
      throw error;
    }

    await this.audit.record(actor, {
      section: 'finance',
      action: 'cash.session.open',
      summary: 'Opened cash session',
      meta: {
        cashSessionId: session.id,
        drawerId: session.drawerId,
        openingFloat: serializeMoney(session.openingFloat),
        currency: session.currency,
      },
    });
    return this.serializeSession(session, { revealExpected: true });
  }

  async getMyShift(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);
    const policy = await this.policy(this.prisma, shopId);
    const session = await this.prisma.cashSession.findFirst({
      where: {
        shopId,
        openedById: actor.sub,
        status: CashSessionStatus.OPEN,
      },
      include: sessionInclude,
    });
    const canViewExpected = this.can(actor, PERMISSIONS.CASH_VIEW_EXPECTED);
    const revealExpected = !policy.cashBlindCountEnabled || canViewExpected;
    return {
      policy: {
        cashSessionRequired: policy.cashSessionRequired,
        cashBlindCountEnabled: policy.cashBlindCountEnabled,
        cashVarianceApprovalThreshold: serializeMoney(
          policy.cashVarianceApprovalThreshold,
        ),
        currency: policy.currency,
      },
      permissions: {
        canOpen: this.can(actor, PERMISSIONS.CASH_OPEN),
        canMove: this.can(actor, PERMISSIONS.CASH_MOVEMENT),
        canClose: this.can(actor, PERMISSIONS.CASH_CLOSE),
        canViewExpected,
        canApproveVariance: this.can(actor, PERMISSIONS.CASH_APPROVE_VARIANCE),
      },
      session: session
        ? this.serializeSession(session, { revealExpected })
        : null,
    };
  }

  /**
   * Called inside Checkout's settlement transaction before a CASH payment is
   * created. The per-Shop feature flag is an emergency compatibility kill
   * switch; when enabled, the Shop policy decides whether an open session is
   * mandatory.
   */
  async requireSessionForCashPayment(
    tx: Prisma.TransactionClient,
    actor: JwtAccessPayload,
    currency: string,
  ): Promise<string | null> {
    const shopId = requireShopId(actor);
    if (!(await this.flags.isFeatureEnabled(shopId, 'cash_sessions'))) {
      return null;
    }
    const policy = await this.policy(tx, shopId);
    if (!policy.cashSessionRequired) return null;
    const session = await tx.cashSession.findFirst({
      where: {
        shopId,
        openedById: actor.sub,
        status: CashSessionStatus.OPEN,
      },
    });
    if (!session) {
      throw new ConflictException(
        'Open a cash session in My Shift before taking cash.',
      );
    }
    if (session.currency !== currency) {
      throw new ConflictException(
        'Cash session currency does not match the checkout settlement.',
      );
    }
    return session.id;
  }

  async recordCashSale(
    tx: Prisma.TransactionClient,
    input: {
      shopId: string;
      cashSessionId: string | null;
      actorId: string;
      paymentId: string;
      amount: Prisma.Decimal;
      currency: string;
    },
  ) {
    if (!input.cashSessionId) return null;
    const movement = await tx.cashMovement.create({
      data: {
        shopId: input.shopId,
        cashSessionId: input.cashSessionId,
        type: CashMovementType.CASH_SALE,
        amount: roundMoneyDecimal(input.amount, 4),
        currency: input.currency,
        reasonCategory: 'checkout.cash-sale',
        actorId: input.actorId,
        paymentId: input.paymentId,
      },
    });
    await this.outbox.enqueue(tx, {
      shopId: input.shopId,
      aggregateType: 'cash_session',
      aggregateId: input.cashSessionId,
      eventType: 'cash-session.cash-sale-recorded',
      payload: {
        cashSessionId: input.cashSessionId,
        cashMovementId: movement.id,
        paymentId: input.paymentId,
        amount: serializeMoney(input.amount),
        currency: input.currency,
      },
    });
    return movement;
  }

  async createMovement(
    actor: JwtAccessPayload,
    cashSessionId: string,
    dto: CreateCashMovementDto,
  ) {
    this.assertPermission(actor, PERMISSIONS.CASH_MOVEMENT);
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);
    if (dto.type === CashMovementType.CASH_SALE) {
      throw new BadRequestException('CASH_SALE is created by Checkout only');
    }
    const reasonCategory = dto.reasonCategory?.trim();
    if (!reasonCategory) {
      throw new BadRequestException('Reason category is required');
    }
    const amount = positiveMoney(dto.amount, 'Movement amount');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CashSession" WHERE "id" = ${cashSessionId} AND "shopId" = ${shopId} FOR UPDATE`,
      );
      const session = await tx.cashSession.findFirst({
        where: { id: cashSessionId, shopId },
      });
      if (!session) throw new NotFoundException('Cash session not found');
      if (session.status !== CashSessionStatus.OPEN) {
        throw new ConflictException('Closed cash sessions are immutable');
      }
      const movement = await tx.cashMovement.create({
        data: {
          shopId,
          cashSessionId,
          type: dto.type,
          amount,
          currency: session.currency,
          reasonCategory,
          note: dto.note?.trim() || null,
          actorId: actor.sub,
        },
      });
      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'cash_session',
        aggregateId: cashSessionId,
        eventType: 'cash-session.movement-recorded',
        payload: {
          cashSessionId,
          cashMovementId: movement.id,
          type: dto.type,
          amount: serializeMoney(amount),
          currency: session.currency,
          reasonCategory,
          actorId: actor.sub,
        },
      });
      return { movement, currency: session.currency };
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'cash.movement.record',
      summary: `Recorded ${dto.type.toLowerCase().replaceAll('_', ' ')} cash movement`,
      meta: {
        cashSessionId,
        cashMovementId: result.movement.id,
        type: dto.type,
        amount: serializeMoney(amount),
        currency: result.currency,
        reasonCategory,
        note: dto.note?.trim() || null,
        actorId: actor.sub,
      },
    });
    return this.getMyShift(actor);
  }

  async submitCount(
    actor: JwtAccessPayload,
    cashSessionId: string,
    dto: SubmitCashCountDto,
  ) {
    this.assertPermission(actor, PERMISSIONS.CASH_CLOSE);
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);
    const countedAmount = nonNegativeMoney(dto.countedAmount, 'Cash count');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CashSession" WHERE "id" = ${cashSessionId} AND "shopId" = ${shopId} FOR UPDATE`,
      );
      const session = await tx.cashSession.findFirst({
        where: { id: cashSessionId, shopId },
        include: { movements: true },
      });
      if (!session) throw new NotFoundException('Cash session not found');
      if (session.status !== CashSessionStatus.OPEN) {
        throw new ConflictException('Closed cash sessions are immutable');
      }
      const policy = await this.policy(tx, shopId);
      const expected = this.expectedCash(session.openingFloat, session.movements);
      const variance = roundMoneyDecimal(countedAmount.sub(expected), 4);
      const count = await tx.cashCount.create({
        data: {
          shopId,
          cashSessionId,
          countedAmount,
          expectedCashAtSubmission: expected,
          variance,
          blindCount: policy.cashBlindCountEnabled,
          actorId: actor.sub,
        },
      });
      const requiresApproval = variance
        .abs()
        .gt(policy.cashVarianceApprovalThreshold);
      const approval = requiresApproval
        ? await tx.shiftCloseApproval.create({
            data: {
              shopId,
              cashSessionId,
              cashCountId: count.id,
              requestedById: actor.sub,
              variance,
              threshold: policy.cashVarianceApprovalThreshold,
            },
          })
        : null;
      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'cash_session',
        aggregateId: cashSessionId,
        eventType: 'cash-session.count-submitted',
        payload: {
          cashSessionId,
          cashCountId: count.id,
          countedAmount: serializeMoney(countedAmount),
          expectedCash: serializeMoney(expected),
          variance: serializeMoney(variance),
          requiresApproval,
          approvalId: approval?.id ?? null,
        },
      });
      return { count, approval, expected, variance, requiresApproval };
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'cash.count.submit',
      summary: 'Submitted cash drawer count',
      meta: {
        cashSessionId,
        cashCountId: result.count.id,
        countedAmount: serializeMoney(countedAmount),
        expectedCash: serializeMoney(result.expected),
        variance: serializeMoney(result.variance),
        requiresApproval: result.requiresApproval,
      },
    });
    return {
      cashCountId: result.count.id,
      countedAmount: serializeMoney(countedAmount),
      expectedCash: serializeMoney(result.expected),
      variance: serializeMoney(result.variance),
      requiresApproval: result.requiresApproval,
      approvalId: result.approval?.id ?? null,
      approvalStatus: result.approval?.status ?? null,
    };
  }

  async approveVariance(
    actor: JwtAccessPayload,
    cashSessionId: string,
    dto: ApproveCashVarianceDto,
  ) {
    this.assertPermission(actor, PERMISSIONS.CASH_APPROVE_VARIANCE);
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);

    const approval = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CashSession" WHERE "id" = ${cashSessionId} AND "shopId" = ${shopId} FOR UPDATE`,
      );
      const session = await tx.cashSession.findFirst({
        where: { id: cashSessionId, shopId },
      });
      if (!session) throw new NotFoundException('Cash session not found');
      if (session.status !== CashSessionStatus.OPEN) {
        throw new ConflictException('Closed cash sessions are immutable');
      }
      const existing = await tx.shiftCloseApproval.findFirst({
        where: {
          shopId,
          cashSessionId,
          cashCountId: dto.cashCountId,
        },
      });
      if (!existing) {
        throw new NotFoundException('Variance approval request not found');
      }
      if (existing.status === ShiftCloseApprovalStatus.APPROVED) {
        return existing;
      }
      const updated = await tx.shiftCloseApproval.update({
        where: { id: existing.id },
        data: {
          status: ShiftCloseApprovalStatus.APPROVED,
          approvedById: actor.sub,
          decidedAt: new Date(),
          note: dto.note?.trim() || null,
        },
      });
      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'cash_session',
        aggregateId: cashSessionId,
        eventType: 'cash-session.variance-approved',
        payload: {
          cashSessionId,
          cashCountId: dto.cashCountId,
          approvalId: updated.id,
          approvedById: actor.sub,
          variance: serializeMoney(updated.variance),
          threshold: serializeMoney(updated.threshold),
        },
      });
      return updated;
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'cash.variance.approve',
      summary: 'Approved cash shift variance',
      meta: {
        cashSessionId,
        cashCountId: dto.cashCountId,
        approvalId: approval.id,
        variance: serializeMoney(approval.variance),
        threshold: serializeMoney(approval.threshold),
        note: dto.note?.trim() || null,
      },
    });
    return {
      approvalId: approval.id,
      status: approval.status,
      approvedById: approval.approvedById,
      decidedAt: approval.decidedAt?.toISOString() ?? null,
    };
  }

  async closeSession(
    actor: JwtAccessPayload,
    cashSessionId: string,
    dto: CloseCashSessionDto,
  ) {
    this.assertPermission(actor, PERMISSIONS.CASH_CLOSE);
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "CashSession" WHERE "id" = ${cashSessionId} AND "shopId" = ${shopId} FOR UPDATE`,
      );
      const current = await tx.cashSession.findFirst({
        where: { id: cashSessionId, shopId },
        include: { movements: true },
      });
      if (!current) throw new NotFoundException('Cash session not found');
      if (current.status !== CashSessionStatus.OPEN) {
        throw new ConflictException('Closed cash sessions are immutable');
      }
      const count = await tx.cashCount.findFirst({
        where: {
          id: dto.cashCountId,
          shopId,
          cashSessionId,
        },
      });
      if (!count) throw new NotFoundException('Cash count not found');

      const policy = await this.policy(tx, shopId);
      const expected = this.expectedCash(current.openingFloat, current.movements);
      if (!expected.eq(count.expectedCashAtSubmission)) {
        throw new ConflictException(
          'Cash moved after this count was submitted. Recount before closing.',
        );
      }
      const variance = roundMoneyDecimal(count.countedAmount.sub(expected), 4);
      if (variance.abs().gt(policy.cashVarianceApprovalThreshold)) {
        const approval = await tx.shiftCloseApproval.findFirst({
          where: {
            shopId,
            cashSessionId,
            cashCountId: count.id,
            status: ShiftCloseApprovalStatus.APPROVED,
          },
        });
        if (!approval) {
          throw new ConflictException(
            'Variance exceeds the approval threshold and must be approved before close.',
          );
        }
      }

      const updated = await tx.cashSession.update({
        where: { id: current.id },
        data: {
          status: CashSessionStatus.CLOSED,
          closedExpectedCash: expected,
          countedCash: count.countedAmount,
          variance,
          closedAt: new Date(),
          closedById: actor.sub,
          closeNote: dto.note?.trim() || null,
          version: { increment: 1 },
        },
        include: sessionInclude,
      });
      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'cash_session',
        aggregateId: cashSessionId,
        eventType: 'cash-session.closed',
        payload: {
          cashSessionId,
          cashCountId: count.id,
          expectedCash: serializeMoney(expected),
          countedCash: serializeMoney(count.countedAmount),
          variance: serializeMoney(variance),
          closedById: actor.sub,
        },
      });
      return updated;
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'cash.session.close',
      summary: 'Closed cash session',
      meta: {
        cashSessionId,
        expectedCash: session.closedExpectedCash
          ? serializeMoney(session.closedExpectedCash)
          : null,
        countedCash: session.countedCash
          ? serializeMoney(session.countedCash)
          : null,
        variance: session.variance ? serializeMoney(session.variance) : null,
        note: dto.note?.trim() || null,
      },
    });
    return this.serializeSession(session, { revealExpected: true });
  }

  async listReports(actor: JwtAccessPayload, take = 50) {
    this.assertPermission(actor, PERMISSIONS.CASH_VIEW_EXPECTED);
    const shopId = requireShopId(actor);
    await this.requireChunk05(shopId);
    const sessions = await this.prisma.cashSession.findMany({
      where: { shopId },
      include: sessionInclude,
      orderBy: { openedAt: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
    });
    return {
      sessions: sessions.map((session) =>
        this.serializeSession(session, { revealExpected: true }),
      ),
    };
  }
}
