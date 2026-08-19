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

function uniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
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

      if (item.eventCode !== 'CANCEL_OR_REFUND') {
        ignored += 1;
        continue;
      }
      if (!item.merchantReference || !item.pspReference || !item.originalReference) {
        throw new BadRequestException('Adyen refund webhook references are incomplete');
      }

      const refund = await this.prisma.refund.findFirst({
        where: {
          id: item.merchantReference,
          paymentOperation: { provider: 'adyen' },
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

      const eventId = `${item.eventCode}:${item.pspReference}`;
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

      const nextRefundState =
        String(item.success).toLowerCase() === 'true'
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
              eventType: item.eventCode,
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
                  ? 'ADYEN_CANCEL_OR_REFUND_FAILED'
                  : null,
              errorMessage:
                nextRefundState === RefundState.FAILED
                  ? item.reason?.trim() || 'Adyen rejected the refund request'
                  : null,
              succeededAt:
                nextRefundState === RefundState.SUCCEEDED ? now : refund.succeededAt,
              failedAt:
                nextRefundState === RefundState.FAILED ? now : refund.failedAt,
              lastReconciledAt: now,
            },
          });

          if (nextRefundState === RefundState.SUCCEEDED) {
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
            const nextPaymentState = totalRefunded.eq(currentOperation.amount)
              ? PaymentOperationState.REFUNDED
              : PaymentOperationState.PARTIALLY_REFUNDED;
            this.states.assertTransition(currentOperation.state, nextPaymentState);
            await tx.paymentOperation.update({
              where: { id: currentOperation.id },
              data: {
                state: nextPaymentState,
                lastReconciledAt: now,
              },
            });
          }
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
