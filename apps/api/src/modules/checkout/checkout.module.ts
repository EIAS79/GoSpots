import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ChargeCalculatorService } from './charge-calculator.service';
import { SettlementStateService } from './settlement-state.service';

@Module({
  imports: [FinanceModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, ChargeCalculatorService, SettlementStateService],
  exports: [CheckoutService, ChargeCalculatorService, SettlementStateService],
})
export class CheckoutModule {}
