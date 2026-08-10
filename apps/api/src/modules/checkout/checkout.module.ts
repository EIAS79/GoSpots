import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ChargeCalculatorService } from './charge-calculator.service';
import { SettlementStateService } from './settlement-state.service';
import { PaymentAllocationService } from './payment-allocation.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { GuestCheckMergeService } from './guest-check-merge.service';

@Module({
  imports: [FinanceModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    ChargeCalculatorService,
    SettlementStateService,
    PaymentAllocationService,
    CheckoutPaymentService,
    GuestCheckMergeService,
  ],
  exports: [
    CheckoutService,
    ChargeCalculatorService,
    SettlementStateService,
    PaymentAllocationService,
    CheckoutPaymentService,
    GuestCheckMergeService,
  ],
})
export class CheckoutModule {}
