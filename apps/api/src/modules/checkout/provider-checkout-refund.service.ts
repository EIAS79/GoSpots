import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckoutPaymentStatus,
  PaymentOperationState,
  RefundState,
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

const PENDING_REFUND_STATES: RefundState[] = [
  RefundState.CREATED,
  RefundState.PROCESSING,
  RefundState.UNKNOWN,
];

@Injectable()
export class ProviderCheckoutRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerPayments: PaymentDomainService,
  ) {}

  private requiredIdempotencyKey(raw: string | undefined) {
    const key = String(raw ?? '').trim();
    if (!key) throw new BadRequestException('Idempotency-Key header is required');
    if (key.length > 128) {
      throw new BadRequestException('Idempotency-Key must be at most 128 characters');
    }
    return key;
  }

  async list(actor: JwtAccessPayload, settlementId: string) {
    const shopId = requireShopId(actor);
    const operations = await this.prisma.paymentOperation.findMany({
      where: {
        shopId,
        settlementId,
        checkoutPaymentId: { not: null },
      },
      include: {
        refunds: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            state: true,
            amount: true,
            currency: true,
            providerRefundId: true,
            errorCode: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return operations.map((operation) => {
      const successful = operation.refunds.filter(
        (refund) => refund.state === RefundState.SUCCEEDED,
      );
      const refundedAmount = sumMoneyDecimal(
        ...successful.map((refund) => refund.amount),
      );
      const refundableAmount = roundMoneyDecimal(
        operation.amount.sub(refundedAmount),
        4,
      );
      const pendingRefund = operation.refunds.some((refund) =>
        PENDING_REFUND_STATES.includes(refund.state),
      );
      const refundableState =
        operation.state === PaymentOperationState.CAPTURED ||
        operation.state === PaymentOperationState.PARTIALLY_REFUNDED;

      return {
        id: operation.id,
        checkoutPaymentId: operation.checkoutPaymentId,
        provider: operation.provider,
        state: operation.state,
        amount: serializeMoney(operation.amount),
        currency: operation.currency,
        refundedAmount: serializeMoney(refundedAmount),
        refundableAmount: serializeMoney(refundableAmount),
        pendingRefund,
        canRefund:
          refundableState && refundableAmount.gt(0) && !pendingRefund,
        refunds: operation.refunds.map((refund) => ({
          ...refund,
          amount: serializeMoney(refund.amount),
          createdAt: refund.createdAt.toISOString(),
          updatedAt: refund.updatedAt.toISOString(),
        })),
      };
    });
  }

  async refundRemaining(
    actor: JwtAccessPayload,
    operationId: string,
    reason: string | undefined,
    idempotencyKeyRaw: string | undefined,
  ) {
    const shopId = requireShopId(actor);
    const idempotencyKey = this.requiredIdempotencyKey(idempotencyKeyRaw);
    const operation = await this.prisma.paymentOperation.findFirst({
      where: { id: operationId, shopId },
      include: {
        refunds: {
          include: { allocations: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!operation) throw new NotFoundException('Payment operation not found');
    if (!operation.settlementId || !operation.checkoutPaymentId) {
      throw new ConflictException(
        'Provider payment is not linked to a finalized checkout payment',
      );
    }
    if (
      operation.state !== PaymentOperationState.CAPTURED &&
      operation.state !== PaymentOperationState.PARTIALLY_REFUNDED
    ) {
      throw new ConflictException('Only captured card payments can be refunded');
    }
    if (
      operation.refunds.some((refund) =>
        PENDING_REFUND_STATES.includes(refund.state),
      )
    ) {
      throw new ConflictException(
        'A refund is already pending provider confirmation. Reconcile it before another refund.',
      );
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        id: operation.checkoutPaymentId,
        shopId,
        settlementId: operation.settlementId,
        status: CheckoutPaymentStatus.SUCCESS,
      },
      include: {
        allocations: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!payment) {
      throw new ConflictException(
        'Linked checkout payment is unavailable for refund allocation',
      );
    }

    const refundedByAllocation = new Map<string, ReturnType<typeof roundMoneyDecimal>>();
    const refundedBySnapshot = new Map<string, ReturnType<typeof roundMoneyDecimal>>();
    for (const refund of operation.refunds) {
      if (refund.state !== RefundState.SUCCEEDED) continue;
      for (const allocation of refund.allocations) {
        if (allocation.paymentAllocationId) {
          const current = refundedByAllocation.get(allocation.paymentAllocationId);
          refundedByAllocation.set(
            allocation.paymentAllocationId,
            roundMoneyDecimal(
              (current ?? roundMoneyDecimal(0, 4)).add(allocation.amount),
              4,
            ),
          );
        } else if (allocation.snapshotId) {
          const current = refundedBySnapshot.get(allocation.snapshotId);
          refundedBySnapshot.set(
            allocation.snapshotId,
            roundMoneyDecimal(
              (current ?? roundMoneyDecimal(0, 4)).add(allocation.amount),
              4,
            ),
          );
        }
      }
    }

    const remainingAllocations = payment.allocations.flatMap((allocation) => {
      const alreadyRefunded = roundMoneyDecimal(
        (refundedByAllocation.get(allocation.id) ?? roundMoneyDecimal(0, 4)).add(
          refundedBySnapshot.get(allocation.snapshotId) ?? roundMoneyDecimal(0, 4),
        ),
        4,
      );
      const remaining = roundMoneyDecimal(
        allocation.amount.sub(alreadyRefunded),
        4,
      );
      if (remaining.isNegative()) {
        throw new ConflictException(
          'Refund allocation history exceeds the original checkout payment',
        );
      }
      if (remaining.isZero()) return [];
      return [
        {
          paymentAllocationId: allocation.id,
          snapshotId: allocation.snapshotId,
          amount: serializeMoney(remaining),
        },
      ];
    });

    if (!remainingAllocations.length) {
      throw new ConflictException('Provider payment is already fully refunded');
    }
    const amount = sumMoneyDecimal(
      ...remainingAllocations.map((allocation) => allocation.amount),
    );
    const expectedRemaining = roundMoneyDecimal(
      operation.amount.sub(
        sumMoneyDecimal(
          ...operation.refunds
            .filter((refund) => refund.state === RefundState.SUCCEEDED)
            .map((refund) => refund.amount),
        ),
      ),
      4,
    );
    if (!amount.eq(expectedRemaining)) {
      throw new ConflictException(
        'Refund allocation lineage does not match the provider payment balance',
      );
    }

    const refund = await this.providerPayments.createRefund(
      actor,
      operation.id,
      {
        amount: serializeMoney(amount),
        reason: reason?.trim() || 'Checkout card refund',
        allocations: remainingAllocations,
      },
      idempotencyKey,
    );

    return {
      id: refund.id,
      paymentOperationId: refund.paymentOperationId,
      providerRefundId: refund.providerRefundId,
      state: refund.state,
      amount: serializeMoney(refund.amount),
      currency: refund.currency,
      errorCode: refund.errorCode,
      errorMessage: refund.errorMessage,
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString(),
    };
  }
}