import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinanceController } from './finance.controller';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { FinanceTransactionService } from './finance-transaction.service';
import { ShopLossService } from './shop-loss.service';
import { ShopOrderService } from './shop-order.service';
import { PlayBillingService } from './play-billing.service';
import { PlaySessionService } from './play-session.service';
import { PlaySessionLifecycleService } from './play-session-lifecycle.service';

@Module({
  imports: [NotificationsModule],
  controllers: [FinanceController],
  providers: [
    FinanceReportsService,
    ShopLossService,
    FinanceTransactionService,
    ShopOrderService,
    PlayBillingService,
    PlaySessionService,
    PlaySessionLifecycleService,
    FinanceService,
  ],
  exports: [PlayBillingService],
})
export class FinanceModule {}
