import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventRequestsController } from './event-requests.controller';
import { EventRequestsService } from './event-requests.service';
import { ReservationRemindersService } from './reservation-reminders.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsPublicService } from './reservations-public.service';
import { ReservationsScheduleService } from './reservations-schedule.service';
import { ReservationsStaffService } from './reservations-staff.service';
import { ReservationsService } from './reservations.service';
import { SeatingTablesController } from './seating-tables.controller';
import { SeatingTablesService } from './seating-tables.service';

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [
    ReservationsController,
    SeatingTablesController,
    EventRequestsController,
  ],
  providers: [
    ReservationsPublicService,
    ReservationsScheduleService,
    ReservationsStaffService,
    ReservationsService,
    SeatingTablesService,
    EventRequestsService,
    ReservationRemindersService,
  ],
  exports: [EventRequestsService, ReservationsService],
})
export class ReservationsModule {}
