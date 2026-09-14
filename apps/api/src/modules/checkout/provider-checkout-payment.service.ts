import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckoutPaymentMethod,
  PaymentOperationState,
  Prisma,
} from '@prisma/client';
import { checkoutBillReadiness } from '../../common/checkout-integrity.util';
import {
  roundMoneyDecimal,
  serializeMoney,
  sumMoneyDecimal,
} from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { normalizePaymentProvider } from '../device-payment/connectors/payment-connector.registry';
import { PaymentDomainService } from '../device-payment/payment-domain.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import type {
  CreateProviderCheckoutPaymentDto,
  ReconcileProviderCheckoutPaymentDto,
} from './dto/provider-checkout-payment.dto';

const CHECKOUT_PROVIDER_CORRELATION_PREFIX = 'provider-operation:';
const ACTIVE_PROVIDER_STATES: PaymentOperationState[] = [
  PaymentOperationState.CREATED,
  PaymentOperationState.PROCESSING,
  PaymentOperationState.REQUIRES_ACTION,
  PaymentOperationState.AUTHORIZED,
  PaymentOperationState.UNKNOWN,
];

type ProviderCheckoutInput =
  | CreateProviderCheckoutPaymentDto
  | ReconcileProviderCheckoutPaymentDto;

type ProviderPaymentOperation = Awaited<
  ReturnType<PaymentDomainService['startPayment']>
>;

function jsonObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

@Injectable()
export class ProviderCheckoutPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerPayments: PaymentDomainService,
    private readonly checkoutPayments: CheckoutPaymentService,
  ) {}

  private correlationId(operationId: string) {
    return `${CHECKOUT_PROVIDER_CORRELATION_PREFIX}${operationId}`;
  }

  private requiredIdempotencyKey(raw: string | undefined) {
    const key = String(raw ?? '').trim();
    if (!key) throw new BadRequestException('Idempotency-Key header is required');
    if (key.length > 128) {
      throw new BadRequestException('Idempotency-Key must be at most 128 characters');
    }
    return key;
  }

  private allocationAmount(
    allocations: Array<{ amount: string }>,
  ): Prisma.Decimal {
    const amounts = allocations.map((row) => roundMoneyDecimal(row.amount, 4));
    if (amounts.some((amount) => amount.lte(0))) {
      throw new BadRequestException('Payment allocations must be greater than zero');
    }
    return sumMoneyDecimal(...amounts);
  }

  private providerPayloadForCheckout(
    currentPayload: Prisma.JsonValue | null,
    input: ProviderCheckoutInput,
  ): Prisma.InputJsonValue {
    const currentObject = jsonObject(currentPayload);
    const providerPayload =
      currentObject && 'checkoutIntent' in currentObject && 'provider' in currentObject
        ? currentObject.provider
        : currentPayload;
    return {
      provider: providerPayload,
      checkoutIntent: {
        allocationKind: input.allocationKind,
        allocations: input.allocations.map((row) => ({
          snapshotId: row.snapshotId,
          amount: serializeMoney(roundMoneyDecimal(row.amount, 4)),
        })),
        note: input.note?.trim() || null,
      },
    } as Prisma.InputJsonValue;
  }

  private async persistCheckoutIntent(
    operation: ProviderPaymentOperation,
    input: ProviderCheckoutInput,
  ) {
    await this.prisma.paymentOperation.update({
      where: { id: operation.id },
      data: {
        providerPayload: this.providerPayloadForCheckout(
          operation.providerPayload,
          input,
        ),
      },
    });
  }

  private async settlementForProviderPayment(
    actor: JwtAccessPayload,
    settlementId: string,
  ) {
    const shopId = requireShopId(actor);
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId },
      include: {
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
              select: { id: true, updatedAt: true },
            },
          },
        },
        snapshots: {
          include: {
            allocations: {
              where: { payment: { status: 'SUCCESS' } },
              select: { amount: true },
            },
          },
        },
      },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return settlement;
  }

  private assertCurrentAndPayable(
    settlement: Awaited<ReturnType<ProviderCheckoutPaymentService['settlementForProviderPayment']>>,
    input: ProviderCheckoutInput,
  ) {
    if (settlement.guestCheck.status !== 'OPEN') {
      throw new ConflictException('Guest check is no longer open');
    }
    if (settlement.guestCheck.currentSettlementId !== settlement.id) {
      throw new ConflictException(
        'Settlement is stale. Refresh checkout before taking payment.',
      );
    }
    if (
      settlement.state === 'PAID' ||
      settlement.state === 'CLOSED' ||
      settlement.amountDue.lte(0)
    ) {
      throw new ConflictException('Settlement is already fully paid');
    }
    if (settlement.state === 'VOID') {
      throw new ConflictException('Settlement is void');
    }
    if (settlement.guestCheck.version !== input.expectedCheckVersion) {
      throw new ConflictException(
        'Guest check changed before the provider payment could start. Refresh checkout and try again.',
      );
    }

    const readiness = checkoutBillReadiness(settlement.guestCheck);
    if (!readiness.ready) {
      throw new ConflictException(
        'Finalize open orders and standalone play timers before taking payment.',
      );
    }

    const changedSources = [
      ...settlement.guestCheck.shopOrders.map((row) => row.updatedAt),
      ...settlement.guestCheck.playSessions.map((row) => row.updatedAt),
      ...settlement.guestCheck.reservations.map((row) => row.updatedAt),
    ].filter((updatedAt) => updatedAt.getTime() > settlement.createdAt.getTime());
    if (changedSources.length > 0) {
      throw new ConflictException(
        'Linked activity changed after this bill was calculated. Recalculate checkout before taking payment.',
      );
    }

    const bySnapshotId = new Map(
      settlement.snapshots.map((snapshot) => [snapshot.id, snapshot] as const),
    );
    const seen = new Set<string>();
    let allocatedTotal = new Prisma.Decimal(0);

    for (const allocation of input.allocations) {
      if (seen.has(allocation.snapshotId)) {
        throw new BadRequestException(
          `Duplicate allocation for snapshot ${allocation.snapshotId}`,
        );
      }
      seen.add(allocation.snapshotId);
      const snapshot = bySnapshotId.get(allocation.snapshotId);
      if (!snapshot) {
        throw new BadRequestException(
          `Snapshot ${allocation.snapshotId} does not belong to this settlement`,
        );
      }
      const amount = roundMoneyDecimal(allocation.amount, 4);
      if (amount.lte(0)) {
        throw new BadRequestException('Payment allocations must be greater than zero');
      }
      const alreadyAllocated = sumMoneyDecimal(
        ...snapshot.allocations.map((row) => row.amount),
      );
      const remaining = roundMoneyDecimal(
        snapshot.finalAmount.sub(alreadyAllocated),
        4,
      );
      if (amount.gt(remaining)) {
        throw new BadRequestException(
          `Allocation exceeds remaining balance for snapshot ${snapshot.id}`,
        );
      }
      allocatedTotal = roundMoneyDecimal(allocatedTotal.add(amount), 4);
    }

    if (allocatedTotal.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (allocatedTotal.gt(settlement.amountDue)) {
      throw new BadRequestException('Payment exceeds settlement amount due');
    }
    return allocatedTotal;
  }

  private async claimCheckoutVersion(
    actor: JwtAccessPayload,
    settlementId: string,
    expectedCheckVersion: number,
  ) {
    const shopId = requireShopId(actor);
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId },
      select: { guestCheckId: true },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');

    const claimed = await this.prisma.guestCheck.updateMany({
      where: {
        id: settlement.guestCheckId,
        shopId,
        status: 'OPEN',
        currentSettlementId: settlementId,
        version: expectedCheckVersion,
      },
      data: { version: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        'Another checkout action started first. Refresh before retrying the card.',
      );
    }
    return expectedCheckVersion + 1;
  }

  private async assertNoOtherUnresolvedAttempt(
    actor: JwtAccessPayload,
    settlementId: string,
    idempotencyKey: string,
  ) {
    const shopId = requireShopId(actor);
    const existing = await this.prisma.paymentOperation.findFirst({
      where: {
        shopId,
        settlementId,
        idempotencyKey: { not: idempotencyKey },
        OR: [
          { reconciliationRequired: true },
          { state: { in: ACTIVE_PROVIDER_STATES } },
          {
            state: PaymentOperationState.CAPTURED,
            checkoutPaymentId: null,
          },
        ],
      },
      select: { id: true, state: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      throw new ConflictException(
        `Settlement has unresolved provider payment ${existing.id} (${existing.state}); resolve it before another card attempt`,
      );
    }
  }

  private async paymentStateForOperation(
    actor: JwtAccessPayload,
    operation: { settlementId?: string | null },
  ) {
    if (!operation.settlementId) return null;
    return this.checkoutPayments.getPaymentState(actor, operation.settlementId);
  }

  private async finalizeCaptured(
    actor: JwtAccessPayload,
    operation: ProviderPaymentOperation,
    input: ReconcileProviderCheckoutPaymentDto,
  ) {
    if (operation.state !== PaymentOperationState.CAPTURED) {
      return {
        operation,
        paymentState: await this.paymentStateForOperation(actor, operation),
        checkoutFinalizationRequired: false,
      };
    }
    if (!operation.settlementId) {
      throw new ConflictException('Captured provider payment is not linked to a settlement');
    }

    const shopId = requireShopId(actor);
    const expectedAmount = this.allocationAmount(input.allocations);
    const providerAmount = roundMoneyDecimal(operation.amount, 4);
    if (!expectedAmount.eq(providerAmount)) {
      throw new ConflictException(
        'Checkout allocation total no longer matches the captured provider amount',
      );
    }

    if (operation.checkoutPaymentId) {
      return {
        operation,
        paymentState: await this.checkoutPayments.getPaymentState(
          actor,
          operation.settlementId,
        ),
        checkoutFinalizationRequired: false,
      };
    }

    const correlationId = this.correlationId(operation.id);
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        shopId,
        settlementId: operation.settlementId,
        correlationId,
      },
      select: { id: true },
    });
    if (existingPayment) {
      const linked = await this.prisma.paymentOperation.update({
        where: { id: operation.id },
        data: {
          checkoutPaymentId: existingPayment.id,
          reconciliationRequired: false,
          errorCode: null,
          errorMessage: null,
        },
      });
      return {
        operation: linked,
        paymentState: await this.checkoutPayments.getPaymentState(
          actor,
          operation.settlementId,
        ),
        checkoutFinalizationRequired: false,
      };
    }

    try {
      const paymentState = await this.checkoutPayments.createPayment(
        actor,
        operation.settlementId,
        {
          expectedCheckVersion: input.expectedCheckVersion,
          method: CheckoutPaymentMethod.MANUAL_CARD,
          allocationKind: input.allocationKind,
          allocations: input.allocations,
          note: input.note,
        },
        correlationId,
      );
      const checkoutPayment = await this.prisma.payment.findFirst({
        where: {
          shopId,
          settlementId: operation.settlementId,
          correlationId,
        },
        select: { id: true },
      });
      if (!checkoutPayment) {
        throw new ConflictException(
          'Provider payment was captured but checkout payment linkage was not persisted',
        );
      }
      const linked = await this.prisma.paymentOperation.update({
        where: { id: operation.id },
        data: {
          checkoutPaymentId: checkoutPayment.id,
          reconciliationRequired: false,
          errorCode: null,
          errorMessage: null,
        },
      });
      return {
        operation: linked,
        paymentState,
        checkoutFinalizationRequired: false,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Checkout finalization failed';
      const marked = await this.prisma.paymentOperation.update({
        where: { id: operation.id },
        data: {
          reconciliationRequired: true,
          errorCode: 'CHECKOUT_FINALIZATION_REQUIRED',
          errorMessage: message.slice(0, 500),
        },
      });
      return {
        operation: marked,
        paymentState: await this.paymentStateForOperation(actor, marked),
        checkoutFinalizationRequired: true,
      };
    }
  }

  private providerRequestMetadata(
    settlement: Awaited<ReturnType<ProviderCheckoutPaymentService['settlementForProviderPayment']>>,
    input: CreateProviderCheckoutPaymentDto,
  ) {
    return {
      source: 'checkout',
      guestCheckId: settlement.guestCheckId,
      settlementId: settlement.id,
      expectedCheckVersion: input.expectedCheckVersion,
      allocationKind: input.allocationKind,
      allocations: input.allocations.map((row) => ({
        snapshotId: row.snapshotId,
        amount: serializeMoney(roundMoneyDecimal(row.amount, 4)),
      })),
    };
  }

  async collect(
    actor: JwtAccessPayload,
    settlementId: string,
    input: CreateProviderCheckoutPaymentDto,
    idempotencyKeyRaw: string | undefined,
  ) {
    const shopId = requireShopId(actor);
    const idempotencyKey = this.requiredIdempotencyKey(idempotencyKeyRaw);
    const provider = normalizePaymentProvider(input.provider);
    const settlement = await this.settlementForProviderPayment(actor, settlementId);
    const amount = this.allocationAmount(input.allocations);
    const providerRequest = {
      provider,
      settlementId,
      terminalId: input.terminalId,
      amount: serializeMoney(amount),
      currency: settlement.currency,
      metadata: this.providerRequestMetadata(settlement, input),
    };

    const existing = await this.prisma.paymentOperation.findUnique({
      where: {
        shopId_provider_idempotencyKey: {
          shopId,
          provider,
          idempotencyKey,
        },
      },
      select: { id: true },
    });
    if (existing) {
      const replayed = await this.providerPayments.startPayment(
        actor,
        providerRequest,
        idempotencyKey,
      );
      await this.persistCheckoutIntent(replayed, input);
      if (replayed.state === PaymentOperationState.CAPTURED) {
        return this.finalizeCaptured(actor, replayed, {
          expectedCheckVersion: input.expectedCheckVersion + 1,
          allocationKind: input.allocationKind,
          allocations: input.allocations,
          note: input.note,
        });
      }
      return {
        operation: replayed,
        paymentState: await this.paymentStateForOperation(actor, replayed),
        checkoutFinalizationRequired: false,
      };
    }

    const validatedAmount = this.assertCurrentAndPayable(settlement, input);
    if (!validatedAmount.eq(amount)) {
      throw new ConflictException('Provider payment amount changed during validation');
    }
    await this.assertNoOtherUnresolvedAttempt(
      actor,
      settlementId,
      idempotencyKey,
    );
    const claimedCheckVersion = await this.claimCheckoutVersion(
      actor,
      settlementId,
      input.expectedCheckVersion,
    );

    const operation = await this.providerPayments.startPayment(
      actor,
      providerRequest,
      idempotencyKey,
    );
    await this.persistCheckoutIntent(operation, input);

    if (operation.state === PaymentOperationState.CAPTURED) {
      return this.finalizeCaptured(actor, operation, {
        expectedCheckVersion: claimedCheckVersion,
        allocationKind: input.allocationKind,
        allocations: input.allocations,
        note: input.note,
      });
    }
    return {
      operation,
      paymentState: await this.paymentStateForOperation(actor, operation),
      checkoutFinalizationRequired: false,
    };
  }

  async reconcile(
    actor: JwtAccessPayload,
    operationId: string,
    input: ReconcileProviderCheckoutPaymentDto,
  ) {
    const current = await this.providerPayments.getOperation(actor, operationId);
    if (!current.settlementId) {
      throw new ConflictException('Payment operation is not linked to checkout');
    }

    const operation =
      current.state === PaymentOperationState.UNKNOWN
        ? await this.providerPayments.reconcile(actor, operationId)
        : current;
    await this.persistCheckoutIntent(operation, input);

    if (operation.state === PaymentOperationState.CAPTURED) {
      return this.finalizeCaptured(actor, operation, input);
    }
    return {
      operation,
      paymentState: await this.paymentStateForOperation(actor, operation),
      checkoutFinalizationRequired: false,
    };
  }

  async cancel(actor: JwtAccessPayload, operationId: string) {
    const current = await this.providerPayments.getOperation(actor, operationId);
    if (!current.settlementId) {
      throw new ConflictException('Payment operation is not linked to checkout');
    }
    const operation = await this.providerPayments.cancel(actor, operationId);
    return {
      operation,
      paymentState: await this.checkoutPayments.getPaymentState(
        actor,
        current.settlementId,
      ),
      checkoutFinalizationRequired: false,
    };
  }
}