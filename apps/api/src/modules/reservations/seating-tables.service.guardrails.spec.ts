import { BadRequestException } from '@nestjs/common';

import { SEATING_MANUAL_EDIT_DENIED_MESSAGE } from '../../common/resource-dining-seating-guard.util';
import { SeatingTablesService } from './seating-tables.service';

jest.mock('../../common/venue-entitlements', () => ({
  assertShopHasFeature: jest.fn().mockResolvedValue(undefined),
}));

describe('SeatingTablesService Phase 3 guardrails', () => {
  const audit = { record: jest.fn() };

  const actor = {
    sub: 'user_1',
    shopId: 'shop_a',
    shopRole: 'OWNER',
    perms: '*',
  } as never;

  const mirrorRow = {
    id: 'st_mirror',
    shopId: 'shop_a',
    label: 'Table for 4',
    capacity: 4,
    totalCount: 3,
    availableCount: 2,
    note: null,
    zone: 'INDOOR',
    floor: 1,
    sortOrder: 0,
    eventStartsAt: null,
    eventEndsAt: null,
    isCustom: false,
    sourceDiningTableGroupId: 'dtg_1',
  };

  const loungeRow = {
    ...mirrorRow,
    id: 'st_lounge',
    sourceDiningTableGroupId: null,
  };

  const customRow = {
    ...mirrorRow,
    id: 'st_custom',
    isCustom: true,
    sourceDiningTableGroupId: null,
    eventStartsAt: new Date('2026-08-01T18:00:00Z'),
    eventEndsAt: new Date('2026-08-01T22:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makePrisma(opts: {
    shopHasDining?: boolean;
    findFirstResult?: typeof mirrorRow;
  }) {
    return {
      shop: { findUnique: jest.fn().mockResolvedValue({ floorCount: 2 }) },
      resourceCategory: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.shopHasDining ? { id: 'cat_dining' } : null),
      },
      seatingTableGroup: {
        findFirst: jest.fn().mockResolvedValue(opts.findFirstResult ?? null),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
        create: jest.fn().mockResolvedValue(mirrorRow),
        update: jest.fn().mockResolvedValue(mirrorRow),
        delete: jest.fn().mockResolvedValue({ id: mirrorRow.id }),
      },
      diningTableGroup: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dtg_1' }),
      },
    };
  }

  it('denies update of linked advisory mirror', async () => {
    const prisma = makePrisma({
      shopHasDining: true,
      findFirstResult: mirrorRow,
    });
    const service = new SeatingTablesService(prisma as never, audit as never);

    await expect(
      service.update(actor, mirrorRow.id, { availableCount: 1 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update(actor, mirrorRow.id, { availableCount: 1 }),
    ).rejects.toThrow(SEATING_MANUAL_EDIT_DENIED_MESSAGE);
    expect(prisma.seatingTableGroup.update).not.toHaveBeenCalled();
  });

  it('denies delete of non-custom row when shop has DINING layout', async () => {
    const prisma = makePrisma({
      shopHasDining: true,
      findFirstResult: loungeRow,
    });
    const service = new SeatingTablesService(prisma as never, audit as never);

    await expect(service.delete(actor, loungeRow.id)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.seatingTableGroup.delete).not.toHaveBeenCalled();
  });

  it('denies create of non-custom group when shop has DINING layout', async () => {
    const prisma = makePrisma({ shopHasDining: true });
    const service = new SeatingTablesService(prisma as never, audit as never);

    await expect(
      service.create(actor, {
        capacity: 4,
        totalCount: 2,
      }),
    ).rejects.toThrow(SEATING_MANUAL_EDIT_DENIED_MESSAGE);
    expect(prisma.seatingTableGroup.create).not.toHaveBeenCalled();
  });

  it('allows create of isCustom event floor block when shop has DINING layout', async () => {
    const prisma = makePrisma({ shopHasDining: true });
    prisma.seatingTableGroup.create.mockResolvedValue(customRow);
    const service = new SeatingTablesService(prisma as never, audit as never);

    await service.create(actor, {
      capacity: 8,
      totalCount: 1,
      isCustom: true,
      eventStartsAt: '2026-08-01T18:00:00.000Z',
      eventEndsAt: '2026-08-01T22:00:00.000Z',
    });

    expect(prisma.seatingTableGroup.create).toHaveBeenCalled();
  });

  it('allows update of isCustom event floor block when shop has DINING layout', async () => {
    const prisma = makePrisma({
      shopHasDining: true,
      findFirstResult: customRow,
    });
    prisma.seatingTableGroup.update.mockResolvedValue({
      ...customRow,
      availableCount: 0,
    });
    const service = new SeatingTablesService(prisma as never, audit as never);

    await service.update(actor, customRow.id, { availableCount: 0 });

    expect(prisma.seatingTableGroup.update).toHaveBeenCalled();
  });

  it('allows non-custom lounge counter when shop has no DINING layout', async () => {
    const prisma = makePrisma({
      shopHasDining: false,
      findFirstResult: loungeRow,
    });
    prisma.seatingTableGroup.update.mockResolvedValue({
      ...loungeRow,
      availableCount: 1,
    });
    const service = new SeatingTablesService(prisma as never, audit as never);

    await service.update(actor, loungeRow.id, { availableCount: 1 });

    expect(prisma.seatingTableGroup.update).toHaveBeenCalled();
  });
});
