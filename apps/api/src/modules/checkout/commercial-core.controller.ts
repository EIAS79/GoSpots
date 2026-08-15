import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  hashIdempotencyRequest,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CommercialCoreService } from './commercial-core.service';
import {
  AddServiceChargeDto,
  AddTipDto,
  ApplyCommercialAdjustmentDto,
  CompleteVenueOrderDto,
  ReopenGuestCheckDto,
  TransferGuestCheckDto,
  UpdateCommercialPolicyDto,
  UpsertCommercialProfileDto,
  VoidCommercialMutationDto,
} from './dto/phase4-commercial.dto';

@ApiTags('commercial-core')
@Controller('commercial')
@UseGuards(JwtAuthGuard)
export class CommercialCoreController {
  constructor(
    private readonly commercial: CommercialCoreService,
    private readonly prisma: PrismaService,
  ) {}

  private mutate<T>(
    user: JwtAccessPayload,
    scope: string,
    key: string | undefined,
    request: unknown,
    fn: () => Promise<T>,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope,
        key,
        requireKey: true,
        requestHash: hashIdempotencyRequest(request),
      },
      fn,
    );
  }

  @Get('policy')
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  getPolicy(@CurrentUser() user: JwtAccessPayload) {
    return this.commercial.getPolicy(user);
  }

  @Patch('policy')
  @RequirePermissions(PERMISSIONS.SETTINGS_WRITE)
  updatePolicy(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateCommercialPolicyDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.policy.update', key, dto, () =>
      this.commercial.updatePolicy(user, dto),
    );
  }

  @Get('checks/:checkId')
  @RequirePermissions(PERMISSIONS.CHECKOUT_READ)
  getCheck(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
  ) {
    return this.commercial.getCheck(user, checkId);
  }

  @Put('checks/:checkId/profile')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  upsertProfile(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Body() dto: UpsertCommercialProfileDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.profile', key, { checkId, ...dto }, () =>
      this.commercial.upsertProfile(user, checkId, dto),
    );
  }

  @Post('checks/:checkId/transfer')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  transfer(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Body() dto: TransferGuestCheckDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.transfer', key, { checkId, ...dto }, () =>
      this.commercial.transfer(user, checkId, dto),
    );
  }

  @Post('checks/:checkId/adjustments')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  applyAdjustment(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Body() dto: ApplyCommercialAdjustmentDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.adjustment.apply', key, { checkId, ...dto }, () =>
      this.commercial.applyAdjustment(user, checkId, dto),
    );
  }

  @Post('checks/:checkId/adjustments/:id/void')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  voidAdjustment(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Param('id') id: string,
    @Body() dto: VoidCommercialMutationDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.adjustment.void', key, { checkId, id, ...dto }, () =>
      this.commercial.voidAdjustment(user, checkId, id, dto),
    );
  }

  @Post('checks/:checkId/service-charges')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  addServiceCharge(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Body() dto: AddServiceChargeDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.service-charge.add', key, { checkId, ...dto }, () =>
      this.commercial.addServiceCharge(user, checkId, dto),
    );
  }

  @Post('checks/:checkId/service-charges/:id/void')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  voidServiceCharge(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Param('id') id: string,
    @Body() dto: VoidCommercialMutationDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.service-charge.void', key, { checkId, id, ...dto }, () =>
      this.commercial.voidServiceCharge(user, checkId, id, dto),
    );
  }

  @Post('checks/:checkId/tips')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  addTip(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Body() dto: AddTipDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.tip.add', key, { checkId, ...dto }, () =>
      this.commercial.addTip(user, checkId, dto),
    );
  }

  @Post('checks/:checkId/tips/:id/void')
  @RequirePermissions(PERMISSIONS.CHECKOUT_WRITE)
  voidTip(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Param('id') id: string,
    @Body() dto: VoidCommercialMutationDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.tip.void', key, { checkId, id, ...dto }, () =>
      this.commercial.voidTip(user, checkId, id, dto),
    );
  }

  @Post('checks/:checkId/reopen')
  @RequirePermissions(PERMISSIONS.CHECKOUT_REOPEN)
  reopen(
    @CurrentUser() user: JwtAccessPayload,
    @Param('checkId') checkId: string,
    @Body() dto: ReopenGuestCheckDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.check.reopen', key, { checkId, ...dto }, () =>
      this.commercial.reopen(user, checkId, dto),
    );
  }

  @Post('orders/:orderId/complete')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  completeOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Param('orderId') orderId: string,
    @Body() dto: CompleteVenueOrderDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(user, 'commercial.order.complete', key, { orderId, ...dto }, () =>
      this.commercial.completeVenueOrder(user, orderId, dto),
    );
  }

  @Get('day-close/open-tab-guard')
  @RequirePermissions(PERMISSIONS.CASH_CLOSE)
  openTabGuard(@CurrentUser() user: JwtAccessPayload) {
    return this.commercial.openTabGuard(user);
  }
}
