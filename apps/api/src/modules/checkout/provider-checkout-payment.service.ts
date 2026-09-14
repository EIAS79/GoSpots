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
import {
  roundMoneyDecimal,
  serializeMoney,
  sumMoneyDecimal,
} from '../../common/money.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PaymentDomainService } from '../device-payment/payment-domain.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import type {
  CreateProviderCheckoutPaymentDto,
  ReconcileProviderCheckoutPaymentDto,
} from './dto/provider-checkout-payment.dto';

const CHECKOUT_PROVIDER_CORRELATION_PREFIX = 'provider-operation:';

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

  private allocationAmount(
    allocations: Array<{ amount: string }>,
  ): Prisma.Decimal {
    const amounts = allocations.map((row) => roundMoneyDecimal(row.amount, 4));
    if (amounts.some((amount) => amount.lte(0))) {
      throw new BadRequestException('Payment allocations must be greater than zero');
    }
    return sumMoneyDecimal(...amounts);
  }

  private async settlementForProviderPayment(
    actor: JwtAccessPayload,
    settlementId: string,
  ) {
    const shopId = requireShopId(actor);
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId },
      select: {
        id: true,
        guestCheckId: true,
        currency: true,
        amountDue: true,
      },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return settlement;
  }

  private async assertNoOtherUnresolvedAttempt(
    actor: JwtAccessPayload,
    settlementId: string,
    idempotencyKey: string | undefined,
  ) {
    const shopId = requireShopId(actor);
    const existing = await this.prisma.paymentOperation.findFirst({
      where: {
        shopId,
        settlementId,
        reconciliationRequired: true,
        ...(idempotencyKey
          ? { idempotencyKey: { not: idempotencyKey } }
          : {}),
      },
      select: { id: true, state: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      throw new ConflictException(
        `Settlement has unresolved provider payment ${existing.id} (${existing.state}); reconcile it before another card attempt`,
      );
    }
  }

  private async finalizeCaptured(
    actor: JwtAccessPayload,
    operation: any,
    input: ReconcileProviderCheckoutPaymentDto,
  ) {
    if (operation.state !== PaymentOperationState.CAPTURED) {
      return {
        operation,
        paymentState: null,
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
        paymentState: null,
        checkoutFinalizationRequired: true,
      };
    }
  }

  async collect(
    actor: JwtAccessPayload,
    settlementId: string,
    input: CreateProviderCheckoutPaymentDto,
    idempotencyKey: string | undefined,
  ) {
    const settlement = await this.settlementForProviderPayment(
      actor,
      settlementId,
    );
    const amount = this.allocationAmount(input.allocations);
    if (amount.gt(settlement.amountDue)) {
      throw new BadRequestException('Payment exceeds settlement amount due');
    }
    await this.assertNoOtherUnresolvedAttempt(
      actor,
      settlementId,
      idempotencyKey,
    );

    const operation = await this.providerPayments.startPayment(
      actor,
      {
        provider: input.provider,
        settlementId,
        terminalId: input.terminalId,
        amount: serializeMoney(amount),
        currency: settlement.currency,
        metadata: {
          source: 'checkout',
          guestCheckId: settlement.guestCheckId,
          settlementId,
        },
      },
      idempotencyKey,
    );

    if (operation.state === PaymentOperationState.CAPTURED) {
      return this.finalizeCaptured(actor, operation, input);
    }
    return {
      operation,
      paymentState: null,
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

    if (operation.state === PaymentOperationState.CAPTURED) {
      return this.finalizeCaptured(actor, operation, input);
    }
    return {
      operation,
      paymentState: null,
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
