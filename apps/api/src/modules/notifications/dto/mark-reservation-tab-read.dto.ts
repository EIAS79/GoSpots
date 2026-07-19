import { IsIn } from 'class-validator';
import type { ReservationNotificationTab } from '../../../common/reservation-notification-href';

const TABS: ReservationNotificationTab[] = ['dining', 'schedule', 'events'];

export class MarkReservationTabReadDto {
  @IsIn(TABS)
  tab!: ReservationNotificationTab;
}
