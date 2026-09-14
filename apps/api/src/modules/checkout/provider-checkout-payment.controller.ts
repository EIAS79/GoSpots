import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateProviderCheckoutPaymentDto,
  ReconcileProviderCheckoutPaymentDto,
} from './dto/provider-checkout-payment.dto';
import { ProviderCheckoutPaymentService } from './provider-checkout-payment.service';

@ApiTags('checkout')
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class ProviderCheckoutPaymentController {
  constructor(private readonly providerCheckout: ProviderCheckoutPaymentService) {}

  @Post('settlements/:settlementId/provider-payments')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  collect(
    @CurrentUser() user: JwtAccessPayload,
    @Param('settlementId') settlementId: string,
    @Body() dto: CreateProviderCheckoutPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.providerCheckout.collect(
      user,
      settlementId,
      dto,
      idempotencyKey,
    );
  }

  @Post('provider-payments/:operationId/reconcile')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  reconcile(
    @CurrentUser() user: JwtAccessPayload,
    @Param('operationId') operationId: string,
    @Body() dto: ReconcileProviderCheckoutPaymentDto,
  ) {
    return this.providerCheckout.reconcile(user, operationId, dto);
  }

  @Post('provider-payments/:operationId/cancel')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  cancel(
    @CurrentUser() user: JwtAccessPayload,
    @Param('operationId') operationId: string,
  ) {
    return this.providerCheckout.cancel(user, operationId);
  }
}
