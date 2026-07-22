import { SeatingTablesService } from './seating-tables.service';

/** Parallel-agent entitlements gate — keep tenant-scope assertions focused. */
jest.mock('../../common/venue-entitlements', () => ({
  assertShopHasFeature: jest.fn().mockResolvedValue(undefined),
}));

describe('SeatingTablesService tenant-scoped mutations', () => {
  const audit = { record: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    perms: '*',
  } as never;

  const existing = {
    id: 'st_1',
    shopId: 'shop_a',
    label: 'Table for 4',
    capacity: 4,
    totalCount: 2,
    availableCount: 1,
    note: null,
    zone: 'INDOOR',
    floor: 1,
    sortOrder: 0,
    eventStartsAt: null,
    eventEndsAt: null,
    isCustom: true,
    sourceDiningTableGroupId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('update uses shopId in update where', async () => {
    const update = jest.fn().mockResolvedValue({ ...existing, label: 'Patio' });
    const prisma = {
      shop: { findUnique: jest.fn().mockResolvedValue({ floorCount: 2 }) },
      resourceCategory: { findFirst: jest.fn().mockResolvedValue(null) },
      seatingTableGroup: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update,
      },
    };
    const service = new SeatingTablesService(prisma as never, audit as never);

    await service.update(actor, 'st_1', { label: 'Patio' });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'st_1', shopId: 'shop_a' },
      }),
    );
  });

  it('delete uses shopId in delete where', async () => {
    const del = jest.fn().mockResolvedValue({ id: 'st_1' });
    const prisma = {
      resourceCategory: { findFirst: jest.fn().mockResolvedValue(null) },
      seatingTableGroup: {
        findFirst: jest.fn().mockResolvedValue(existing),
        delete: del,
      },
    };
    const service = new SeatingTablesService(prisma as never, audit as never);

    await service.delete(actor, 'st_1');

    expect(del).toHaveBeenCalledWith({
      where: { id: 'st_1', shopId: 'shop_a' },
    });
  });
});
