import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MenuModule } from '../menu/menu.module';
import { ResourcesModule } from '../resources/resources.module';
import { StaffApprovalsController } from './staff-approvals.controller';
import { StaffApprovalsService } from './staff-approvals.service';

@Module({
  imports: [NotificationsModule, MenuModule, ResourcesModule],
  controllers: [StaffApprovalsController],
  providers: [StaffApprovalsService],
})
export class StaffApprovalsModule {}
