import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HoursController } from './hours.controller';
import { HoursService } from './hours.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [HoursController],
  providers: [HoursService],
})
export class HoursModule {}
