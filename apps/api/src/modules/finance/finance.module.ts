import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinanceController } from './finance.controller';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';
import { ShopLossService } from './shop-loss.service';

@Module({
  imports: [NotificationsModule],
  controllers: [FinanceController],
  providers: [FinanceReportsService, ShopLossService, FinanceService],
})
export class FinanceModule {}
