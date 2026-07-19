import { ReservationStatus } from '@prisma/client';

import { usesSessionLifecycle } from './dining-reservation.util';



const GUEST_CANCELLABLE: ReservationStatus[] = [

  ReservationStatus.PENDING,

  ReservationStatus.CONFIRMED,

];



/** Whether a guest may cancel their own online booking. */

export function canGuestCancelReservation(

  status: ReservationStatus,

  startsAt: Date,

  resourceType: string | null | undefined,

  now: Date = new Date(),

): boolean {

  if (!GUEST_CANCELLABLE.includes(status)) return false;



  if (usesSessionLifecycle(resourceType)) {

    return true;

  }



  return startsAt > now;

}

