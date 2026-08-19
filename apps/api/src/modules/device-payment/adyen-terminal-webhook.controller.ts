import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PaymentOperationState,
  PaymentWebhookStatus,
  Prisma,
  RefundState,
} from '@prisma/client';
import { createHash } from 'crypto';
import { sumMoneyDecimal } from '../../common/money.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdyenTerminalConnector,
  type AdyenStandardWebhookItem,
  decodeAdyenPaymentReference,
} from './connectors/adyen-terminal.connector';
import { PaymentOperationStateService } from './payment-operation-state.service';

type AdyenWebhookEnvelope = {
  notificationItems?: Array<{ NotificationRequestItem?: AdyenStandardWebhookItem }>;
};

const REFUND_EVENT_CODES = new Set([
  'CANCEL_OR_REFUND',
  'REFUND_FAILED',
  'REFUNDED_REVERSED',
]);

function uniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isLateRefundCorrection(eventCode: string): boolean {
  return eventCode === 'REFUND_FAILED' || eventCode === 'REFUNDED_REVERSED';
}

function refundFailureCode(eventCode: string): string {
  if (eventCode === 'REFUNDED_REVERSED') return 'ADYEN_REFUNDED_REVERSED';
  if (eventCode === 'REFUND_FAILED') return 'ADYEN_REFUND_FAILED';
  return 'ADYEN_CANCEL_OR_REFUND_FAILED';
}

function paymentStateForSuccessfulRefundTotal(
  totalRefunded: Prisma.Decimal,
  paymentAmount: Prisma.Decimal,
): PaymentOperationState {
  if (totalRefunded.isZero()) return PaymentOperationState.CAPTURED;
  if (totalRefunded.eq(paymentAmount)) return PaymentOperationState.REFUNDED;
  if (totalRefunded.lt(paymentAmount)) return PaymentOperationState.PARTIALLY_REFUNDED;
  throw new BadRequestException('Successful refund total exceeds captured payment amount');
}

@ApiTags('payments')
@Controller('payments/webhooks/adyen')
export class AdyenTerminalWebhookController {
  constructor(
    private readonly connector: AdyenTerminalConnector,
    private readonly prisma: PrismaService,
    private readonly states: PaymentOperationStateService,
  ) {}

  @Post()
  @HttpCode(202)
  async ingest(@Body() body: AdyenWebhookEnvelope) {
    const wrappers = Array.isArray(body.notificationItems) ? body.notificationItems : [];
    if (!wrappers.length) {
      throw new BadRequestException('Adyen notificationItems are required');
    }

    let applied = 0;
    let duplicates = 0;
    let ignored = 0;

    for (const wrapper of wrappers) {
      const item = wrapper?.NotificationRequestItem;
      if (!item) throw new BadRequestException('Invalid Adyen notification item');
      if (!this.connector.verifyStandardWebhook(item)) {
        throw new BadRequestException('Invalid Adyen webhook HMAC signature');
      }
      if (
        !item.merchantAccountCode ||
        !this.connector.configuredMerchantMatches(item.merchantAccountCode)
      ) {
        throw new BadRequestException('Adyen merchant account does not match GoSpots configuration');
      }

      const eventCode = item.eventCode ?? '';
      if (!REFUND_EVENT_CODES.has(eventCode)) {
        ignored += 1;
        continue;
      }
      if (!item.pspReference || !item.originalReference) {
        throw new BadRequestException('Adyen refund webhook references are incomplete');
      }

      const refund = await this.prisma.refund.findFirst({
        where: {
          paymentOperation: { provider: 'adyen' },
          OR: [
            { providerRefundId: item.pspReference },
            ...(item.merchantReference ? [{ id: item.merchantReference }] : []),
          ],
        },
        include: { paymentOperation: true },
      });
      // A valid Adyen webhook may belong to another integration using the same
      // merchant account. It must never create GoSpots venue-payment state.
      if (!refund) {
        ignored += 1;
        continue;
      }

      let paymentReference;
      try {
        paymentReference = decodeAdyenPaymentReference(
          refund.paymentOperation.providerPaymentId ?? '',
        );
      } catch {
        throw new BadRequestException('Stored Adyen payment reference is invalid');
      }
      if (
        paymentReference.pspReference &&
        paymentReference.pspReference !== item.originalReference
      ) {
        throw new BadRequestException('Adyen refund webhook original payment does not match');
      }

      const eventId = `${eventCode}:${item.pspReference}`;
      const eventKey = {
        shopId_provider_eventId: {
          shopId: refund.shopId,
          provider: 'adyen',
          eventId,
        },
      } as const;
      const existing = await this.prisma.paymentWebhookEvent.findUnique({
        where: eventKey,
      });
      if (existing) {
        duplicates += 1;
        continue;
      }

      const lateCorrection = isLateRefundCorrection(eventCode);
      const successfulValidation =
        eventCode === 'CANCEL_OR_REFUND' && String(item.success).toLowerCase() === 'true';
      const nextRefundState = successfulValidation
        ? RefundState.SUCCEEDED
        : RefundState.FAILED;
      const payloadHash = createHash('sha256')
        .update(JSON.stringify(item))
        .digest('hex');
      const now = new Date();

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.paymentWebhookEvent.create({
            data: {
              shopId: refund.shopId,
              provider: 'adyen',
              eventId,
              eventType: eventCode,
              payloadHash,
              paymentOperationId: refund.paymentOperationId,
              status: PaymentWebhookStatus.APPLIED,
              processedAt: now,
            },
          });

          await tx.refund.update({
            where: { id: refund.id },
            data: {
              providerRefundId: item.pspReference,
              state: nextRefundState,
              errorCode:
                nextRefundState === RefundState.FAILED
                  ? refundFailureCode(eventCode)
                  : null,
              errorMessage:
                nextRefundState === RefundState.FAILED
                  ? item.reason?.trim() ||
                    (eventCode === 'REFUNDED_REVERSED'
                      ? 'Adyen reported that the previously refunded amount was reversed'
                      : 'Adyen reported that the refund did not complete')
                  : null,
              succeededAt:
                nextRefundState === RefundState.SUCCEEDED ? now : refund.succeededAt,
              failedAt:
                nextRefundState === RefundState.FAILED ? now : refund.failedAt,
              lastReconciledAt: now,
            },
          });

          const currentOperation = await tx.paymentOperation.findUnique({
            where: { id: refund.paymentOperationId },
          });
          if (!currentOperation) {
            throw new BadRequestException('Payment operation disappeared during refund reconciliation');
          }

          const successfulRefunds = await tx.refund.findMany({
            where: {
              paymentOperationId: refund.paymentOperationId,
              state: RefundState.SUCCEEDED,
            },
            select: { amount: true },
          });
          const totalRefunded = sumMoneyDecimal(
            ...successfulRefunds.map((row) => row.amount),
          );
          const nextPaymentState = paymentStateForSuccessfulRefundTotal(
            totalRefunded,
            currentOperation.amount,
          );

          if (currentOperation.state !== nextPaymentState) {
            this.states.assertTransition(currentOperation.state, nextPaymentState, {
              reconciliation: lateCorrection,
            });
          }
          await tx.paymentOperation.update({
            where: { id: currentOperation.id },
            data: {
              state: nextPaymentState,
              reconciliationRequired: false,
              lastReconciledAt: now,
            },
          });
        });
        applied += 1;
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        duplicates += 1;
      }
    }

    return { received: true, applied, duplicates, ignored };
  }
}
