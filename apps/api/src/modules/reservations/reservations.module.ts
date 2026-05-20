import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReservationRemindersService } from "./reservation-reminders.service";
import { ReservationsController } from "./reservations.controller";
import { ReservationsService } from "./reservations.service";
import { SeatingTablesController } from "./seating-tables.controller";
import { SeatingTablesService } from "./seating-tables.service";

@Module({
  imports: [NotificationsModule],
  controllers: [ReservationsController, SeatingTablesController],
  providers: [
    ReservationsService,
    SeatingTablesService,
    ReservationRemindersService,
  ],
})
export class ReservationsModule {}
