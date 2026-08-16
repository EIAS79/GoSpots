import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { RunFinancialReconciliationDto, UpdateOfflinePaymentPolicyDto } from './dto/money-operations.dto';
import { MoneyOperationsService } from './money-operations.service';

@ApiTags('money-operations')
@Controller('money-operations')
@UseGuards(JwtAuthGuard)
export class MoneyOperationsController {
  constructor(private readonly money: MoneyOperationsService) {}

  @Get('providers/:provider/readiness')
  providerReadiness(@CurrentUser() user: JwtAccessPayload, @Param('provider') provider: string) {
    return this.money.providerReadiness(user, provider);
  }

  @Get('offline-payment-policy')
  getOfflinePaymentPolicy(@CurrentUser() user: JwtAccessPayload) {
    return this.money.getOfflinePolicy(user);
  }

  @Put('offline-payment-policy')
  updateOfflinePaymentPolicy(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateOfflinePaymentPolicyDto,
  ) {
    return this.money.updateOfflinePolicy(user, dto);
  }

  @Get('offline-payment-policy/evaluate')
  evaluateOfflinePayment(
    @CurrentUser() user: JwtAccessPayload,
    @Query('provider') provider: string,
    @Query('amount') amount: string,
  ) {
    return this.money.evaluateOfflineCollection(user, provider, amount);
  }

  @Post('reconciliation/runs')
  runFinancialReconciliation(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: RunFinancialReconciliationDto,
  ) {
    return this.money.runFinancialReconciliation(user, dto);
  }

  @Get('reconciliation/runs/:id')
  getRun(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.money.getReconciliationRun(user, id);
  }

  @Get('reconciliation/issues')
  listIssues(@CurrentUser() user: JwtAccessPayload) {
    return this.money.listOpenReconciliationIssues(user);
  }
}
