import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Phase10AccountabilityController } from './phase10-accountability.controller';
import { Phase10AccountabilityInterceptor } from './phase10-accountability.interceptor';
import { Phase10AccountabilityService } from './phase10-accountability.service';
import { Phase10ClockInRestrictionInterceptor } from './phase10-clockin-restriction.interceptor';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [WorkforceController, Phase10AccountabilityController],
  providers: [
    WorkforceService,
    Phase10AccountabilityService,
    {
      provide: APP_INTERCEPTOR,
      useClass: Phase10ClockInRestrictionInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: Phase10AccountabilityInterceptor,
    },
  ],
  exports: [WorkforceService, Phase10AccountabilityService],
})
export class WorkforceModule {}