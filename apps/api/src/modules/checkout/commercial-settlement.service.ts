import { createHash } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
} from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { DomainEventOutboxService } from '../foundation/domain-event-outbox.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import {
  ChargeCalculatorService,
  type CheckoutChargeLine,
} from './charge-calculator.service';
import { CheckoutService } from './checkout.service';
import {
  CreateCheckSettlementDto,
  PreviewCheckoutDto,
} from './dto/checkout.dto';
import { SettlementStateService } from './settlement-state.service';

const commercialCheckInclude = {
  shop: { select: { currency: true } },
  shopOrders: {
    select: {
      id: true,
      status: true,
      label: true,
      total: true,
      tableReserved: true,
      reservationFee: true,
      currency: true,
      lines: {
        select: {
          id: true,
          name: true,
          quantity: true,
          unitPrice: true,
          lineStatus: true,
        },
      },
    },
  },
  playSessions: {
    select: {
      id: true,
      status: true,
      label: true,
      amount: true,
      currency: true,
      billingDiscountPercent: true,
      endedAt: true,
      completedAt: true,
      reservationId: true,
    },
  },
  reservations: {
    select: {
      id: true,
      status: true,
      guestName: true,
      partySize: true,
      startsAt: true,
      endsAt: true,
      billedAmount: true,
      billingBaseAmount: true,
      billingDiscountPercent: true,
      billedAt: true,
      currency: true,
      resourceId: true,
      notes: true,
      resource: {
        select: {
          id: true,
          name: true,
          type: true,
          hourlyRate: true,
          category: {
            select: {
              id: true,
              name: true,
              slotMinutes: true,
              bookingMode: true,
              offeringConfig: true,
              rates: {
                select: {
                  label: true,
                  durationMinutes: true,
                  price: true,
                },
                orderBy: { sortOrder: 'asc' as const },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.GuestCheckInclude;

type CommercialCheck = Prisma.GuestCheckGetPayload<{
  include: typeof commercialCheckInclude;
}>;
type Db = PrismaService | Prisma.TransactionClient;

type ProjectionBlocker = {
  type: string;
  id: string;
  label: string;
  status: string;
};

export type CommercialCheckoutProjection = {
  checkId: string;
  checkVersion: number;
  sourceHash: string;
  currency: string;
  subtotal: Prisma.Decimal;
  adjustments: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  depositAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  amountDue: Prisma.Decimal;
  lines: CheckoutChargeLine[];
  billReady: boolean;
  blockers: ProjectionBlocker[];
  commercial: {
    discountAmount: Prisma.Decimal;
    serviceChargeAmount: Prisma.Decimal;
    tipAmount: Prisma.Decimal;
    operationsSessionAmount: Prisma.Decimal;
    venueOrderAmount: Prisma.Decimal;
  };
};

function minor(value: number | null | undefined) {
  return roundMoneyDecimal(new Prisma.Decimal(value ?? 0).div(100), 4);
}

function stableLine(line: CheckoutChargeLine) {
  return {
    position: line.position,
    sourceType: line.sourceType,
    sourceId: line.sourceId,
    lineReference: line.lineReference,
    description: line.description,
    quantity: line.quantity,
    unitAmount: serializeMoney(line.unitAmount),
    grossAmount: serializeMoney(line.grossAmount),
    discountAmount: serializeMoney(line.discountAmount),
    finalAmount: serializeMoney(line.finalAmount),
    currency: line.currency,
    pricingMetadata: line.pricingMetadata,
  };
}

function sumFinal(lines: readonly CheckoutChargeLine[]) {
  return sumMoneyDecimal(...lines.map((line) => line.finalAmount));
}

@Injectable()
export class CommercialSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly calculator: ChargeCalculatorService,
    private readonly states: SettlementStateService,
    private readonly outbox: DomainEventOutboxService,
    private readonly audit: AuditService,
    private readonly legacyCheckout: CheckoutService,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: PermissionKey) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  private async requireCheckout(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'checkout_v2'))) {
      throw new ForbiddenException('Checkout V2 is not enabled for this venue');
    }
  }

  private targetLines(
    lines: CheckoutChargeLine[],
    adjustment: {
      scope: string;
      targetSourceType: string | null;
      targetSourceId: string | null;
      targetLineReference: string | null;
    },
  ) {
    if (adjustment.scope !== 'LINE') {
      return lines.filter(
        (line) => line.sourceType !== 'SERVICE_CHARGE' && line.sourceType !== 'TIP',
      );
    }
    return lines.filter(
      (line) =>
        (!adjustment.targetSourceType || line.sourceType === adjustment.targetSourceType) &&
        (!adjustment.targetSourceId || line.sourceId === adjustment.targetSourceId) &&
        (!adjustment.targetLineReference ||
          line.lineReference === adjustment.targetLineReference),
    );
  }

  private reduceLines(
    targets: CheckoutChargeLine[],
    requested: Prisma.Decimal,
    discount: boolean,
  ) {
    let remaining = roundMoneyDecimal(requested, 4);
    let applied = new Prisma.Decimal(0);
    for (const line of [...targets].sort((a, b) => a.position - b.position)) {
      if (remaining.lte(0)) break;
      if (line.finalAmount.lte(0)) continue;
      const reduction = line.finalAmount.lte(remaining)
        ? line.finalAmount
        : remaining;
      line.finalAmount = roundMoneyDecimal(line.finalAmount.sub(reduction), 4);
      if (discount) {
        line.discountAmount = roundMoneyDecimal(
          line.discountAmount.add(reduction),
          4,
        );
      }
      applied = applied.add(reduction);
      remaining = remaining.sub(reduction);
    }
    return roundMoneyDecimal(applied, 4);
  }

  private addSyntheticLine(
    lines: CheckoutChargeLine[],
    input: {
      sourceType: string;
      sourceId: string;
      description: string;
      amount: Prisma.Decimal;
      currency: string;
      metadata: Prisma.InputJsonObject;
    },
  ) {
    const amount = roundMoneyDecimal(input.amount, 4);
    lines.push({
      position: lines.length,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      lineReference: input.sourceId,
      description: input.description,
      quantity: 1,
      unitAmount: amount,
      grossAmount: amount,
      discountAmount: new Prisma.Decimal(0),
      finalAmount: amount,
      currency: input.currency,
      pricingMetadata: input.metadata,
    });
  }

  async buildProjection(
    db: Db,
    shopId: string,
    checkId: string,
    now = new Date(),
  ): Promise<{ check: CommercialCheck; projection: CommercialCheckoutProjection }> {
    const check = await db.guestCheck.findFirst({
      where: { id: checkId, shopId },
      include: commercialCheckInclude,
    });
    if (!check) throw new NotFoundException('Guest check not found');
    this.states.assertGuestCheckCanCalculate(check.status);

    const [venueOrders, operationsSessions, adjustments, serviceCharges, tips] =
      await Promise.all([
        db.venueOrder.findMany({
          where: { shopId, guestCheckId: checkId },
          orderBy: { createdAt: 'asc' },
        }),
        db.operationsSession.findMany({
          where: { shopId, guestCheckId: checkId },
          orderBy: { startedAt: 'asc' },
        }),
        db.commercialAdjustment.findMany({
          where: { shopId, guestCheckId: checkId, voidedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        db.guestCheckServiceCharge.findMany({
          where: { shopId, guestCheckId: checkId, voidedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        db.guestCheckTip.findMany({
          where: { shopId, guestCheckId: checkId, voidedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      ]);

    const venueOrderIds = venueOrders.map((row) => row.id);
    const venueLines = venueOrderIds.length
      ? await db.venueOrderLine.findMany({
          where: { shopId, orderId: { in: venueOrderIds } },
          orderBy: [{ orderId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        })
      : [];

    const reservationIdsOwnedByOperations = new Set(
      operationsSessions
        .filter((row) => row.status !== 'CANCELLED' && row.status !== 'CANCELED')
        .map((row) => row.reservationId)
        .filter((id): id is string => Boolean(id)),
    );

    const legacy = this.calculator.calculate(check, now);
    const lines: CheckoutChargeLine[] = legacy.lines
      .filter(
        (line) =>
          !(
            line.sourceType === 'RESERVATION' &&
            reservationIdsOwnedByOperations.has(line.sourceId)
          ),
      )
      .map((line, position) => ({ ...line, position }));

    let subtotal = sumMoneyDecimal(...lines.map((line) => line.finalAmount));
    let taxAmount = new Prisma.Decimal(0);
    let venueOrderAmount = new Prisma.Decimal(0);
    let operationsSessionAmount = new Prisma.Decimal(0);
    const blockers: ProjectionBlocker[] = checkoutBillReadiness(check).blockers.map(
      (blocker) => ({
        type: blocker.type,
        id: blocker.id,
        label: blocker.label,
        status: blocker.status,
      }),
    );

    for (const order of venueOrders) {
      if (order.status === 'CANCELED') continue;
      if (order.status !== 'COMPLETED') {
        blockers.push({
          type: 'VENUE_ORDER',
          id: order.id,
          label: order.guestLabel?.trim() || `Order ${order.id.slice(0, 8)}`,
          status: order.status,
        });
      }
      const active = venueLines.filter(
        (line) => line.orderId === order.id && line.canceledAt == null,
      );
      for (const item of active) {
        const gross = minor(item.totalMinor);
        const tax = minor(item.taxMinor);
        const net = gross.sub(tax);
        const unit = minor(item.unitPriceMinor);
        lines.push({
          position: lines.length,
          sourceType: 'VENUE_ORDER',
          sourceId: order.id,
          lineReference: item.id,
          description:
            item.variantNameSnapshot?.trim()
              ? `${item.nameSnapshot} · ${item.variantNameSnapshot}`
              : item.nameSnapshot,
          quantity: item.quantity,
          unitAmount: unit,
          grossAmount: gross,
          discountAmount: new Prisma.Decimal(0),
          finalAmount: gross,
          currency: order.currency,
          pricingMetadata: {
            lineType: 'MENU_ITEM',
            taxCategorySnapshot: item.taxCategorySnapshot,
            taxRateBps: item.taxRateBps,
            taxMinor: item.taxMinor,
            orderServiceMode: order.serviceMode,
            seat: item.seat,
            createdById: order.createdById,
            createdAt: item.createdAt.toISOString(),
            priceSnapshot: item.priceSnapshot,
          } as Prisma.InputJsonObject,
        });
        subtotal = subtotal.add(net);
        taxAmount = taxAmount.add(tax);
        venueOrderAmount = venueOrderAmount.add(gross);
      }
    }

    for (const session of operationsSessions) {
      if (session.status === 'CANCELLED' || session.status === 'CANCELED') continue;
      if (session.status !== 'FINISHED') {
        blockers.push({
          type: 'OPERATIONS_SESSION',
          id: session.id,
          label: `Session ${session.id.slice(0, 8)}`,
          status: session.status,
        });
        continue;
      }
      const amount = minor(session.accruedMinor);
      lines.push({
        position: lines.length,
        sourceType: 'OPERATIONS_SESSION',
        sourceId: session.id,
        lineReference: session.id,
        description: 'Session time',
        quantity: 1,
        unitAmount: amount,
        grossAmount: amount,
        discountAmount: new Prisma.Decimal(0),
        finalAmount: amount,
        currency: session.currency,
        pricingMetadata: {
          lineType: 'SESSION_TIME',
          resourceId: session.resourceId,
          reservationId: session.reservationId,
          ratePlanId: session.ratePlanId,
          participantCount: session.participantCount,
          startedAt: session.startedAt.toISOString(),
          finishedAt: session.finishedAt?.toISOString() ?? null,
          rateSnapshot: session.rateSnapshot,
          createdById: session.createdById,
        } as Prisma.InputJsonObject,
      });
      subtotal = subtotal.add(amount);
      operationsSessionAmount = operationsSessionAmount.add(amount);
    }

    let adjustmentDelta = new Prisma.Decimal(0);
    let discountAmount = new Prisma.Decimal(0);

    for (const adjustment of adjustments.filter(
      (row) => row.type !== 'DEPOSIT_APPLICATION',
    )) {
      const targets = this.targetLines(lines, adjustment);
      if (targets.length === 0) {
        throw apiConflictException(
          ApiDomainErrorCode.STATE_CONFLICT,
          'A commercial adjustment no longer matches an active charge line',
          { adjustmentId: adjustment.id },
        );
      }
      const before = sumFinal(targets);
      if (adjustment.type === 'PRICE_OVERRIDE') {
        if (adjustment.scope !== 'LINE' || adjustment.amountMinor == null) {
          throw new ConflictException('Price override requires one line and a target amount');
        }
        const target = minor(adjustment.amountMinor);
        const line = targets[0];
        const delta = target.sub(line.finalAmount);
        line.finalAmount = target;
        line.discountAmount = target.lt(line.grossAmount)
          ? line.grossAmount.sub(target)
          : new Prisma.Decimal(0);
        adjustmentDelta = adjustmentDelta.add(delta);
        if (delta.lt(0)) discountAmount = discountAmount.add(delta.abs());
        continue;
      }

      let requested: Prisma.Decimal;
      if (adjustment.type === 'PERCENTAGE_DISCOUNT') {
        requested = roundMoneyDecimal(
          before.mul(adjustment.percentageBps ?? 0).div(10000),
          4,
        );
      } else {
        requested = minor(adjustment.amountMinor);
      }
      const applied = this.reduceLines(targets, requested, true);
      adjustmentDelta = adjustmentDelta.sub(applied);
      discountAmount = discountAmount.add(applied);
    }

    let serviceChargeAmount = new Prisma.Decimal(0);
    const serviceBase = sumFinal(lines);
    for (const charge of serviceCharges) {
      const amount =
        charge.mode === 'PERCENTAGE'
          ? roundMoneyDecimal(
              serviceBase.mul(charge.percentageBps ?? 0).div(10000),
              4,
            )
          : minor(charge.amountMinor);
      if (amount.lte(0)) continue;
      this.addSyntheticLine(lines, {
        sourceType: 'SERVICE_CHARGE',
        sourceId: charge.id,
        description: charge.reason || 'Service charge',
        amount,
        currency: legacy.currency,
        metadata: {
          lineType: 'SERVICE_CHARGE',
          mode: charge.mode,
          percentageBps: charge.percentageBps,
          createdById: charge.createdById,
          createdAt: charge.createdAt.toISOString(),
        },
      });
      serviceChargeAmount = serviceChargeAmount.add(amount);
      adjustmentDelta = adjustmentDelta.add(amount);
    }

    let depositAmount = new Prisma.Decimal(0);
    for (const adjustment of adjustments.filter(
      (row) => row.type === 'DEPOSIT_APPLICATION',
    )) {
      const targets = lines.filter((line) => line.sourceType !== 'TIP');
      const applied = this.reduceLines(targets, minor(adjustment.amountMinor), false);
      depositAmount = depositAmount.add(applied);
    }

    let tipAmount = new Prisma.Decimal(0);
    for (const tip of tips) {
      const amount = minor(tip.amountMinor);
      if (amount.lte(0)) continue;
      this.addSyntheticLine(lines, {
        sourceType: 'TIP',
        sourceId: tip.id,
        description: 'Gratuity',
        amount,
        currency: legacy.currency,
        metadata: {
          lineType: 'TIP',
          method: tip.method,
          createdById: tip.createdById,
          createdAt: tip.createdAt.toISOString(),
        },
      });
      tipAmount = tipAmount.add(amount);
      adjustmentDelta = adjustmentDelta.add(amount);
    }

    subtotal = roundMoneyDecimal(subtotal, 4);
    taxAmount = roundMoneyDecimal(taxAmount, 4);
    depositAmount = roundMoneyDecimal(depositAmount, 4);
    adjustmentDelta = roundMoneyDecimal(adjustmentDelta, 4);
    const total = roundMoneyDecimal(sumFinal(lines), 4);
    const arithmetic = roundMoneyDecimal(
      subtotal.add(taxAmount).add(adjustmentDelta).sub(depositAmount),
      4,
    );
    if (!arithmetic.eq(total)) {
      adjustmentDelta = roundMoneyDecimal(
        adjustmentDelta.add(total.sub(arithmetic)),
        4,
      );
    }
    if (total.lt(0)) {
      throw new ConflictException('Commercial adjustments cannot make a check negative');
    }

    const sourceHash = createHash('sha256')
      .update(
        JSON.stringify({
          checkId,
          currency: legacy.currency,
          lines: lines.map(stableLine),
          adjustmentIds: adjustments.map((row) => row.id),
          serviceChargeIds: serviceCharges.map((row) => row.id),
          tipIds: tips.map((row) => row.id),
        }),
      )
      .digest('hex');

    return {
      check,
      projection: {
        checkId,
        checkVersion: check.version,
        sourceHash,
        currency: legacy.currency,
        subtotal,
        adjustments: adjustmentDelta,
        taxAmount,
        depositAmount,
        total,
        amountDue: total,
        lines,
        billReady: blockers.length === 0,
        blockers,
        commercial: {
          discountAmount: roundMoneyDecimal(discountAmount, 4),
          serviceChargeAmount: roundMoneyDecimal(serviceChargeAmount, 4),
          tipAmount: roundMoneyDecimal(tipAmount, 4),
          operationsSessionAmount: roundMoneyDecimal(operationsSessionAmount, 4),
          venueOrderAmount: roundMoneyDecimal(venueOrderAmount, 4),
        },
      },
    };
  }

  serializeProjection(row: CommercialCheckoutProjection) {
    return {
      checkId: row.checkId,
      checkVersion: row.checkVersion,
      sourceHash: row.sourceHash,
      currency: row.currency,
      subtotal: serializeMoney(row.subtotal),
      adjustments: serializeMoney(row.adjustments),
      taxAmount: serializeMoney(row.taxAmount),
      depositAmount: serializeMoney(row.depositAmount),
      total: serializeMoney(row.total),
      amountDue: serializeMoney(row.amountDue),
      billReady: row.billReady,
      blockers: row.blockers,
      commercial: {
        discountAmount: serializeMoney(row.commercial.discountAmount),
        serviceChargeAmount: serializeMoney(row.commercial.serviceChargeAmount),
        tipAmount: serializeMoney(row.commercial.tipAmount),
        operationsSessionAmount: serializeMoney(row.commercial.operationsSessionAmount),
        venueOrderAmount: serializeMoney(row.commercial.venueOrderAmount),
      },
      lines: row.lines.map(stableLine),
    };
  }

  async preview(
    actor: JwtAccessPayload,
    checkId: string,
    dto: PreviewCheckoutDto = {},
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    await this.requireCheckout(shopId);
    const { check, projection } = await this.buildProjection(
      this.prisma,
      shopId,
      checkId,
    );
    if (dto.expectedVersion !== undefined) {
      assertExpectedVersion(check.version, dto.expectedVersion, {
        aggregateType: 'guest_check',
        aggregateId: checkId,
      });
    }
    return this.serializeProjection(projection);
  }

  async createSettlement(
    actor: JwtAccessPayload,
    checkId: string,
    dto: CreateCheckSettlementDto,
    correlationId?: string,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requireCheckout(shopId);

    let settlementId: string;
    try {
      settlementId = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "GuestCheck" WHERE "id"=${checkId} AND "shopId"=${shopId} FOR UPDATE`,
        );
        const { check, projection } = await this.buildProjection(tx, shopId, checkId);
        assertExpectedVersion(check.version, dto.expectedVersion, {
          aggregateType: 'guest_check',
          aggregateId: checkId,
        });
        if (!projection.billReady) {
          throw apiConflictException(
            ApiDomainErrorCode.STATE_CONFLICT,
            'Finalize all open orders and live sessions before taking payment.',
            { stage: 'FINALIZE_BILL', blockers: projection.blockers },
          );
        }

        const nextVersion = check.version + 1;
        const settlement = await tx.checkSettlement.create({
          data: {
            shopId,
            guestCheckId: checkId,
            state: this.states.initialCalculatedState(),
            checkVersion: nextVersion,
            sourceHash: projection.sourceHash,
            subtotal: projection.subtotal,
            adjustments: projection.adjustments,
            taxAmount: projection.taxAmount,
            depositAmount: projection.depositAmount,
            total: projection.total,
            amountDue: projection.amountDue,
            currency: projection.currency,
            createdById: actor.sub,
          },
        });
        if (projection.lines.length > 0) {
          await tx.chargeSnapshot.createMany({
            data: projection.lines.map((line) => ({
              shopId,
              settlementId: settlement.id,
              position: line.position,
              sourceType: line.sourceType,
              sourceId: line.sourceId,
              lineReference: line.lineReference,
              description: line.description,
              quantity: line.quantity,
              unitAmount: line.unitAmount,
              grossAmount: line.grossAmount,
              discountAmount: line.discountAmount,
              finalAmount: line.finalAmount,
              currency: line.currency,
              pricingMetadata: line.pricingMetadata,
            })),
          });
        }
        const claimed = await tx.guestCheck.updateMany({
          where: {
            id: checkId,
            shopId,
            status: 'OPEN',
            version: dto.expectedVersion,
          },
          data: {
            currentSettlementId: settlement.id,
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          throw apiConflictException(
            ApiDomainErrorCode.VERSION_CONFLICT,
            'Guest check changed while settlement was being created',
            { aggregateType: 'guest_check', aggregateId: checkId },
          );
        }
        await this.outbox.enqueue(tx, {
          shopId,
          aggregateType: 'check_settlement',
          aggregateId: settlement.id,
          eventType: 'settlement.created',
          payload: {
            schemaVersion: 2,
            settlementId: settlement.id,
            guestCheckId: checkId,
            checkVersion: nextVersion,
            sourceHash: projection.sourceHash,
            currency: projection.currency,
            total: serializeMoney(projection.total),
            correlationId: correlationId ?? null,
            canonicalSources: [
              'legacy-order',
              'venue-order',
              'play-session',
              'operations-session',
              'reservation',
              'commercial-adjustment',
              'service-charge',
              'tip',
            ],
          },
        });
        return settlement.id;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw apiConflictException(
          ApiDomainErrorCode.VERSION_CONFLICT,
          'A settlement already exists for this GuestCheck version',
          { aggregateType: 'guest_check', aggregateId: checkId },
        );
      }
      throw error;
    }

    const settlement = await this.legacyCheckout.getSettlement(actor, settlementId);
    await this.audit.record(actor, {
      section: 'finance',
      action: 'checkout.settlement.create.phase4',
      summary: 'Created unified immutable commercial settlement',
      meta: {
        guestCheckId: checkId,
        settlementId,
        correlationId: correlationId ?? null,
      },
    });
    return settlement;
  }

  async closeCheck(actor: JwtAccessPayload, checkId: string) {
    const closed = await this.legacyCheckout.closeCheck(actor, checkId);
    return {
      ...closed,
      receipt: await this.getReceipt(actor, closed.settlementId),
    };
  }

  async getReceipt(actor: JwtAccessPayload, settlementId: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    const receipt = await this.prisma.commercialReceipt.findFirst({
      where: { shopId, settlementId },
    });
    return receipt
      ? {
          id: receipt.id,
          receiptNumber: receipt.receiptNumber,
          guestCheckId: receipt.guestCheckId,
          settlementId: receipt.settlementId,
          currency: receipt.currency,
          totalMinor: receipt.totalMinor,
          snapshot: receipt.snapshot,
          issuedAt: receipt.issuedAt.toISOString(),
        }
      : null;
  }
}
