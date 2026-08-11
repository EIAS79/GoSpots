import { GrowthPrivacyService } from './growth-privacy.service';

function makeTx() {
  return {
    storedValueAccount: {
      findMany: jest.fn().mockResolvedValue([{ id: 'account-1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reviewVisitProof: {
      findMany: jest.fn().mockResolvedValue([{ id: 'proof-1' }]),
      update: jest.fn().mockResolvedValue({ id: 'proof-1' }),
    },
    customerIdentity: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    loyaltyLedgerEntry: {
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    storedValueLedgerEntry: {
      updateMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    customerMergeAudit: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    customerProfile: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

describe('GrowthPrivacyService', () => {
  it('redacts CRM identity/consent data while preserving financial rows', async () => {
    const tx = makeTx();
    const prisma: any = {
      customerProfile: {
        findMany: jest.fn().mockResolvedValue([{ id: 'customer-1' }]),
      },
      customerIdentity: {
        findMany: jest.fn().mockResolvedValue([{ customerId: 'customer-1' }]),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new GrowthPrivacyService(prisma);

    const result = await service.redactByEmail('shop-1', ' Person@Example.com ');

    expect(prisma.customerProfile.findMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', email: 'person@example.com' },
      select: { id: true },
    });
    expect(prisma.customerIdentity.findMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-1',
        kind: 'EMAIL',
        normalizedValue: 'person@example.com',
      },
      select: { customerId: true },
    });
    expect(tx.customerProfile.updateMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', id: { in: ['customer-1'] } },
      data: {
        name: '[redacted]',
        email: null,
        phone: null,
        marketingConsentAt: null,
        consentSource: null,
        notes: null,
      },
    });
    expect(tx.customerIdentity.deleteMany).toHaveBeenCalled();
    expect(tx.storedValueAccount.updateMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', customerId: { in: ['customer-1'] } },
      data: { customerId: null },
    });
    expect(tx.storedValueLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', accountId: { in: ['account-1'] } },
      data: { note: null },
    });
    expect(tx.reviewVisitProof.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proof-1' },
        data: expect.objectContaining({ reviewId: null }),
      }),
    );
    expect(result).toEqual({
      customers: 1,
      identitiesDeleted: 2,
      loyaltyNotesRedacted: 3,
      storedValueAccountsDetached: 1,
      storedValueNotesRedacted: 4,
      reviewProofsRevoked: 1,
      mergeReasonsRedacted: 1,
    });
  });

  it('does not open a write transaction when the email resolves to no growth customer', async () => {
    const prisma: any = {
      customerProfile: { findMany: jest.fn().mockResolvedValue([]) },
      customerIdentity: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new GrowthPrivacyService(prisma);

    const result = await service.redactByEmail('shop-1', 'nobody@example.com');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.customers).toBe(0);
    expect(result.identitiesDeleted).toBe(0);
  });

  it('redacts every growth customer during an account-level shop wipe', async () => {
    const tx = makeTx();
    tx.reviewVisitProof.findMany.mockResolvedValue([]);
    tx.storedValueAccount.findMany.mockResolvedValue([]);
    tx.storedValueAccount.updateMany.mockResolvedValue({ count: 0 });
    tx.storedValueLedgerEntry.updateMany.mockResolvedValue({ count: 0 });
    tx.customerProfile.updateMany.mockResolvedValue({ count: 2 });

    const prisma: any = {
      customerProfile: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'customer-1' }, { id: 'customer-2' }]),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new GrowthPrivacyService(prisma);

    const result = await service.redactAllForShop('shop-1');

    expect(tx.customerProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId: 'shop-1',
          id: { in: ['customer-1', 'customer-2'] },
        },
      }),
    );
    expect(result.customers).toBe(2);
  });
});
