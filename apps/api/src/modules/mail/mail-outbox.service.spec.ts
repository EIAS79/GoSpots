import { MailOutboxService } from './mail-outbox.service';
import {
  MAIL_OUTBOX_MAX_ATTEMPTS,
  MAIL_OUTBOX_SYNC_GRACE_MS,
  mailOutboxBackoffMs,
} from './mail-outbox.types';

function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    mailOutbox: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      ...((overrides.mailOutbox as object) ?? {}),
    },
    ...overrides,
  };
}

describe('mailOutboxBackoffMs', () => {
  it('grows then caps', () => {
    expect(mailOutboxBackoffMs(1)).toBe(60_000);
    expect(mailOutboxBackoffMs(2)).toBe(5 * 60_000);
    expect(mailOutboxBackoffMs(5)).toBe(6 * 60 * 60_000);
    expect(mailOutboxBackoffMs(99)).toBe(6 * 60 * 60_000);
  });
});

describe('MailOutboxService (durable)', () => {
  it('enqueue persists PENDING with sync grace and payload (no bodies in ring)', async () => {
    const created = { id: 'out_1' };
    const prisma = mockPrisma({
      mailOutbox: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
        update: jest.fn(),
      },
    });
    const outbox = new MailOutboxService(prisma as never);

    const before = Date.now();
    const { id } = await outbox.enqueue({
      to: 'Guest@Example.com',
      subject: 'Hello',
      html: '<p>secret</p>',
      text: 'secret',
      required: true,
    });
    expect(id).toBe('out_1');

    const createArg = prisma.mailOutbox.create.mock.calls[0][0];
    expect(createArg.data.status).toBe('PENDING');
    expect(createArg.data.attempts).toBe(0);
    expect(createArg.data.payload).toMatchObject({
      to: 'guest@example.com',
      subject: 'Hello',
      html: '<p>secret</p>',
      text: 'secret',
      required: true,
    });
    const next = createArg.data.nextAttemptAt as Date;
    expect(next.getTime()).toBeGreaterThanOrEqual(
      before + MAIL_OUTBOX_SYNC_GRACE_MS - 50,
    );

    const recent = outbox.recent();
    expect(recent[0]).toMatchObject({
      id: 'out_1',
      status: 'attempt',
      intent: { to: 'guest@example.com', subject: 'Hello', required: true },
    });
    expect(JSON.stringify(recent)).not.toContain('secret');
  });

  it('enqueue returns existing id on idempotencyKey hit', async () => {
    const prisma = mockPrisma({
      mailOutbox: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const outbox = new MailOutboxService(prisma as never);
    const { id } = await outbox.enqueue({
      to: 'a@b.co',
      subject: 'X',
      html: 'h',
      text: 't',
      idempotencyKey: 'k1',
    });
    expect(id).toBe('existing');
    expect(prisma.mailOutbox.create).not.toHaveBeenCalled();
  });

  it('markFailed schedules backoff then DEAD at max attempts', async () => {
    const prisma = mockPrisma({
      mailOutbox: {
        findUnique: jest.fn().mockResolvedValue({ attempts: 0 }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const outbox = new MailOutboxService(prisma as never);
    await outbox.markFailed('id1', new Error('Resend API 500: boom'), {
      to: 'a@b.co',
      subject: 'X',
    });

    const first = prisma.mailOutbox.update.mock.calls[0][0];
    expect(first.data.status).toBe('FAILED');
    expect(first.data.attempts).toBe(1);
    expect(first.data.lastError).toContain('Resend API 500');

    prisma.mailOutbox.findUnique.mockResolvedValue({
      attempts: MAIL_OUTBOX_MAX_ATTEMPTS - 1,
    });
    await outbox.markFailed('id1', new Error('again'));
    const last = prisma.mailOutbox.update.mock.calls[1][0];
    expect(last.data.status).toBe('DEAD');
    expect(last.data.attempts).toBe(MAIL_OUTBOX_MAX_ATTEMPTS);
  });

  it('markSent updates DB status', async () => {
    const prisma = mockPrisma({
      mailOutbox: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const outbox = new MailOutboxService(prisma as never);
    await outbox.markSent('id1', { to: 'a@b.co', subject: 'Hi' });
    expect(prisma.mailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'id1' },
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('statusCounts maps groupBy rows', async () => {
    const prisma = mockPrisma({
      mailOutbox: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'DEAD', _count: { _all: 2 } },
          { status: 'FAILED', _count: { _all: 1 } },
          { status: 'SENT', _count: { _all: 9 } },
        ]),
      },
    });
    const outbox = new MailOutboxService(prisma as never);
    const counts = await outbox.statusCounts('shop_a');
    expect(prisma.mailOutbox.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['status'],
        where: { shopId: 'shop_a' },
      }),
    );
    expect(counts).toEqual({
      PENDING: 0,
      SENT: 9,
      FAILED: 1,
      DEAD: 2,
      SKIPPED: 0,
    });
  });

  it('listDeadLetters returns sanitized rows (no html/text)', async () => {
    const prisma = mockPrisma({
      mailOutbox: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dead_1',
            shopId: 'shop_a',
            status: 'DEAD',
            attempts: 8,
            lastError: 'Resend 500',
            nextAttemptAt: new Date('2026-07-21T00:00:00Z'),
            createdAt: new Date('2026-07-20T00:00:00Z'),
            updatedAt: new Date('2026-07-21T00:00:00Z'),
            sentAt: null,
            payload: {
              to: 'guest@ex.com',
              subject: 'Booking',
              html: '<p>secret</p>',
              text: 'secret',
              required: true,
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    });
    const outbox = new MailOutboxService(prisma as never);
    const { items, total } = await outbox.listDeadLetters({
      shopId: 'shop_a',
    });
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({
      id: 'dead_1',
      to: 'guest@ex.com',
      subject: 'Booking',
      required: true,
      status: 'DEAD',
      attempts: 8,
      lastError: 'Resend 500',
    });
    expect(JSON.stringify(items)).not.toContain('secret');
    expect(prisma.mailOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['DEAD'] }, shopId: 'shop_a' },
      }),
    );
  });

  it('requeueDeadLetter resets DEAD → PENDING with shop scope', async () => {
    const existing = {
      id: 'dead_1',
      shopId: 'shop_a',
      status: 'DEAD',
      attempts: 8,
      lastError: 'boom',
      nextAttemptAt: new Date('2026-07-21T00:00:00Z'),
      createdAt: new Date('2026-07-20T00:00:00Z'),
      updatedAt: new Date('2026-07-21T00:00:00Z'),
      sentAt: null,
      payload: { to: 'a@b.co', subject: 'X', html: 'h', text: 't' },
    };
    const updated = {
      ...existing,
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date('2026-07-21T12:00:00Z'),
    };
    const prisma = mockPrisma({
      mailOutbox: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
    });
    const outbox = new MailOutboxService(prisma as never);
    const row = await outbox.requeueDeadLetter('dead_1', {
      shopId: 'shop_a',
    });
    expect(prisma.mailOutbox.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dead_1', status: 'DEAD', shopId: 'shop_a' },
      }),
    );
    expect(prisma.mailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dead_1' },
        data: expect.objectContaining({
          status: 'PENDING',
          attempts: 0,
        }),
      }),
    );
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(0);
    expect(row.to).toBe('a@b.co');
  });

  it('requeueDeadLetter NotFound when missing or wrong shop', async () => {
    const prisma = mockPrisma({
      mailOutbox: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    });
    const outbox = new MailOutboxService(prisma as never);
    await expect(
      outbox.requeueDeadLetter('other', { shopId: 'shop_a' }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.mailOutbox.update).not.toHaveBeenCalled();
  });

  it('systemOnly scopes statusCounts / list / requeue to shopId null', async () => {
    const prisma = mockPrisma({
      mailOutbox: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'DEAD', _count: { _all: 1 } },
        ]),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({
          id: 'sys_1',
          shopId: null,
          status: 'DEAD',
          attempts: 8,
          lastError: 'boom',
          nextAttemptAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          sentAt: null,
          payload: { to: 'a@b.co', subject: 'Hi', required: true },
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'sys_1',
            shopId: null,
            status: data.status,
            attempts: data.attempts,
            lastError: 'boom',
            nextAttemptAt: data.nextAttemptAt,
            createdAt: new Date(),
            updatedAt: new Date(),
            sentAt: null,
            payload: { to: 'a@b.co', subject: 'Hi', required: true },
          }),
        ),
      },
    });
    const outbox = new MailOutboxService(prisma as never);

    await outbox.statusCounts(null, { systemOnly: true });
    expect(prisma.mailOutbox.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: null } }),
    );

    await outbox.listDeadLetters({ systemOnly: true });
    expect(prisma.mailOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['DEAD'] }, shopId: null },
      }),
    );

    const row = await outbox.requeueDeadLetter('sys_1', { systemOnly: true });
    expect(prisma.mailOutbox.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sys_1', status: 'DEAD', shopId: null },
      }),
    );
    expect(row.status).toBe('PENDING');
    expect(row.shopId).toBeNull();
  });

  it('purgeSentRows deletes SENT rows older than cutoff in batches', async () => {
    const cutoff = new Date('2026-04-23T00:00:00.000Z');
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'old1' }, { id: 'old2' }])
      .mockResolvedValueOnce([]);
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = mockPrisma({
      mailOutbox: { findMany, deleteMany },
    });
    const outbox = new MailOutboxService(prisma as never);

    const result = await outbox.purgeSentRows({
      olderThanDays: 90,
      now: new Date('2026-07-22T00:00:00.000Z'),
    });

    expect(result.deleted).toBe(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'SENT',
          sentAt: { lt: cutoff },
        },
      }),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old1', 'old2'] } },
    });
  });
});
