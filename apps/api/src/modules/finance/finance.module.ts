import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [NotificationsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
