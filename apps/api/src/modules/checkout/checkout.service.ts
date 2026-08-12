import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import { guestCheckOperationalReadiness } from '../../common/guest-check-close.util';
import { assertExpectedVersion } from '../../common/optimistic-concurrency.util';
import {
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
} from '../../common/permissions';
import { serializeMoney } from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { DomainEventOutboxService } from '../foundation/domain-event-outbox.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import { ChargeCalculatorService } from './charge-calculator.service';
import {
  CreateCheckSettlementDto,
  PreviewCheckoutDto,
} from './dto/checkout.dto';
import { SettlementStateService } from './settlement-state.service';

const checkoutCheckInclude = {
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

const settlementInclude = {
  snapshots: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.CheckSettlementInclude;

type SettlementWithSnapshots = Prisma.CheckSettlementGetPayload<{
  include: typeof settlementInclude;
}>;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly calculator: ChargeCalculatorService,
    private readonly states: SettlementStateService,
    private readonly outbox: DomainEventOutboxService,
    private readonly audit: AuditService,
  ) {}

  private assertPermission(actor: JwtAccessPayload, permission: PermissionKey) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', permission)) return;
    throw new ForbiddenException(`Missing ${permission}`);
  }

  private async requireCheckoutV2(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'checkout_v2'))) {
      throw new ForbiddenException('Checkout V2 is not enabled for this venue');
    }
  }

  private assertBillFinalized(
    check: Prisma.GuestCheckGetPayload<{ include: typeof checkoutCheckInclude }>,
  ) {
    const readiness = guestCheckOperationalReadiness(check);
    if (readiness.ready) return;
    throw apiConflictException(
      ApiDomainErrorCode.GUEST_CHECK_ACTIVITY_OPEN,
      'Finish open orders and play sessions before taking payment.',
      {
        stage: 'FINALIZE_BILL',
        blockers: readiness.blockers,
      },
    );
  }

  private serializeSettlement(row: SettlementWithSnapshots) {
    return {
      id: row.id,
      shopId: row.shopId,
      guestCheckId: row.guestCheckId,
      state: row.state,
      checkVersion: row.checkVersion,
      sourceHash: row.sourceHash,
      subtotal: serializeMoney(row.subtotal),
      adjustments: serializeMoney(row.adjustments),
      taxAmount: serializeMoney(row.taxAmount),
      depositAmount: serializeMoney(row.depositAmount),
      total: serializeMoney(row.total),
      amountDue: serializeMoney(row.amountDue),
      currency: row.currency,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      snapshots: row.snapshots.map((snapshot) => ({
        id: snapshot.id,
        position: snapshot.position,
        sourceType: snapshot.sourceType,
        sourceId: snapshot.sourceId,
        lineReference: snapshot.lineReference,
        description: snapshot.description,
        quantity: snapshot.quantity,
        unitAmount: serializeMoney(snapshot.unitAmount),
        grossAmount: serializeMoney(snapshot.grossAmount),
        discountAmount: serializeMoney(snapshot.discountAmount),
        finalAmount: serializeMoney(snapshot.finalAmount),
        currency: snapshot.currency,
        pricingMetadata: snapshot.pricingMetadata,
        createdAt: snapshot.createdAt.toISOString(),
      })),
    };
  }

  async preview(
    actor: JwtAccessPayload,
    checkId: string,
    dto: PreviewCheckoutDto = {},
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    await this.requireCheckoutV2(shopId);

    const check = await this.prisma.guestCheck.findFirst({
      where: { id: checkId, shopId },
      include: checkoutCheckInclude,
    });
    if (!check) throw new NotFoundException('Guest check not found');
    this.states.assertGuestCheckCanCalculate(check.status);
    if (dto.expectedVersion !== undefined) {
      assertExpectedVersion(check.version, dto.expectedVersion, {
        aggregateType: 'guest_check',
        aggregateId: checkId,
      });
    }

    return this.calculator.serialize(this.calculator.calculate(check));
  }

  async createSettlement(
    actor: JwtAccessPayload,
    checkId: string,
    dto: CreateCheckSettlementDto,
    correlationId?: string,
  ) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requireCheckoutV2(shopId);

    let created: SettlementWithSnapshots;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const check = await tx.guestCheck.findFirst({
          where: { id: checkId, shopId },
          include: checkoutCheckInclude,
        });
        if (!check) throw new NotFoundException('Guest check not found');
        this.states.assertGuestCheckCanCalculate(check.status);
        assertExpectedVersion(check.version, dto.expectedVersion, {
          aggregateType: 'guest_check',
          aggregateId: checkId,
        });
        this.assertBillFinalized(check);

        const preview = this.calculator.calculate(check);
        const nextVersion = check.version + 1;
        const settlement = await tx.checkSettlement.create({
          data: {
            shopId,
            guestCheckId: checkId,
            state: this.states.initialCalculatedState(),
            checkVersion: nextVersion,
            sourceHash: preview.sourceHash,
            subtotal: preview.subtotal,
            adjustments: preview.adjustments,
            taxAmount: preview.taxAmount,
            depositAmount: preview.depositAmount,
            total: preview.total,
            amountDue: preview.amountDue,
            currency: preview.currency,
            createdById: actor.sub,
          },
        });

        if (preview.lines.length > 0) {
          await tx.chargeSnapshot.createMany({
            data: preview.lines.map((line) => ({
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
            settlementId: settlement.id,
            guestCheckId: checkId,
            checkVersion: nextVersion,
            sourceHash: preview.sourceHash,
            currency: preview.currency,
            subtotal: serializeMoney(preview.subtotal),
            total: serializeMoney(preview.total),
            amountDue: serializeMoney(preview.amountDue),
            correlationId: correlationId ?? null,
          },
        });

        const hydrated = await tx.checkSettlement.findFirst({
          where: { id: settlement.id, shopId },
          include: settlementInclude,
        });
        if (!hydrated) throw new NotFoundException('Settlement not found');
        return hydrated;
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

    await this.audit.record(actor, {
      section: 'finance',
      action: 'checkout.settlement.create',
      summary: 'Created immutable checkout settlement snapshot',
      meta: {
        guestCheckId: checkId,
        settlementId: created.id,
        checkVersion: created.checkVersion,
        sourceHash: created.sourceHash,
        total: serializeMoney(created.total),
        currency: created.currency,
        correlationId: correlationId ?? null,
        charged: false,
      },
    });

    return this.serializeSettlement(created);
  }

  async getSettlement(actor: JwtAccessPayload, settlementId: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_READ);
    const shopId = requireShopId(actor);
    await this.requireCheckoutV2(shopId);

    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId },
      include: settlementInclude,
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return this.serializeSettlement(settlement);
  }
}
