import { NotFoundException } from '@nestjs/common';
import { MenuService } from './menu.service';

describe('MenuService tenant-scoped mutations', () => {
  const audit = { record: jest.fn() };
  const media = { deleteByMediaPath: jest.fn() };
  const notifications = { recordOperationsEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    perms: '*',
  } as never;

  const ownedItem = {
    id: 'mi_1',
    shopId: 'shop_a',
    name: 'Fries',
    price: 5,
    stock: 10,
    trackStock: false,
    imageUrl: null,
    imageUrl2: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(prisma: Record<string, unknown>) {
    return new MenuService(
      prisma as never,
      audit as never,
      media as never,
      notifications as never,
    );
  }

  it('updateItem uses shopId in update where', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'mi_1', shopId: 'shop_a' });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(ownedItem)
      .mockResolvedValueOnce({
        ...ownedItem,
        tags: [],
      });
    const prisma = {
      menuItem: { findFirst, update },
    };
    const service = makeService(prisma);

    await service.updateItem(actor, 'mi_1', { name: 'Loaded fries' });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'mi_1', shopId: 'shop_a' },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mi_1', shopId: 'shop_a' },
      }),
    );
  });

  it('updateItem rejects Shop B item id for Shop A actor', async () => {
    const update = jest.fn();
    const prisma = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    };
    const service = makeService(prisma);

    await expect(
      service.updateItem(actor, 'mi_shop_b', { name: 'Hijack' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('deleteItem uses shopId in delete where', async () => {
    const del = jest.fn().mockResolvedValue({ id: 'mi_1' });
    const prisma = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue(ownedItem),
        delete: del,
      },
    };
    const service = makeService(prisma);

    await service.deleteItem(actor, 'mi_1');

    expect(del).toHaveBeenCalledWith({
      where: { id: 'mi_1', shopId: 'shop_a' },
    });
  });

  it('deleteItem rejects Shop B item id for Shop A actor', async () => {
    const del = jest.fn();
    const prisma = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: del,
      },
    };
    const service = makeService(prisma);

    await expect(service.deleteItem(actor, 'mi_shop_b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(del).not.toHaveBeenCalled();
    expect(media.deleteByMediaPath).not.toHaveBeenCalled();
  });
});
