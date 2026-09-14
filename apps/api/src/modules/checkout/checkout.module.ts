import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CashModule } from '../cash/cash.module';
import { DevicePaymentModule } from '../device-payment/device-payment.module';
import { CheckoutController } from './checkout.controller';
import { ProviderCheckoutPaymentController } from './provider-checkout-payment.controller';
import { CommercialCoreController } from './commercial-core.controller';
import { CheckoutService } from './checkout.service';
import { ChargeCalculatorService } from './charge-calculator.service';
import { SettlementStateService } from './settlement-state.service';
import { PaymentAllocationService } from './payment-allocation.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { ProviderCheckoutPaymentService } from './provider-checkout-payment.service';
import { GuestCheckMergeService } from './guest-check-merge.service';
import { CommercialMergeService } from './commercial-merge.service';
import { CommercialSettlementService } from './commercial-settlement.service';
import { CommercialCoreService } from './commercial-core.service';
import { CommercialDayCloseService } from './commercial-day-close.service';

@Module({
  imports: [FinanceModule, CashModule, DevicePaymentModule],
  controllers: [
    CheckoutController,
    ProviderCheckoutPaymentController,
    CommercialCoreController,
  ],
  providers: [
    CheckoutService,
    ChargeCalculatorService,
    SettlementStateService,
    PaymentAllocationService,
    CheckoutPaymentService,
    ProviderCheckoutPaymentService,
    GuestCheckMergeService,
    CommercialMergeService,
    CommercialSettlementService,
    CommercialCoreService,
    CommercialDayCloseService,
  ],
  exports: [
    CheckoutService,
    ChargeCalculatorService,
    SettlementStateService,
    PaymentAllocationService,
    CheckoutPaymentService,
    ProviderCheckoutPaymentService,
    GuestCheckMergeService,
    CommercialMergeService,
    CommercialSettlementService,
    CommercialCoreService,
    CommercialDayCloseService,
  ],
})
export class CheckoutModule {}
