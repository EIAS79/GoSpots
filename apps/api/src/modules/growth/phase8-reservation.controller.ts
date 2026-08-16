import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  Phase8ReservationService,
  type RefundReservationDepositDto,
} from './phase8-reservation.service';

@ApiTags('growth-phase8')
@Controller('growth/reservations')
@UseGuards(JwtAuthGuard)
export class Phase8ReservationController {
  constructor(private readonly phase8: Phase8ReservationService) {}

  @Post(':id/arrival')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  arrive(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.phase8.arrive(user, id);
  }

  @Post(':id/deposit-refunds')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  refundDeposit(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: RefundReservationDepositDto,
  ) {
    return this.phase8.refundProviderDeposit(user, id, dto);
  }
}
