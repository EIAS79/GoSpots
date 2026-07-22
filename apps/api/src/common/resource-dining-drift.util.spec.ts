import {
  BOOKABLE_DINING_MUTATION_SURFACES,
  RESOURCE_DINING_DUAL_WRITE_SURFACES,
  SEATING_COUNT_MUTATION_SURFACES,
  SEATING_MANUAL_EDIT_GUARD_SURFACES,
  bucketKeyString,
  computeDriftRows,
  diningCountsFromRows,
  mergeInventoryBuckets,
  normalizeDriftZone,
  publicDiningBookMutatesSeatingAvailableCount,
  seatingTotalsFromRows,
} from './resource-dining-drift.util';

describe('resource-dining-drift.util', () => {
  describe('Phase 0 Option C contract', () => {
    it('locks: public dining book does not mutate seating availableCount', () => {
      expect(publicDiningBookMutatesSeatingAvailableCount()).toBe(false);
    });

    it('documents disjoint mutator surfaces (bookable vs advisory)', () => {
      const seating = new Set<string>(SEATING_COUNT_MUTATION_SURFACES);
      const bookable = new Set<string>(BOOKABLE_DINING_MUTATION_SURFACES);
      for (const s of seating) {
        expect(bookable.has(s)).toBe(false);
      }
      expect(BOOKABLE_DINING_MUTATION_SURFACES).toContain(
        'ReservationsService.createPublicGamingBooking.dining',
      );
      expect(SEATING_COUNT_MUTATION_SURFACES).toContain(
        'SeatingTablesService.update',
      );
      expect(SEATING_COUNT_MUTATION_SURFACES).toContain(
        'EventRequestsService.approve.createFloorBlock',
      );
    });

    it('documents Phase 3 manual-edit guard surfaces (staff seating CRUD)', () => {
      expect(SEATING_MANUAL_EDIT_GUARD_SURFACES).toContain(
        'SeatingTablesService.update.nonCustom.mirrorOrDiningLayout',
      );
      for (const s of SEATING_MANUAL_EDIT_GUARD_SURFACES) {
        expect(RESOURCE_DINING_DUAL_WRITE_SURFACES.includes(s as never)).toBe(
          false,
        );
      }
    });

    it('documents Phase 2 dual-write surfaces (dining → advisory mirror)', () => {
      expect(RESOURCE_DINING_DUAL_WRITE_SURFACES).toContain(
        'ResourcesService.createDiningTableGroup',
      );
      expect(RESOURCE_DINING_DUAL_WRITE_SURFACES).toContain(
        'ResourcesService.updateDiningTableGroup',
      );
      for (const s of RESOURCE_DINING_DUAL_WRITE_SURFACES) {
        expect(SEATING_COUNT_MUTATION_SURFACES.includes(s as never)).toBe(false);
      }
    });
  });

  describe('normalizeDriftZone', () => {
    it('maps INDOOR/OUTDOOR and unknowns', () => {
      expect(normalizeDriftZone('INDOOR')).toBe('INDOOR');
      expect(normalizeDriftZone('outdoor')).toBe('OUTDOOR');
      expect(normalizeDriftZone(null)).toBe('UNKNOWN');
      expect(normalizeDriftZone('patio')).toBe('UNKNOWN');
    });
  });

  describe('bucket merge + drift', () => {
    it('reports matched buckets when seating totals equal DINING unit counts', () => {
      const seating = seatingTotalsFromRows([
        {
          shopId: 'shop-a',
          floor: 1,
          zone: 'INDOOR',
          capacity: 4,
          totalCount: 3,
          isCustom: false,
        },
      ]);
      const dining = diningCountsFromRows([
        {
          shopId: 'shop-a',
          type: 'DINING',
          capacity: 4,
          section: { floor: 1, zone: 'INDOOR' },
          tableGroup: null,
        },
        {
          shopId: 'shop-a',
          type: 'DINING',
          capacity: 4,
          section: { floor: 1, zone: 'INDOOR' },
          tableGroup: null,
        },
        {
          shopId: 'shop-a',
          type: 'DINING',
          capacity: 4,
          section: { floor: 1, zone: 'INDOOR' },
          tableGroup: null,
        },
      ]);
      const buckets = mergeInventoryBuckets(seating, dining);
      expect(buckets).toHaveLength(1);
      expect(buckets[0]).toMatchObject({
        seatingTotalCount: 3,
        diningResourceCount: 3,
      });
      expect(computeDriftRows(buckets)).toHaveLength(0);
    });

    it('detects drift when seating totalCount diverges from DINING resources', () => {
      const seating = seatingTotalsFromRows([
        {
          shopId: 'shop-a',
          floor: 1,
          zone: 'INDOOR',
          capacity: 2,
          totalCount: 6,
          isCustom: false,
        },
      ]);
      const dining = diningCountsFromRows([
        {
          shopId: 'shop-a',
          type: 'DINING',
          capacity: 2,
          section: { floor: 1, zone: 'INDOOR' },
          tableGroup: null,
        },
        {
          shopId: 'shop-a',
          type: 'DINING',
          capacity: 2,
          section: { floor: 1, zone: 'INDOOR' },
          tableGroup: null,
        },
      ]);
      const drifts = computeDriftRows(mergeInventoryBuckets(seating, dining));
      expect(drifts).toHaveLength(1);
      expect(drifts[0].delta).toBe(4);
      expect(bucketKeyString(drifts[0])).toBe('shop-a|f1|INDOOR|c2');
    });

    it('excludes isCustom seating (event floor blocks) from totals', () => {
      const seating = seatingTotalsFromRows([
        {
          shopId: 'shop-a',
          floor: 1,
          zone: 'OUTDOOR',
          capacity: 8,
          totalCount: 10,
          isCustom: true,
        },
        {
          shopId: 'shop-a',
          floor: 1,
          zone: 'OUTDOOR',
          capacity: 8,
          totalCount: 2,
          isCustom: false,
        },
      ]);
      const only = [...seating.values()];
      expect(only).toHaveLength(1);
      expect(only[0].seatingTotalCount).toBe(2);
    });

    it('falls back to tableGroup.capacity when resource.capacity is null', () => {
      const dining = diningCountsFromRows([
        {
          shopId: 'shop-a',
          type: 'DINING',
          capacity: null,
          section: { floor: 2, zone: null },
          tableGroup: { capacity: 6 },
        },
      ]);
      const row = [...dining.values()][0];
      expect(row).toMatchObject({
        floor: 2,
        zone: 'UNKNOWN',
        capacity: 6,
        diningResourceCount: 1,
      });
    });

    it('ignores non-DINING resources', () => {
      const dining = diningCountsFromRows([
        {
          shopId: 'shop-a',
          type: 'PC',
          capacity: 1,
          section: { floor: 1, zone: 'INDOOR' },
          tableGroup: null,
        },
      ]);
      expect(dining.size).toBe(0);
    });

    it('includes one-sided buckets (seating-only or dining-only) as drift', () => {
      const seating = seatingTotalsFromRows([
        {
          shopId: 'shop-a',
          floor: 1,
          zone: 'INDOOR',
          capacity: 4,
          totalCount: 2,
          isCustom: false,
        },
      ]);
      const dining = diningCountsFromRows([
        {
          shopId: 'shop-a',
          type: 'DINING',
          capacity: 6,
          section: { floor: 1, zone: 'INDOOR' },
          tableGroup: null,
        },
      ]);
      const drifts = computeDriftRows(mergeInventoryBuckets(seating, dining));
      expect(drifts).toHaveLength(2);
      expect(drifts.map((d) => d.capacity).sort()).toEqual([4, 6]);
    });
  });
});
