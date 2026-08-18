import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Phase10AccountabilityController } from './phase10-accountability.controller';
import { Phase10AccountabilityInterceptor } from './phase10-accountability.interceptor';
import { Phase10AccountabilityService } from './phase10-accountability.service';
import { Phase10ClockInRestrictionInterceptor } from './phase10-clockin-restriction.interceptor';
import { Phase10PerformanceService } from './phase10-performance.service';
import { Phase10ScheduleConflictInterceptor } from './phase10-schedule-conflict.interceptor';
import { Phase10ScheduleService } from './phase10-schedule.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [WorkforceController, Phase10AccountabilityController],
  providers: [
    WorkforceService,
    Phase10AccountabilityService,
    Phase10PerformanceService,
    Phase10ScheduleService,
    {
      provide: APP_INTERCEPTOR,
      useClass: Phase10ScheduleConflictInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: Phase10ClockInRestrictionInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: Phase10AccountabilityInterceptor,
    },
  ],
  exports: [
    WorkforceService,
    Phase10AccountabilityService,
    Phase10PerformanceService,
    Phase10ScheduleService,
  ],
})
export class WorkforceModule {}