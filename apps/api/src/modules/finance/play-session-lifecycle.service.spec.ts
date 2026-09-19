import { PlaySessionLifecycleService } from './play-session-lifecycle.service';

describe('PlaySessionLifecycleService', () => {
  const at = new Date('2026-09-19T10:00:00.000Z');

  function makeService(input: {
    rows: Array<{
      id: string;
      shopId: string;
      label: string | null;
      startedAt: Date;
      durationMinutes: number | null;
      completedAt: Date | null;
      resource: { name: string } | null;
    }>;
    claimCount?: number;
    warningExists?: boolean;
  }) {
    const prisma = {
      playSession: {
        findMany: jest.fn().mockResolvedValue(input.rows),
        updateMany: jest.fn().mockResolvedValue({ count: input.claimCount ?? 1 }),
      },
      notification: {
        findFirst: jest
          .fn()
          .mockResolvedValue(input.warningExists ? { id: 'notification-1' } : null),
      },
    };
    const notifications = {
      recordFinanceEvent: jest.fn().mockResolvedValue({}),
    };
    const audit = {
      recordForShop: jest.fn().mockResolvedValue({}),
    };
    const service = new PlaySessionLifecycleService(
      prisma as never,
      notifications as never,
      audit as never,
    );
    return { service, prisma, notifications, audit };
  }

  it('auto-ends an expired timed walk-in at its planned end and sends it to payment', async () => {
    const startedAt = new Date('2026-09-19T08:30:00.000Z');
    const ctx = makeService({
      rows: [
        {
          id: 'session-1',
          shopId: 'shop-1',
          label: 'Sandy',
          startedAt,
          durationMinutes: 60,
          completedAt: null,
          resource: { name: 'Table 01' },
        },
      ],
    });

    await expect(ctx.service.runOnce(at)).resolves.toEqual({
      autoEnded: 1,
      warnings: 0,
    });
    expect(ctx.prisma.playSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'session-1',
          durationMinutes: 60,
          endedAt: null,
        }),
        data: { endedAt: new Date('2026-09-19T09:30:00.000Z') },
      }),
    );
    expect(ctx.notifications.recordFinanceEvent).toHaveBeenCalledWith(
      'shop-1',
      expect.objectContaining({
        href: '/play-billing?tab=awaiting_payment',
        dedupeKey: 'walkin_awaiting_session-1',
      }),
    );
  });

  it('warns once when a timed walk-in is within five minutes of ending', async () => {
    const ctx = makeService({
      rows: [
        {
          id: 'session-2',
          shopId: 'shop-1',
          label: 'Marco',
          startedAt: new Date('2026-09-19T09:05:00.000Z'),
          durationMinutes: 60,
          completedAt: null,
          resource: { name: 'Table 02' },
        },
      ],
    });

    await expect(ctx.service.runOnce(at)).resolves.toEqual({
      autoEnded: 0,
      warnings: 1,
    });
    expect(ctx.prisma.playSession.updateMany).not.toHaveBeenCalled();
    expect(ctx.notifications.recordFinanceEvent).toHaveBeenCalledWith(
      'shop-1',
      expect.objectContaining({
        title: 'Session ending in 5 minutes',
        href: '/play-billing?tab=in_progress',
        dedupeKey:
          'walkin_end_warning:session-2:2026-09-19T10:05:00.000Z',
      }),
    );
  });

  it('does not repeat an existing end warning', async () => {
    const ctx = makeService({
      warningExists: true,
      rows: [
        {
          id: 'session-3',
          shopId: 'shop-1',
          label: 'Lana',
          startedAt: new Date('2026-09-19T09:05:00.000Z'),
          durationMinutes: 60,
          completedAt: null,
          resource: null,
        },
      ],
    });

    await expect(ctx.service.runOnce(at)).resolves.toEqual({
      autoEnded: 0,
      warnings: 0,
    });
    expect(ctx.notifications.recordFinanceEvent).not.toHaveBeenCalled();
  });
});
