import { AuditService } from './audit.service';

jest.mock('../../common/resolve-venue-shop', () => ({
  resolveVenueShopId: jest.fn().mockResolvedValue('shop_a'),
}));

describe('AuditService tenant-scoped mutations', () => {
  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('remove uses shopId in delete where', async () => {
    const del = jest.fn().mockResolvedValue({ id: 'a_1' });
    const prisma = {
      auditLog: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'a_1',
          shopId: 'shop_a',
        }),
        delete: del,
      },
    };
    const service = new AuditService(prisma as never);

    await service.remove(actor, 'a_1');

    expect(del).toHaveBeenCalledWith({
      where: { id: 'a_1', shopId: 'shop_a' },
    });
  });
});
