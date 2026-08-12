import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
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

const closeCheckInclude = {
  shopOrders: {
    select: {
      id: true,
      status: true,
      label: true,
    },
  },
  playSessions: {
    select: {
      id: true,
      status: true,
      label: true,
      reservationId: true,
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

  /**
   * Checkout V3 finalization. Payment is authoritative in CheckSettlement;
   * operational sources only need to be finished, not paid a second time.
   */
  async closeCheck(actor: JwtAccessPayload, checkId: string) {
    this.assertPermission(actor, PERMISSIONS.CHECKOUT_WRITE);
    const shopId = requireShopId(actor);
    await this.requireCheckoutV2(shopId);

    const closed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "GuestCheck" WHERE "id" = ${checkId} AND "shopId" = ${shopId} FOR UPDATE`,
      );

      const check = await tx.guestCheck.findFirst({
        where: { id: checkId, shopId },
        include: closeCheckInclude,
      });
      if (!check) throw new NotFoundException('Guest check not found');
      if (check.status !== 'OPEN') {
        throw new ConflictException('This guest check is already closed');
      }
      if (!check.currentSettlementId) {
        throw new BadRequestException(
          'Prepare checkout and record payment before closing this guest check',
        );
      }

      const settlement = await tx.checkSettlement.findFirst({
        where: {
          id: check.currentSettlementId,
          shopId,
          guestCheckId: checkId,
        },
      });
      if (!settlement) {
        throw new ConflictException(
          'The active checkout settlement could not be found. Refresh checkout and try again.',
        );
      }
      if (settlement.state === 'VOID') {
        throw new ConflictException(
          'The active checkout settlement was voided. Refresh checkout before continuing.',
        );
      }

      const zeroValueCheckout = settlement.total.isZero() && settlement.amountDue.isZero();
      const paid =
        settlement.state === 'PAID' ||
        settlement.state === 'CLOSED' ||
        zeroValueCheckout;
      if (!paid) {
        throw new BadRequestException({
          message: 'Payment is not complete yet',
          amountDue: serializeMoney(settlement.amountDue),
          currency: settlement.currency,
        });
      }

      const blockers: Array<{
        type: 'ORDER' | 'PLAY_SESSION';
        id: string;
        label: string;
        status: string;
        action: 'orders' | 'sessions';
      }> = [];

      for (const order of check.shopOrders) {
        if (order.status === 'COMPLETED' || order.status === 'CANCELED') continue;
        blockers.push({
          type: 'ORDER',
          id: order.id,
          label: order.label?.trim() || `Order ${order.id.slice(0, 8)}`,
          status: order.status,
          action: 'orders',
        });
      }

      for (const play of check.playSessions) {
        if (play.status === 'COMPLETED' || play.status === 'CANCELED') continue;
        blockers.push({
          type: 'PLAY_SESSION',
          id: play.id,
          label: play.label?.trim() || `Play session ${play.id.slice(0, 8)}`,
          status: play.status,
          action: 'sessions',
        });
      }

      if (blockers.length > 0) {
        throw new BadRequestException({
          message: 'Finish the live activity before closing this guest check',
          blockers,
        });
      }

      if (settlement.state !== 'CLOSED') {
        if (zeroValueCheckout && settlement.state === 'CALCULATED') {
          this.states.assertTransition('CALCULATED', 'PAID');
          this.states.assertTransition('PAID', 'CLOSED');
        } else {
          this.states.assertTransition(settlement.state, 'CLOSED');
        }
        await tx.checkSettlement.update({
          where: { id: settlement.id },
          data: { state: 'CLOSED', amountDue: new Prisma.Decimal(0) },
        });
      }

      const result = await tx.guestCheck.updateMany({
        where: { id: checkId, shopId, status: 'OPEN' },
        data: {
          status: 'SETTLED',
          settledAt: new Date(),
          currentSettlementId: null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'This guest check changed while it was being closed. Refresh and try again.',
        );
      }

      await this.outbox.enqueue(tx, {
        shopId,
        aggregateType: 'check_settlement',
        aggregateId: settlement.id,
        eventType: 'settlement.closed',
        payload: {
          settlementId: settlement.id,
          guestCheckId: checkId,
          total: serializeMoney(settlement.total),
          currency: settlement.currency,
        },
      });

      return {
        checkId,
        settlementId: settlement.id,
        status: 'SETTLED' as const,
        settlementState: 'CLOSED' as const,
        total: serializeMoney(settlement.total),
        currency: settlement.currency,
      };
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'checkout.close',
      summary: 'Closed paid guest check',
      meta: closed,
    });

    return closed;
  }
}
