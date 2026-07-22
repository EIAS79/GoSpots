import {
  GDPR_RETENTION_CRON_LOCK_KEY1,
  GDPR_RETENTION_CRON_LOCK_KEY2,
  MAIL_OUTBOX_CRON_LOCK_KEY1,
  MAIL_OUTBOX_CRON_LOCK_KEY2,
  RESERVATION_REMINDERS_CRON_LOCK_KEY1,
  RESERVATION_REMINDERS_CRON_LOCK_KEY2,
  withGdprRetentionCronLock,
  withMailOutboxCronLock,
  withPgAdvisoryXactLock,
  withReservationRemindersCronLock,
} from './pg-advisory-lock.util';

describe('pg-advisory-lock.util', () => {
  it('runs work when pg_try_advisory_xact_lock returns true', async () => {
    const order: string[] = [];
    const tx = {
      $queryRaw: jest.fn(async () => {
        order.push('lock');
        return [{ acquired: true }];
      }),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        order.push('txn');
        return fn(tx);
      }),
    };

    const outcome = await withPgAdvisoryXactLock(
      prisma as never,
      1,
      2,
      async () => {
        order.push('work');
        return 'ok';
      },
    );

    expect(outcome).toEqual({ acquired: true, result: 'ok' });
    expect(order).toEqual(['txn', 'lock', 'work']);
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('skips work when lock is not acquired', async () => {
    const work = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: false }]),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const outcome = await withPgAdvisoryXactLock(
      prisma as never,
      1,
      2,
      work,
    );

    expect(outcome).toEqual({ acquired: false });
    expect(work).not.toHaveBeenCalled();
  });

  it('withReservationRemindersCronLock uses fixed GS/RM key pair', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    await withReservationRemindersCronLock(prisma as never, async () => 1);

    expect(RESERVATION_REMINDERS_CRON_LOCK_KEY1).toBe(0x4753);
    expect(RESERVATION_REMINDERS_CRON_LOCK_KEY2).toBe(0x524d);
    // Tagged template includes the two keys as Prisma values.
    expect(tx.$queryRaw).toHaveBeenCalled();
    const call = tx.$queryRaw.mock.calls[0];
    expect(call[0]).toEqual(
      expect.arrayContaining([
        expect.stringContaining('pg_try_advisory_xact_lock'),
      ]),
    );
    expect(call).toEqual(
      expect.arrayContaining([
        RESERVATION_REMINDERS_CRON_LOCK_KEY1,
        RESERVATION_REMINDERS_CRON_LOCK_KEY2,
      ]),
    );
  });

  it('withMailOutboxCronLock uses fixed GS/MO key pair', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    await withMailOutboxCronLock(prisma as never, async () => 1);

    expect(MAIL_OUTBOX_CRON_LOCK_KEY1).toBe(0x4753);
    expect(MAIL_OUTBOX_CRON_LOCK_KEY2).toBe(0x4d4f);
    const call = tx.$queryRaw.mock.calls[0];
    expect(call).toEqual(
      expect.arrayContaining([
        MAIL_OUTBOX_CRON_LOCK_KEY1,
        MAIL_OUTBOX_CRON_LOCK_KEY2,
      ]),
    );
  });

  it('uses distinct GDPR retention lock keys', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    await withGdprRetentionCronLock(prisma as never, async () => 1);

    expect(GDPR_RETENTION_CRON_LOCK_KEY1).toBe(0x4753);
    expect(GDPR_RETENTION_CRON_LOCK_KEY2).toBe(0x4744);
    expect(GDPR_RETENTION_CRON_LOCK_KEY2).not.toBe(MAIL_OUTBOX_CRON_LOCK_KEY2);
    const call = tx.$queryRaw.mock.calls[0];
    expect(call).toEqual(
      expect.arrayContaining([
        GDPR_RETENTION_CRON_LOCK_KEY1,
        GDPR_RETENTION_CRON_LOCK_KEY2,
      ]),
    );
  });

  it('passes timeout options through to $transaction', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (t: { $queryRaw: jest.Mock }) => Promise<unknown>) =>
        fn({ $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]) }),
      ),
    };

    await withPgAdvisoryXactLock(
      prisma as never,
      1,
      2,
      async () => undefined,
      { timeout: 12_000, maxWait: 3_000 },
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 12_000, maxWait: 3_000 }),
    );
  });
});
