import { NotFoundException } from '@nestjs/common';
import { GalleryService } from './gallery.service';

describe('GalleryService tenant-scoped mutations', () => {
  const audit = { record: jest.fn() };
  const notifications = {};
  const media = { deleteByMediaPath: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(prisma: Record<string, unknown>) {
    return new GalleryService(
      prisma as never,
      audit as never,
      notifications as never,
      media as never,
    );
  }

  it('updateItem uses shopId in update where', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'g_1', shopId: 'shop_a' });
    const findFirst = jest.fn().mockResolvedValue({
      id: 'g_1',
      shopId: 'shop_a',
      imageUrl: '/m/1',
    });
    const service = makeService({
      galleryItem: { findFirst, update },
    });

    await service.updateItem(actor, 'g_1', { caption: 'x' });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'g_1', shopId: 'shop_a' },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g_1', shopId: 'shop_a' },
      }),
    );
  });

  it('updateItem rejects Shop B item id for Shop A actor', async () => {
    const update = jest.fn();
    const service = makeService({
      galleryItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    });

    await expect(
      service.updateItem(actor, 'g_shop_b', { caption: 'hijack' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('deleteItem uses shopId in delete where', async () => {
    const del = jest.fn().mockResolvedValue({ id: 'g_1' });
    const service = makeService({
      galleryItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'g_1',
          shopId: 'shop_a',
          imageUrl: '/m/1',
        }),
        delete: del,
      },
    });

    await service.deleteItem(actor, 'g_1');

    expect(del).toHaveBeenCalledWith({
      where: { id: 'g_1', shopId: 'shop_a' },
    });
  });

  it('deleteItem rejects Shop B item id for Shop A actor', async () => {
    const del = jest.fn();
    const service = makeService({
      galleryItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: del,
      },
    });

    await expect(service.deleteItem(actor, 'g_shop_b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(del).not.toHaveBeenCalled();
    expect(media.deleteByMediaPath).not.toHaveBeenCalled();
  });
});
