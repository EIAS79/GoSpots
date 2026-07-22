import {
  buildDiningMirrorLabel,
  clampAvailableOnTotalChange,
  isResourceDiningDualWriteEnabled,
  seatingZoneFromSectionZone,
  upsertAdvisorySeatingForDiningGroup,
  deleteAdvisorySeatingForDiningGroup,
} from './resource-dining-dual-write.util';

describe('resource-dining-dual-write.util', () => {
  const prev = process.env.RESOURCE_DINING_DUAL_WRITE;

  afterEach(() => {
    if (prev === undefined) delete process.env.RESOURCE_DINING_DUAL_WRITE;
    else process.env.RESOURCE_DINING_DUAL_WRITE = prev;
  });

  describe('isResourceDiningDualWriteEnabled', () => {
    it('defaults on when unset', () => {
      delete process.env.RESOURCE_DINING_DUAL_WRITE;
      expect(isResourceDiningDualWriteEnabled()).toBe(true);
    });

    it('disables for off/0/false', () => {
      process.env.RESOURCE_DINING_DUAL_WRITE = 'off';
      expect(isResourceDiningDualWriteEnabled()).toBe(false);
      process.env.RESOURCE_DINING_DUAL_WRITE = '0';
      expect(isResourceDiningDualWriteEnabled()).toBe(false);
      process.env.RESOURCE_DINING_DUAL_WRITE = 'false';
      expect(isResourceDiningDualWriteEnabled()).toBe(false);
    });

    it('stays on for on/true/1', () => {
      process.env.RESOURCE_DINING_DUAL_WRITE = 'on';
      expect(isResourceDiningDualWriteEnabled()).toBe(true);
      process.env.RESOURCE_DINING_DUAL_WRITE = '1';
      expect(isResourceDiningDualWriteEnabled()).toBe(true);
    });
  });

  describe('pure helpers', () => {
    it('maps section zone to SeatingZone', () => {
      expect(seatingZoneFromSectionZone('OUTDOOR')).toBe('OUTDOOR');
      expect(seatingZoneFromSectionZone('outdoor')).toBe('OUTDOOR');
      expect(seatingZoneFromSectionZone(null)).toBe('INDOOR');
      expect(seatingZoneFromSectionZone('patio')).toBe('INDOOR');
    });

    it('clamps available when total shrinks; never invents free tables', () => {
      expect(clampAvailableOnTotalChange(5, 3)).toBe(3);
      expect(clampAvailableOnTotalChange(2, 8)).toBe(2);
      expect(clampAvailableOnTotalChange(-1, 4)).toBe(0);
    });

    it('builds mirror labels', () => {
      expect(buildDiningMirrorLabel('VIP 4-tops', 4)).toBe('VIP 4-tops');
      expect(buildDiningMirrorLabel(null, 2)).toBe('Table for 2');
      expect(buildDiningMirrorLabel('  ', 6)).toBe('Table for 6');
    });
  });

  describe('upsertAdvisorySeatingForDiningGroup', () => {
    it('no-ops when dual-write disabled', async () => {
      process.env.RESOURCE_DINING_DUAL_WRITE = 'off';
      const prisma = {
        seatingTableGroup: {
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      };
      const result = await upsertAdvisorySeatingForDiningGroup(prisma as never, {
        shopId: 's1',
        diningTableGroupId: 'g1',
        label: '4-seat',
        capacity: 4,
        totalCount: 3,
        floor: 1,
        zone: 'INDOOR',
      });
      expect(result).toBe('skipped');
      expect(prisma.seatingTableGroup.findFirst).not.toHaveBeenCalled();
    });

    it('creates advisory mirror with availableCount = totalCount', async () => {
      delete process.env.RESOURCE_DINING_DUAL_WRITE;
      const prisma = {
        seatingTableGroup: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 2 } }),
          create: jest.fn().mockResolvedValue({ id: 'seat-1' }),
          update: jest.fn(),
        },
      };
      const result = await upsertAdvisorySeatingForDiningGroup(prisma as never, {
        shopId: 's1',
        diningTableGroupId: 'g1',
        label: '4-seat table',
        capacity: 4,
        totalCount: 3,
        floor: 2,
        zone: 'OUTDOOR',
      });
      expect(result).toBe('created');
      expect(prisma.seatingTableGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          shopId: 's1',
          sourceDiningTableGroupId: 'g1',
          capacity: 4,
          totalCount: 3,
          availableCount: 3,
          isCustom: false,
          floor: 2,
          zone: 'OUTDOOR',
          sortOrder: 3,
        }),
      });
    });

    it('updates total and clamps available; does not reset free count upward', async () => {
      delete process.env.RESOURCE_DINING_DUAL_WRITE;
      const prisma = {
        seatingTableGroup: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'seat-1',
            availableCount: 1,
            totalCount: 4,
          }),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const result = await upsertAdvisorySeatingForDiningGroup(prisma as never, {
        shopId: 's1',
        diningTableGroupId: 'g1',
        label: '4-seat table',
        capacity: 4,
        totalCount: 2,
        floor: 1,
        zone: 'INDOOR',
      });
      expect(result).toBe('updated');
      expect(prisma.seatingTableGroup.update).toHaveBeenCalledWith({
        where: { id: 'seat-1' },
        data: expect.objectContaining({
          totalCount: 2,
          availableCount: 1,
          capacity: 4,
          isCustom: false,
        }),
      });
    });
  });

  describe('deleteAdvisorySeatingForDiningGroup', () => {
    it('deletes non-custom mirrors by source FK', async () => {
      delete process.env.RESOURCE_DINING_DUAL_WRITE;
      const prisma = {
        seatingTableGroup: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      await expect(
        deleteAdvisorySeatingForDiningGroup(prisma as never, 's1', 'g1'),
      ).resolves.toBe('deleted');
      expect(prisma.seatingTableGroup.deleteMany).toHaveBeenCalledWith({
        where: {
          shopId: 's1',
          sourceDiningTableGroupId: 'g1',
          isCustom: false,
        },
      });
    });
  });
});
