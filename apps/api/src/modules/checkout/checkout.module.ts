import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CashModule } from '../cash/cash.module';
import { CheckoutController } from './checkout.controller';
import { CommercialCoreController } from './commercial-core.controller';
import { CheckoutService } from './checkout.service';
import { ChargeCalculatorService } from './charge-calculator.service';
import { SettlementStateService } from './settlement-state.service';
import { PaymentAllocationService } from './payment-allocation.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { GuestCheckMergeService } from './guest-check-merge.service';
import { CommercialMergeService } from './commercial-merge.service';
import { CommercialSettlementService } from './commercial-settlement.service';
import { CommercialCoreService } from './commercial-core.service';

@Module({
  imports: [FinanceModule, CashModule],
  controllers: [CheckoutController, CommercialCoreController],
  providers: [
    CheckoutService,
    ChargeCalculatorService,
    SettlementStateService,
    PaymentAllocationService,
    CheckoutPaymentService,
    GuestCheckMergeService,
    CommercialMergeService,
    CommercialSettlementService,
    CommercialCoreService,
  ],
  exports: [
    CheckoutService,
    ChargeCalculatorService,
    SettlementStateService,
    PaymentAllocationService,
    CheckoutPaymentService,
    GuestCheckMergeService,
    CommercialMergeService,
    CommercialSettlementService,
    CommercialCoreService,
  ],
})
export class CheckoutModule {}
