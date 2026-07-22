import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import {
  backfillLegacyEmptyAddOns,
  listLegacyEmptyAddonSubscriptions,
} from './pack-tier-backfill.util';
import { serializeAddOns, legacyAddOnsFromTier } from './venue-packs';

function makeDb(rows: Array<{
  id: string;
  shopId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  packId: string | null;
  addOnRows: { addOnId: string }[];
}>) {
  const store = rows.map((r) => ({ ...r, addOnRows: [...r.addOnRows] }));
  return {
    subscription: {
      findMany: jest.fn(async () =>
        store.filter(
          (r) =>
            (r.status === SubscriptionStatus.ACTIVE ||
              r.status === SubscriptionStatus.TRIAL) &&
            (r.tier === SubscriptionTier.STANDARD ||
              r.tier === SubscriptionTier.PRO ||
              r.tier === SubscriptionTier.ENTERPRISE),
        ),
      ),
      update: jest.fn(),
    },
    subscriptionAddOn: {
      deleteMany: jest.fn(async ({ where }: { where: { subscriptionId: string } }) => {
        const row = store.find((r) => r.id === where.subscriptionId);
        if (row) row.addOnRows = [];
      }),
      createMany: jest.fn(
        async ({
          data,
        }: {
          data: { subscriptionId: string; addOnId: string }[];
        }) => {
          for (const d of data) {
            const row = store.find((r) => r.id === d.subscriptionId);
            if (row) row.addOnRows.push({ addOnId: d.addOnId });
          }
        },
      ),
    },
    _store: store,
  };
}

describe('pack-tier-backfill.util', () => {
  it('lists only empty STANDARD+ ACTIVE/TRIAL', async () => {
    const db = makeDb([
      {
        id: 's1',
        shopId: 'a',
        tier: SubscriptionTier.PRO,
        status: SubscriptionStatus.ACTIVE,
        packId: 'gaming',
        addOnRows: [],
      },
      {
        id: 's2',
        shopId: 'b',
        tier: SubscriptionTier.STARTER,
        status: SubscriptionStatus.ACTIVE,
        packId: 'gaming',
        addOnRows: [],
      },
      {
        id: 's3',
        shopId: 'c',
        tier: SubscriptionTier.STANDARD,
        status: SubscriptionStatus.ACTIVE,
        packId: 'gaming',
        addOnRows: [{ addOnId: 'menu_orders' }],
      },
    ]);
    const list = await listLegacyEmptyAddonSubscriptions(db as never);
    expect(list.map((c) => c.id)).toEqual(['s1']);
    expect(list[0].proposedAddOns).toBe(
      serializeAddOns(legacyAddOnsFromTier('PRO')),
    );
  });

  it('dry-run counts without writes', async () => {
    const db = makeDb([
      {
        id: 's1',
        shopId: 'a',
        tier: SubscriptionTier.STANDARD,
        status: SubscriptionStatus.ACTIVE,
        packId: 'gaming',
        addOnRows: [],
      },
    ]);
    const result = await backfillLegacyEmptyAddOns(db as never, {
      dryRun: true,
    });
    expect(result).toEqual({ dryRun: true, candidates: 1 });
    expect(db.subscriptionAddOn.createMany).not.toHaveBeenCalled();
  });

  it('apply writes rows only', async () => {
    const db = makeDb([
      {
        id: 's1',
        shopId: 'a',
        tier: SubscriptionTier.PRO,
        status: SubscriptionStatus.ACTIVE,
        packId: 'gaming',
        addOnRows: [],
      },
    ]);
    const result = await backfillLegacyEmptyAddOns(db as never, {
      apply: true,
    });
    expect(result.dryRun).toBe(false);
    expect(result.updated).toBe(1);
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(db._store[0].addOnRows.map((r) => r.addOnId).sort()).toEqual(
      legacyAddOnsFromTier('PRO').slice().sort(),
    );
  });
});
