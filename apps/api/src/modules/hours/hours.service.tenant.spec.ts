import { HoursService } from './hours.service';

describe('HoursService tenant-scoped mutations', () => {
  const audit = { record: jest.fn() };
  const notifications = {};

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updateException uses shopId in update where', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'ex_1',
      shopId: 'shop_a',
      date: '2026-07-20',
    });
    const prisma = {
      scheduleException: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ex_1',
          shopId: 'shop_a',
          date: '2026-07-20',
          isClosed: true,
          opensAt: null,
          closesAt: null,
          label: null,
        }),
        update,
      },
    };
    const service = new HoursService(
      prisma as never,
      audit as never,
      notifications as never,
    );

    await service.updateException(actor, 'ex_1', {});

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ex_1', shopId: 'shop_a' },
      }),
    );
  });

  it('deleteException uses shopId in delete where', async () => {
    const del = jest.fn().mockResolvedValue({ id: 'ex_1' });
    const prisma = {
      scheduleException: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ex_1',
          shopId: 'shop_a',
          date: '2026-07-20',
        }),
        delete: del,
      },
    };
    const service = new HoursService(
      prisma as never,
      audit as never,
      notifications as never,
    );

    await service.deleteException(actor, 'ex_1');

    expect(del).toHaveBeenCalledWith({
      where: { id: 'ex_1', shopId: 'shop_a' },
    });
  });
});
