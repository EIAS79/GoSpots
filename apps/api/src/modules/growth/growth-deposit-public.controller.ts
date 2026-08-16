import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { GrowthDepositReconciliationService } from './growth-deposit-reconciliation.service';
import { GrowthPublicDepositService } from './growth-public-deposit.service';

@ApiTags('public-growth')
@Public()
@Controller('public/growth')
export class GrowthDepositPublicController {
  constructor(
    private readonly deposits: GrowthPublicDepositService,
    private readonly reconciliation: GrowthDepositReconciliationService,
  ) {}

  @Get(':slug/reservations/:reservationId/deposit')
  status(
    @Param('slug') slug: string,
    @Param('reservationId') reservationId: string,
    @Query('token') token: string,
  ) {
    return this.deposits.status(slug, reservationId, token);
  }

  @Post(':slug/reservations/:reservationId/deposit/checkout')
  createCheckout(
    @Param('slug') slug: string,
    @Param('reservationId') reservationId: string,
    @Body() dto: { token: string },
  ) {
    return this.deposits.createCheckout(slug, reservationId, dto.token);
  }

  @Post('reservation-deposits/reconcile')
  reconcile(@Body() dto: { sessionId: string }) {
    return this.reconciliation.reconcile(dto.sessionId);
  }
}
