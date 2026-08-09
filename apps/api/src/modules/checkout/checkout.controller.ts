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
import { CheckoutService } from './checkout.service';
import {
  CreateCheckSettlementDto,
  PreviewCheckoutDto,
} from './dto/checkout.dto';

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
}
