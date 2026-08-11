import { ForbiddenException } from '@nestjs/common';
import { OrganizationRole, ShopRole } from '@prisma/client';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService security', () => {
  const actor = {
    sub: 'user-a',
    sysRole: 'USER',
    email: 'a@example.com',
    shopId: 'shop-a',
    shopRole: ShopRole.OWNER,
    perms: '*',
  } as any;

  function setup() {
    const prisma: any = {
      organizationMembership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      organizationShop: { findMany: jest.fn(), findUnique: jest.fn() },
      ledgerEntry: { groupBy: jest.fn() },
      shop: { findMany: jest.fn() },
      membership: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
    const audit = { record: jest.fn() } as any;
    return { prisma, service: new OrganizationsService(prisma, flags, audit) };
  }

  it('does not read another organization analytics without membership', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue(null);

    await expect(service.groupAnalytics(actor, 'org-b')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.ledgerEntry.groupBy).not.toHaveBeenCalled();
  });

  it('allows an explicit organization member to resolve only direct shops', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue({
      id: 'om-1',
      organizationId: 'org-a',
      userId: actor.sub,
      role: OrganizationRole.ANALYST,
      accessMode: 'EXPLICIT',
    });
    prisma.organizationShop.findMany.mockResolvedValue([
      { shopId: 'shop-a' },
      { shopId: 'shop-b' },
    ]);
    prisma.membership.findMany.mockResolvedValue([{ shopId: 'shop-a' }]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([]);
    prisma.shop.findMany.mockResolvedValue([
      { id: 'shop-a', name: 'A', currency: 'PLN' },
    ]);

    const result = await service.groupAnalytics(actor, 'org-a');
    expect(prisma.ledgerEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: { in: ['shop-a'] } }),
      }),
    );
    expect(result.shops).toHaveLength(1);
  });
});
