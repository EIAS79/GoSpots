import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import type { MailOutboxService } from './mail-outbox.service';
import {
  buildReservationEmail,
  reservationEmailSubject,
} from './gaming-reservation-mail';

/**
 * End-to-end mail adapter serialization via a disposable loopback HTTP sink.
 * GoSpots delivers through Resend HTTPS, not SMTP. No internet requests, real
 * email addresses, staging secrets or actual Resend credentials are involved.
 */
describe('W1 booking mail transport to an isolated Resend-compatible sink', () => {
  const received: Array<Record<string, unknown>> = [];
  const server = createServer((req, res) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (part: Uint8Array) => chunks.push(part));
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/emails') {
        res.writeHead(404).end();
        return;
      }
      const payload = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      ) as Record<string, unknown>;
      received.push(payload);
      if (payload.subject === 'SIMULATE_SINK_FAILURE') {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('isolated sink unavailable');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"id":"local-sink-test-message"}');
    });
  });
  let sinkUrl: string;
  let fetchSpy: jest.SpyInstance;
  const markSent = jest.fn().mockResolvedValue(undefined);
  const markFailed = jest.fn().mockResolvedValue(undefined);
  const enqueue = jest.fn().mockResolvedValue({ id: 'local-outbox-id' });

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    sinkUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/emails`;
    const realFetch = globalThis.fetch.bind(globalThis);
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url, init) => {
        if (url !== 'https://api.resend.com/emails') {
          throw new Error(
            'Local sink blocked an unexpected external HTTP request',
          );
        }
        return realFetch(sinkUrl, init);
      });
  });
  afterAll(async () => {
    fetchSpy.mockRestore();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it.each([
    [
      'confirmed',
      '2026-10-25T00:30:00Z',
      '2026-10-25T01:30:00Z',
      'GMT+2',
      'GMT+1',
    ],
    [
      'canceled',
      '2026-03-29T00:30:00Z',
      '2026-03-29T01:30:00Z',
      'GMT+1',
      'GMT+2',
    ],
    [
      'updated',
      '2026-06-01T23:30:00Z',
      '2026-06-02T00:30:00Z',
      'GMT+2',
      'Europe/Warsaw',
    ],
  ] as const)(
    'transmits %s event with venue-local DST-correct subject, text and HTML',
    async (kind, startsAt, endsAt, firstOffset, secondOffset) => {
      const config = {
        get: jest.fn(
          (key: string) =>
            ({
              RESEND_API_KEY: 'w1-fake-loopback-only',
              MAIL_FROM: 'transport@tests.invalid',
              MAIL_FROM_NAME: 'GoSpots W1',
              NODE_ENV: 'test',
            })[
              key as
                | 'RESEND_API_KEY'
                | 'MAIL_FROM'
                | 'MAIL_FROM_NAME'
                | 'NODE_ENV'
            ],
        ),
      } as unknown as ConfigService;
      const outbox = {
        enqueue,
        markSent,
        markFailed,
        markSkipped: jest.fn(),
      } as unknown as MailOutboxService;
      const service = new MailService(config, outbox);
      const details = {
        guestName: 'Local Recipient',
        venueName: 'Warsaw Test Venue',
        categoryName: 'Gaming',
        unitName: 'Table 1',
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        timeZone: 'Europe/Warsaw',
        status: kind === 'canceled' ? 'CANCELED' : 'CONFIRMED',
        isDining: false,
      };
      const message = {
        ...buildReservationEmail(details, kind),
        subject: reservationEmailSubject(details.venueName, kind),
      };
      const before = received.length;
      expect(
        await service.send({
          to: 'sink@example.invalid',
          ...message,
          required: true,
          shopId: 'shop-a',
        }),
      ).toEqual({ sent: true });
      expect(received).toHaveLength(before + 1);
      const payload = received.at(-1)!;
      expect(payload).toMatchObject({
        subject: message.subject,
        html: message.html,
        text: message.text,
        to: ['sink@example.invalid'],
        from: 'GoSpots W1 <transport@tests.invalid>',
      });
      expect(payload.text).toContain(firstOffset);
      expect(payload.text).toContain(secondOffset);
      expect(payload.html).toContain('Europe/Warsaw');
      expect(markSent).toHaveBeenCalledTimes(1);
      expect(markFailed).not.toHaveBeenCalled();
    },
  );
  it('persists failure status and propagates a failed transport for retry, without contacting Resend', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'RESEND_API_KEY' ? 'w1-fake-loopback-only' : 'test',
      ),
    } as unknown as ConfigService;
    const outbox = {
      enqueue,
      markSent,
      markFailed,
      markSkipped: jest.fn(),
    } as unknown as MailOutboxService;
    const service = new MailService(config, outbox);
    await expect(
      service.send({
        to: 'sink@example.invalid',
        subject: 'SIMULATE_SINK_FAILURE',
        text: 'local test',
        html: '<p>local test</p>',
        required: true,
        shopId: 'shop-b',
      }),
    ).rejects.toThrow('Resend API 503');
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markSent).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'shop-b', to: 'sink@example.invalid' }),
    );
  });
});
