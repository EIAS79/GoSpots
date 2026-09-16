import {
  ReservationStatus,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { ACTIVE_RESERVATION } from '../../common/booking-floor-status';
import { calendarDayInTimeZone } from '../../common/venue-timezone.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ReservationsScheduleService } from './reservations-schedule.service';

describe('ReservationsScheduleService', () => {
  it('shows completed unpaid bookings in the day schedule without blocking the resource', async () => {
    const timeZone = 'Europe/Warsaw';
    const now = new Date();
    const date = calendarDayInTimeZone(timeZone, now);
    const startsAt = new Date(now.getTime() - 30 * 60_000);
    const endsAt = new Date(now.getTime() + 30 * 60_000);

    const reservationFindMany = jest.fn().mockResolvedValue([
      {
        id: 'reservation-1',
        version: 1,
        resourceId: 'resource-1',
        guestName: 'Guest',
        guestEmail: null,
        guestPhone: null,
        partySize: 1,
        startsAt,
        endsAt,
        status: ReservationStatus.COMPLETED,
        notes: null,
        staffAlert: false,
        billedAt: null,
      },
    ]);

    const prisma = {
      shop: {
        findFirst: jest.fn().mockResolvedValue({ id: 'shop-1' }),
        findUnique: jest.fn().mockResolvedValue({
          locale: 'en',
          timezone: timeZone,
        }),
      },
      resourceCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-1',
            name: 'Bowling',
            type: ResourceType.BOWLING,
            slotMinutes: 60,
            bookingMode: null,
            offeringConfig: null,
            sortOrder: 0,
            resources: [
              {
                id: 'resource-1',
                name: 'Lane 1',
                status: ResourceStatus.AVAILABLE,
                capacity: 1,
                sortOrder: 0,
                section: null,
                tableGroup: null,
              },
            ],
            gamingSections: [],
          },
        ]),
      },
      reservation: {
        findMany: reservationFindMany,
      },
      playSession: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const service = new ReservationsScheduleService(prisma);
    const result = await service.getPublicSchedule(
      'test-venue',
      { date },
      'gaming',
    );

    expect(reservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { status: { in: ACTIVE_RESERVATION } },
            {
              status: ReservationStatus.COMPLETED,
              billedAt: null,
            },
          ],
        }),
      }),
    );
    expect(result.agenda).toHaveLength(1);
    expect(result.agenda[0]).toMatchObject({
      id: 'reservation-1',
      status: ReservationStatus.COMPLETED,
      awaitingPayment: true,
    });
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].units).toHaveLength(1);
    expect(result.categories[0].units[0].floorStatus).toBe('AVAILABLE');
  });
});
