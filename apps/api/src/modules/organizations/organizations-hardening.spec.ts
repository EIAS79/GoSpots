import { OrganizationAccessMode, OrganizationRole, ShopRole } from '@prisma/client';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService hardening', () => {
  const actor = { sub: 'owner-1', shopId: 'shop-1', shopRole: ShopRole.OWNER } as any;

  it('uses the private dashboard key as the operational venue path', async () => {
    const prisma: any = {
      organizationMembership: {
        findMany: jest.fn().mockResolvedValue([{
          role: OrganizationRole.OWNER,
          accessMode: OrganizationAccessMode.ALL_SHOPS,
          createdAt: new Date(),
          organization: {
            id: 'org-1', name: 'Group', slug: 'group',
            shops: [{ shopId: 'shop-1', displayName: null, sharedCatalogEnabled: false, inheritedSettings: null, overrideSettings: null }],
          },
        }]),
      },
      shop: { findMany: jest.fn().mockResolvedValue([{
        id: 'shop-1', name: 'Venue', slug: 'public-slug', dashboardKey: 'private-dashboard-key', currency: 'PLN', timezone: 'Europe/Warsaw',
      }]) },
      membership: { findMany: jest.fn().mockResolvedValue([{ shopId: 'shop-1', role: ShopRole.OWNER }]) },
    };
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
    const service = new OrganizationsService(prisma, flags, { record: jest.fn() } as any);
    const result = await service.list(actor);
    expect(result.organizations[0].shops[0].venuePath).toBe('private-dashboard-key');
  });

  it('audits organization venue configuration mutations', async () => {
    const prisma: any = {
      organizationMembership: { findUnique: jest.fn().mockResolvedValue({ role: OrganizationRole.ADMIN }) },
      organizationShop: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1', shopId: 'shop-1' }),
        update: jest.fn().mockResolvedValue({ organizationId: 'org-1', shopId: 'shop-1', sharedCatalogEnabled: true }),
      },
    };
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new OrganizationsService(prisma, flags, audit);
    await service.updateShop(actor, 'org-1', 'shop-1', { sharedCatalogEnabled: true });
    expect(audit.record).toHaveBeenCalledWith(actor, expect.objectContaining({
      action: 'organization.shop_updated',
      meta: expect.objectContaining({ organizationId: 'org-1', shopId: 'shop-1' }),
    }));
  });
});
