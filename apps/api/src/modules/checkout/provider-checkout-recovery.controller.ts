import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PaymentOperationState } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentDomainService } from '../device-payment/payment-domain.service';
import { CheckoutPaymentService } from './checkout-payment.service';

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function checkoutIntent(providerPayload: unknown) {
  const envelope = object(providerPayload);
  const metadata = object(envelope?.checkoutIntent);
  const allocationKind =
    typeof metadata?.allocationKind === 'string' ? metadata.allocationKind : null;
  const rawAllocations = Array.isArray(metadata?.allocations)
    ? metadata.allocations
    : [];
  const allocations = rawAllocations.flatMap((raw) => {
    const row = object(raw);
    if (
      typeof row?.snapshotId !== 'string' ||
      typeof row?.amount !== 'string'
    ) {
      return [];
    }
    return [{ snapshotId: row.snapshotId, amount: row.amount }];
  });
  if (!allocationKind || allocations.length === 0) return null;
  return { allocationKind, allocations };
}

@ApiTags('checkout')
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class ProviderCheckoutRecoveryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerPayments: PaymentDomainService,
    private readonly checkoutPayments: CheckoutPaymentService,
  ) {}

  @Get('settlements/:settlementId/provider-payment-active')
  @RequirePermissions(PERMISSIONS.CHECKOUT_READ)
  async active(
    @CurrentUser() user: JwtAccessPayload,
    @Param('settlementId') settlementId: string,
  ) {
    const shopId = requireShopId(user);
    const row = await this.prisma.paymentOperation.findFirst({
      where: {
        shopId,
        settlementId,
        OR: [
          { reconciliationRequired: true },
          {
            state: {
              in: [
                PaymentOperationState.CREATED,
                PaymentOperationState.PROCESSING,
                PaymentOperationState.REQUIRES_ACTION,
                PaymentOperationState.AUTHORIZED,
                PaymentOperationState.UNKNOWN,
              ],
            },
          },
          {
            state: PaymentOperationState.CAPTURED,
            checkoutPaymentId: null,
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, providerPayload: true },
    });
    if (!row) return null;

    const operation = await this.providerPayments.getOperation(user, row.id);
    const paymentState = await this.checkoutPayments.getPaymentState(
      user,
      settlementId,
    );
    return {
      operation,
      paymentState,
      intent: checkoutIntent(row.providerPayload),
    };
  }
}