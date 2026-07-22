import { MenuService } from './menu.service';

jest.mock('../../common/shop-venue-time.util', () => ({
  loadShopVenueTimeContext: jest.fn().mockResolvedValue({
    locale: 'en',
    timezone: 'UTC',
    resolvedTimeZone: 'UTC',
  }),
}));

jest.mock('../../common/menu-stock-db.util', () => ({
  resetShopMenuStockForDay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/menu-section-image.util', () => ({
  sectionImageUrlsByShop: jest.fn().mockResolvedValue(new Map()),
}));

describe('MenuService getFullMenu (§35 Phase 3)', () => {
  const audit = { record: jest.fn() };
  const media = { deleteByMediaPath: jest.fn() };
  const notifications = { recordOperationsEvent: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    perms: '*',
  } as never;

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

  it('applies shop-scoped take caps on sections, tags, and items', async () => {
    const sectionFindMany = jest.fn().mockResolvedValue([]);
    const tagFindMany = jest.fn().mockResolvedValue([]);
    const itemFindMany = jest.fn().mockResolvedValue([]);
    const service = makeService({
      menuSection: { findMany: sectionFindMany },
      shopTag: { findMany: tagFindMany },
      menuItem: { findMany: itemFindMany },
    });

    await service.getFullMenu(actor);

    expect(sectionFindMany).toHaveBeenCalledWith({
      where: { shopId: 'shop_a' },
      orderBy: { sortOrder: 'asc' },
      take: MenuService.MENU_SECTION_TAKE,
    });
    expect(tagFindMany).toHaveBeenCalledWith({
      where: { shopId: 'shop_a' },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
      take: MenuService.MENU_TAG_TAKE,
    });
    expect(itemFindMany).toHaveBeenCalledWith({
      where: { shopId: 'shop_a' },
      include: { tags: { include: { tag: true } } },
      orderBy: { name: 'asc' },
      take: MenuService.MENU_ITEM_TAKE,
    });
  });

  it('warns when menu items hit the take cap', async () => {
    const cap = MenuService.MENU_ITEM_TAKE;
    const cappedItems = Array.from({ length: cap }, (_, i) => ({
      id: `mi-${i}`,
      shopId: 'shop_a',
      name: `Item ${i}`,
      price: 10,
      stock: 5,
      tags: [],
    }));
    const service = makeService({
      menuSection: { findMany: jest.fn().mockResolvedValue([]) },
      shopTag: { findMany: jest.fn().mockResolvedValue([]) },
      menuItem: { findMany: jest.fn().mockResolvedValue(cappedItems) },
    });
    const warnSpy = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await service.getFullMenu(actor);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Menu items hit take cap'),
    );
    warnSpy.mockRestore();
  });
});
