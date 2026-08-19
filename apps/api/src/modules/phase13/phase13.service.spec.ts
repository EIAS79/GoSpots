import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataImportKind, DataImportStatus, OrganizationRole } from '@prisma/client';
import { clearIdempotencyMemoryCache } from '../../common/idempotency.util';
import { parseCsv, Phase13Service } from './phase13.service';

describe('Phase13 CSV validation', () => {
  it('parses quoted commas and escaped quotes deterministically', () => {
    expect(parseCsv('name,price\n"Club, Large",12.50\n"Say ""Hi""",4')).toEqual([
      { name: 'Club, Large', price: '12.50' },
      { name: 'Say "Hi"', price: '4' },
    ]);
  });

  it('rejects malformed row widths before persistence', () => {
    expect(() => parseCsv('name,price\nOne,10,extra')).toThrow(/expected 2/);
  });
});

describe('Phase13 service security and replay rules', () => {
  const actor = {
    sub: 'user-a', sysRole: 'USER', email: 'owner@example.com', shopId: 'shop-a', shopRole: 'OWNER', perms: '*',
  } as any;

  beforeEach(() => clearIdempotencyMemoryCache());

  function setup() {
    const prisma: any = {
      organizationMembership: { findUnique: jest.fn() },
      organizationShop: { count: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      organizationInventoryTransfer: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      stockItem: { findFirst: jest.fn(), findMany: jest.fn() },
      inventoryLocation: { findFirst: jest.fn(), findMany: jest.fn() },
      supplier: { findFirst: jest.fn() },
      purchaseOrder: { groupBy: jest.fn() },
      shop: { findMany: jest.fn(), findUnique: jest.fn() },
      device: { findMany: jest.fn(), count: jest.fn() },
      subscription: { findUnique: jest.fn(), update: jest.fn() },
      shopFeatureFlag: { findUnique: jest.fn(), upsert: jest.fn() },
      dataImportJob: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
      webhookEndpoint: { findFirst: jest.fn(), update: jest.fn() },
      webhookDelivery: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
      membership: { count: jest.fn() },
      integrationJob: { count: jest.fn() },
      idempotencyReceipt: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(),
    };
    const flags = { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as any;
    const audit = { record: jest.fn().mockResolvedValue({}), recordForShop: jest.fn().mockResolvedValue({}) } as any;
    const secretBox = { encrypt: jest.fn() } as any;
    return { prisma, service: new Phase13Service(prisma, audit, flags, secretBox) };
  }

  it('rejects cross-organization work before reading inventory', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue(null);
    await expect(service.createTransfer(actor, 'org-foreign', {
      sourceShopId: 'shop-a', destinationShopId: 'shop-b', sourceStockItemId: 'item-a', destinationStockItemId: 'item-b',
      sourceLocationId: 'loc-a', destinationLocationId: 'loc-b', quantityMilli: 1000, idempotencyKey: 'idem-0001',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.stockItem.findFirst).not.toHaveBeenCalled();
  });

  it('uses canonical idempotency to reject the same key with a changed request', async () => {
    const { prisma, service } = setup();
    prisma.organizationMembership.findUnique.mockResolvedValue({ role: OrganizationRole.OWNER });
    prisma.organizationShop.count.mockResolvedValue(2);
    prisma.idempotencyReceipt.findUnique.mockResolvedValue({
      status: 'COMPLETED', requestHash: 'different-request-hash', responseJson: '{"id":"old"}',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.createTransfer(actor, 'org-a', {
      sourceShopId: 'shop-a', destinationShopId: 'shop-b', sourceStockItemId: 'item-a', destinationStockItemId: 'item-b',
      sourceLocationId: 'loc-a', destinationLocationId: 'loc-b', quantityMilli: 1000, idempotencyKey: 'idem-0001',
    })).rejects.toThrow('Idempotency-Key reused with a different request payload');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents system admin from bypassing provider-managed subscription lifecycle', async () => {
    const { prisma, service } = setup();
    const systemActor = { ...actor, sysRole: 'SUPER_ADMIN' } as any;
    prisma.subscription.findUnique.mockResolvedValue({ billingSubscriptionId: 'bill-sub-1' });
    await expect(service.updateSystemSubscription(systemActor, 'shop-a', { status: 'PAUSED' as any })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('stores invalid import preview as rejected and never calls commit logic', async () => {
    const { prisma, service } = setup();
    prisma.dataImportJob.findUnique.mockResolvedValue(null);
    prisma.dataImportJob.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'job-1', ...data }));
    const result: any = await service.previewImport(actor, { kind: DataImportKind.PRODUCTS, csv: 'name,price\nBroken,not-a-number' });
    expect(result.status).toBe(DataImportStatus.REJECTED);
    expect(result.preview.valid).toBe(false);
  });

  it('does not replay a webhook delivery that already succeeded', async () => {
    const { prisma, service } = setup();
    prisma.webhookDelivery.findFirst.mockResolvedValue({ id: 'delivery-1', status: 'SUCCEEDED' });
    await expect(service.replayWebhookDelivery(actor, 'delivery-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.webhookDelivery.update).not.toHaveBeenCalled();
  });
});
