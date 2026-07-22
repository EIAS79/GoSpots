import { MailOutboxProcessor } from './mail-outbox.processor';
import { MailOutboxService } from './mail-outbox.service';
import { MailService } from './mail.service';

describe('MailOutboxProcessor', () => {
  it('processDue delivers due rows and marks sent', async () => {
    const prisma = {
      mailOutbox: {
        findMany: jest.fn().mockResolvedValue([{ id: 'r1' }]),
      },
    };
    const outbox = {
      getPayload: jest.fn().mockResolvedValue({
        to: 'a@b.co',
        subject: 'Hi',
        html: '<p>x</p>',
        text: 'x',
      }),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn(),
      markSkipped: jest.fn(),
    };
    const mail = {
      deliverPayload: jest.fn().mockResolvedValue({ sent: true }),
    };

    const processor = new MailOutboxProcessor(
      prisma as never,
      outbox as unknown as MailOutboxService,
      mail as unknown as MailService,
    );

    const n = await processor.processDue(10);
    expect(n).toBe(1);
    expect(mail.deliverPayload).toHaveBeenCalled();
    expect(outbox.markSent).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ to: 'a@b.co' }),
    );
  });

  it('processDue marks failed when deliver throws', async () => {
    const prisma = {
      mailOutbox: {
        findMany: jest.fn().mockResolvedValue([{ id: 'r2' }]),
      },
    };
    const outbox = {
      getPayload: jest.fn().mockResolvedValue({
        to: 'a@b.co',
        subject: 'Hi',
        html: 'h',
        text: 't',
      }),
      markSent: jest.fn(),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markSkipped: jest.fn(),
    };
    const mail = {
      deliverPayload: jest.fn().mockRejectedValue(new Error('Resend down')),
    };

    const processor = new MailOutboxProcessor(
      prisma as never,
      outbox as unknown as MailOutboxService,
      mail as unknown as MailService,
    );

    const n = await processor.processDue(5);
    expect(n).toBe(1);
    expect(outbox.markFailed).toHaveBeenCalledWith(
      'r2',
      expect.any(Error),
      expect.objectContaining({ to: 'a@b.co' }),
    );
  });

  it('processDue marks failed on invalid payload', async () => {
    const prisma = {
      mailOutbox: {
        findMany: jest.fn().mockResolvedValue([{ id: 'bad' }]),
      },
    };
    const outbox = {
      getPayload: jest.fn().mockResolvedValue(null),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markSent: jest.fn(),
      markSkipped: jest.fn(),
    };
    const mail = { deliverPayload: jest.fn() };

    const processor = new MailOutboxProcessor(
      prisma as never,
      outbox as unknown as MailOutboxService,
      mail as unknown as MailService,
    );

    await processor.processDue(1);
    expect(outbox.markFailed).toHaveBeenCalled();
    expect(mail.deliverPayload).not.toHaveBeenCalled();
  });
});
