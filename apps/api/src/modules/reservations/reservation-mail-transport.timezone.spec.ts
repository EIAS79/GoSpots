import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { MailService } from '../mail/mail.service';
import { ReservationsPublicService } from './reservations-public.service';
import { ReservationsStaffService } from './reservations-staff.service';

type SentMail = { to: string; subject: string; html: string; text: string };
type Confirmation = {
  guestName: string;
  guestEmail: string;
  venueName: string;
  venueSlug: string;
  categoryName: string;
  unitName: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  timeZone: string;
  statusPath: string;
  isDining: boolean;
};
type Sender = {
  sendGuestReservationMail: (
    input: Confirmation,
    kind: 'confirmed',
  ) => Promise<unknown>;
};

describe('T-003 actual public/staff notification transport contract', () => {
  const previousTZ = process.env.TZ;
  afterAll(() => {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  });

  function services() {
    const send = jest.fn().mockResolvedValue({ accepted: true });
    const mail = { send } as unknown as MailService;
    const config = {
      get: jest.fn((name: string) =>
        name === 'WEB_APP_URL' ? 'https://gospots.example' : undefined,
      ),
    } as unknown as ConfigService;
    const p = {} as PrismaService;
    const a = {} as AuditService;
    const n = {} as NotificationsService;
    return {
      send,
      publicService: new ReservationsPublicService(
        p,
        a,
        n,
        mail,
        config,
      ) as unknown as Sender,
      staffService: new ReservationsStaffService(
        p,
        a,
        n,
        mail,
        config,
      ) as unknown as Sender,
    };
  }

  function confirmation(startsAt: string, endsAt: string): Confirmation {
    return {
      guestName: 'Booking Guest',
      guestEmail: 'guest@example.com',
      venueName: 'Warsaw Venue',
      venueSlug: 'warsaw-venue',
      categoryName: 'Gaming',
      unitName: 'Table 1',
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      timeZone: 'Europe/Warsaw',
      status: 'CONFIRMED',
      statusPath: '/v/warsaw-venue/reservation/status?token=demo',
      isDining: false,
    };
  }

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])(
    'public and staff send matching confirmed venue-local mail when API TZ=%s',
    async (hostTimezone) => {
      process.env.TZ = hostTimezone;
      const { send, publicService, staffService } = services();
      const input = confirmation(
        '2026-06-01T23:30:00Z',
        '2026-06-02T00:30:00Z',
      );
      await publicService.sendGuestReservationMail(input, 'confirmed');
      await staffService.sendGuestReservationMail(input, 'confirmed');
      expect(send).toHaveBeenCalledTimes(2);
      const calls = send.mock.calls as unknown as Array<[SentMail]>;
      const publicMessage = calls[0][0];
      const staffMessage = calls[1][0];
      expect(publicMessage).toEqual(staffMessage);
      expect(publicMessage.to).toBe('guest@example.com');
      expect(publicMessage.text).toContain('Tuesday, June 2, 2026');
      expect(publicMessage.text).toContain('GMT+2 (Europe/Warsaw)');
      expect(publicMessage.html).toContain('Europe/Warsaw');
      expect(publicMessage.text).toContain('https://gospots.example/');
    },
  );

  it('the autumn repeated hour carries both offsets in actual outbound text', async () => {
    process.env.TZ = 'UTC';
    const { send, publicService } = services();
    await publicService.sendGuestReservationMail(
      confirmation('2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z'),
      'confirmed',
    );
    const message = (send.mock.calls as unknown as Array<[SentMail]>)[0][0];
    expect(message.text).toContain('2:30 AM GMT+2');
    expect(message.text).toContain('2:30 AM GMT+1');
    expect(message.html).toContain('Europe/Warsaw');
  });
});
