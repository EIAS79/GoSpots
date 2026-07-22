import { NotFoundException } from '@nestjs/common';
import { ResourceStatus } from '@prisma/client';
import { ResourcesService } from './resources.service';

describe('ResourcesService tenant-scoped mutations', () => {
  const media = {
    deleteByMediaPath: jest.fn(),
    replaceMediaPath: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const notifications = { recordOperationsEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    perms: '*',
  } as never;

  const ownedCategory = {
    id: 'cat_1',
    shopId: 'shop_a',
    name: 'Pool tables',
    type: 'BILLIARD',
    description: null,
    slotMinutes: 60,
    bookingMode: 'SLOT',
    playstationGames: null,
    offeringConfig: null,
    sortOrder: 0,
    imageUrl: null,
    imageUrl2: null,
  };

  const ownedResource = {
    id: 'res_1',
    shopId: 'shop_a',
    categoryId: 'cat_1',
    name: 'Table 1',
    status: ResourceStatus.AVAILABLE,
    description: null,
    hourlyRate: null,
    sortOrder: 0,
    sectionId: null,
    capacity: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeService(prisma: Record<string, unknown>) {
    return new ResourcesService(
      prisma as never,
      media as never,
      audit as never,
      notifications as never,
    );
  }

  it('updateResource uses shopId in update where', async () => {
    const update = jest.fn().mockResolvedValue({
      ...ownedResource,
      name: 'Table A',
    });
    const findFirst = jest.fn().mockResolvedValue(ownedResource);
    const service = makeService({
      resource: { findFirst, update },
    });

    await service.updateResource(actor, 'res_1', { name: 'Table A' });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'res_1', shopId: 'shop_a' },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'res_1', shopId: 'shop_a' },
      }),
    );
  });

  it('updateResource rejects Shop B resource id for Shop A actor', async () => {
    const update = jest.fn();
    const service = makeService({
      resource: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    });

    await expect(
      service.updateResource(actor, 'res_shop_b', { name: 'Hijack' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('deleteResource uses shopId in delete where', async () => {
    const del = jest.fn().mockResolvedValue({ id: 'res_1' });
    const service = makeService({
      resource: {
        findFirst: jest.fn().mockResolvedValue(ownedResource),
        delete: del,
      },
    });

    await service.deleteResource(actor, 'res_1');

    expect(del).toHaveBeenCalledWith({
      where: { id: 'res_1', shopId: 'shop_a' },
    });
  });

  it('deleteResource rejects Shop B resource id for Shop A actor', async () => {
    const del = jest.fn();
    const service = makeService({
      resource: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: del,
      },
    });

    await expect(
      service.deleteResource(actor, 'res_shop_b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });

  it('updateCategory uses shopId in update where', async () => {
    const update = jest.fn().mockResolvedValue({ ...ownedCategory });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(ownedCategory)
      .mockResolvedValueOnce({
        ...ownedCategory,
        rates: [],
        gamingSections: [],
        resources: [],
      });
    const service = makeService({
      resourceCategory: { findFirst, update },
    });

    await service.updateCategory(actor, 'cat_1', { name: 'Snooker' });

    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'cat_1', shopId: 'shop_a' },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cat_1', shopId: 'shop_a' },
      }),
    );
  });

  it('updateCategory rejects Shop B category id for Shop A actor', async () => {
    const update = jest.fn();
    const service = makeService({
      resourceCategory: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
    });

    await expect(
      service.updateCategory(actor, 'cat_shop_b', { name: 'Hijack' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('deleteCategory uses shopId in delete where', async () => {
    const del = jest.fn().mockResolvedValue({ id: 'cat_1' });
    const service = makeService({
      resourceCategory: {
        findFirst: jest.fn().mockResolvedValue(ownedCategory),
        delete: del,
      },
    });

    await service.deleteCategory(actor, 'cat_1');

    expect(del).toHaveBeenCalledWith({
      where: { id: 'cat_1', shopId: 'shop_a' },
    });
  });

  it('deleteCategory rejects Shop B category id for Shop A actor', async () => {
    const del = jest.fn();
    const service = makeService({
      resourceCategory: {
        findFirst: jest.fn().mockResolvedValue(null),
        delete: del,
      },
    });

    await expect(
      service.deleteCategory(actor, 'cat_shop_b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });
});
