import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  hashIdempotencyRequest,
  IDEMPOTENCY_SCOPES,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { CheckoutService } from './checkout.service';
import {
  CreateCheckoutPaymentDto,
  MergeGuestChecksDto,
  MoveGuestCheckChargesDto,
  PreviewPaymentGroupsDto,
} from './dto/chunk04.dto';
import {
  CreateCheckSettlementDto,
  PreviewCheckoutDto,
} from './dto/checkout.dto';
import { GuestCheckMergeService } from './guest-check-merge.service';

type RequestWithCorrelation = {
  correlationId?: string;
  requestId?: string;
};

@ApiTags('checkout')
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly payments: CheckoutPaymentService,
    private readonly merges: GuestCheckMergeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('checks/:checkId/preview')
  @RequirePermissions(PERMISSIONS.CHECKOUT_READ)
  preview(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Body() dto: PreviewCheckoutDto,
  ) {
    return this.checkout.preview(user, checkId, dto);
  }

  @Post('checks/:checkId/settlements')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  createSettlement(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Body() dto: CreateCheckSettlementDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithCorrelation,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CHECKOUT_SETTLEMENT_CREATE,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest({ checkId, ...dto }),
      },
      () =>
        this.checkout.createSettlement(
          user,
          checkId,
          dto,
          req.correlationId ?? req.requestId,
        ),
    );
  }

  @Get('settlements/:id')
  @RequirePermissions(PERMISSIONS.CHECKOUT_READ)
  getSettlement(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') settlementId: string,
  ) {
    return this.checkout.getSettlement(user, settlementId);
  }

  @Get('settlements/:id/payment-state')
  @RequirePermissions(PERMISSIONS.CHECKOUT_READ)
  getPaymentState(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') settlementId: string,
  ) {
    return this.payments.getPaymentState(user, settlementId);
  }

  @Post('settlements/:id/payment-groups/preview')
  @RequirePermissions(PERMISSIONS.CHECKOUT_READ)
  previewPaymentGroups(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') settlementId: string,
    @Body() dto: PreviewPaymentGroupsDto,
  ) {
    return this.payments.previewGroups(user, settlementId, dto);
  }

  @Post('settlements/:id/payments')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  createPayment(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') settlementId: string,
    @Body() dto: CreateCheckoutPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithCorrelation,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CHECKOUT_PAYMENT_CREATE,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest({ settlementId, ...dto }),
      },
      () =>
        this.payments.createPayment(
          user,
          settlementId,
          dto,
          req.correlationId ?? req.requestId,
        ),
    );
  }

  @Post('checks/:destinationCheckId/merge')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  mergeChecks(
    @CurrentUser() user: JwtAccessPayload,
    @Param('destinationCheckId') destinationCheckId: string,
    @Body() dto: MergeGuestChecksDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithCorrelation,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CHECKOUT_CHECK_MERGE,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest({ destinationCheckId, ...dto }),
      },
      () =>
        this.merges.merge(
          user,
          destinationCheckId,
          dto,
          req.correlationId ?? req.requestId,
        ),
    );
  }

  @Post('checks/:sourceCheckId/move-charges')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  moveCharges(
    @CurrentUser() user: JwtAccessPayload,
    @Param('sourceCheckId') sourceCheckId: string,
    @Body() dto: MoveGuestCheckChargesDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithCorrelation,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CHECKOUT_CHARGES_MOVE,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest({ sourceCheckId, ...dto }),
      },
      () =>
        this.merges.moveCharges(
          user,
          sourceCheckId,
          dto,
          req.correlationId ?? req.requestId,
        ),
    );
  }

  @Get('checks/:checkId/merge-history')
  @RequirePermissions(PERMISSIONS.CHECKOUT_READ)
  mergeHistory(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
  ) {
    return this.merges.history(user, checkId);
  }
}
