/**
 * Phase 1 observability for resource vs seating inventory drift (bible #14 / Option C).
 *
 * Read-only: never mutates seating counts or resources.
 * See docs/audit/GO_SPOTS_RESOURCE_MODEL_MERGE.md.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Normalized zone for drift buckets (SeatingZone enum or GamingSection.zone string). */
export type DriftZone = 'INDOOR' | 'OUTDOOR' | 'UNKNOWN';

export type InventoryBucketKey = {
  shopId: string;
  floor: number;
  zone: DriftZone;
  capacity: number;
};

export type InventoryBucket = InventoryBucketKey & {
  /** Sum of non-custom SeatingTableGroup.totalCount for this key. */
  seatingTotalCount: number;
  /** Count of DINING Resource units for this key. */
  diningResourceCount: number;
};

export type DriftRow = InventoryBucket & {
  /** seatingTotalCount − diningResourceCount (0 = matched). */
  delta: number;
};

export type ResourceDiningDriftReport = {
  shopsWithDiningResources: number;
  shopsCompared: number;
  bucketsCompared: number;
  matchedBuckets: number;
  driftedBuckets: number;
  /** Buckets where seating and dining both present but counts differ, or one side only. */
  drifts: DriftRow[];
  samples: DriftRow[];
};

const SAMPLE_CAP = 40;

/**
 * Option C Phase 0 contract — who may mutate advisory seating counts.
 * Public/staff dining book on Resource must NOT appear here.
 */
export const SEATING_COUNT_MUTATION_SURFACES = [
  'SeatingTablesService.create',
  'SeatingTablesService.update',
  'SeatingTablesService.delete',
  'EventRequestsService.approve.createFloorBlock',
  'ShopService.updateSettings.floorClamp',
] as const;

/**
 * Option C Phase 0 contract — bookable DINING inventory write paths.
 * These lock/create Resource / Reservation; they must not touch availableCount.
 */
export const BOOKABLE_DINING_MUTATION_SURFACES = [
  'ResourcesService.diningLayout',
  'ReservationsService.createPublicGamingBooking.dining',
  'ReservationsService.staffCreateUpdate.diningResource',
  'FinanceService.playSession.walkIn.diningResource',
] as const;

/**
 * Phase 2 Option C — dining layout writers that may upsert advisory seating mirrors
 * (`sourceDiningTableGroupId`). Still must not touch availableCount from bookings.
 */
export const RESOURCE_DINING_DUAL_WRITE_SURFACES = [
  'ResourcesService.createDiningTableGroup',
  'ResourcesService.updateDiningTableGroup',
  'ResourcesService.deleteDiningTableGroup',
  'ResourcesService.updateGamingSection.diningFloorZone',
] as const;

/** Phase 0 invariant: dining book never auto-decrements seating availableCount. */
export function publicDiningBookMutatesSeatingAvailableCount(): false {
  return false;
}

export function normalizeDriftZone(raw: string | null | undefined): DriftZone {
  if (raw == null || raw.trim() === '') return 'UNKNOWN';
  const upper = raw.trim().toUpperCase();
  if (upper === 'INDOOR') return 'INDOOR';
  if (upper === 'OUTDOOR') return 'OUTDOOR';
  return 'UNKNOWN';
}

export function bucketKeyString(key: InventoryBucketKey): string {
  return `${key.shopId}|f${key.floor}|${key.zone}|c${key.capacity}`;
}

export function emptyBucket(key: InventoryBucketKey): InventoryBucket {
  return {
    ...key,
    seatingTotalCount: 0,
    diningResourceCount: 0,
  };
}

/**
 * Merge seating + dining maps into comparable buckets.
 * Includes one-sided keys (seating-only or dining-only) so operators see gaps.
 */
export function mergeInventoryBuckets(
  seatingTotals: Map<string, InventoryBucketKey & { seatingTotalCount: number }>,
  diningCounts: Map<string, InventoryBucketKey & { diningResourceCount: number }>,
): InventoryBucket[] {
  const keys = new Set([...seatingTotals.keys(), ...diningCounts.keys()]);
  const out: InventoryBucket[] = [];
  for (const k of keys) {
    const s = seatingTotals.get(k);
    const d = diningCounts.get(k);
    const base = s ?? d;
    if (!base) continue;
    out.push({
      shopId: base.shopId,
      floor: base.floor,
      zone: base.zone,
      capacity: base.capacity,
      seatingTotalCount: s?.seatingTotalCount ?? 0,
      diningResourceCount: d?.diningResourceCount ?? 0,
    });
  }
  return out.sort((a, b) => bucketKeyString(a).localeCompare(bucketKeyString(b)));
}

export function computeDriftRows(buckets: InventoryBucket[]): DriftRow[] {
  return buckets
    .map((b) => ({
      ...b,
      delta: b.seatingTotalCount - b.diningResourceCount,
    }))
    .filter((b) => b.delta !== 0);
}

function bumpSeating(
  map: Map<string, InventoryBucketKey & { seatingTotalCount: number }>,
  key: InventoryBucketKey,
  add: number,
) {
  if (add <= 0) return;
  const id = bucketKeyString(key);
  const prev = map.get(id);
  if (prev) {
    prev.seatingTotalCount += add;
  } else {
    map.set(id, { ...key, seatingTotalCount: add });
  }
}

function bumpDining(
  map: Map<string, InventoryBucketKey & { diningResourceCount: number }>,
  key: InventoryBucketKey,
  add = 1,
) {
  if (add <= 0) return;
  const id = bucketKeyString(key);
  const prev = map.get(id);
  if (prev) {
    prev.diningResourceCount += add;
  } else {
    map.set(id, { ...key, diningResourceCount: add });
  }
}

type SeatingRow = {
  shopId: string;
  floor: number;
  zone: string;
  capacity: number;
  totalCount: number;
  isCustom: boolean;
};

type DiningResourceRow = {
  shopId: string;
  type: string;
  capacity: number | null;
  section: {
    floor: number;
    zone: string | null;
  } | null;
  tableGroup: { capacity: number } | null;
};

/** Pure: build seating map from non-custom groups (event customs excluded under Option C). */
export function seatingTotalsFromRows(
  rows: SeatingRow[],
): Map<string, InventoryBucketKey & { seatingTotalCount: number }> {
  const map = new Map<string, InventoryBucketKey & { seatingTotalCount: number }>();
  for (const row of rows) {
    if (row.isCustom) continue;
    if (!Number.isInteger(row.capacity) || row.capacity < 1) continue;
    const key: InventoryBucketKey = {
      shopId: row.shopId,
      floor: Math.max(1, row.floor || 1),
      zone: normalizeDriftZone(row.zone),
      capacity: row.capacity,
    };
    bumpSeating(map, key, Math.max(0, row.totalCount));
  }
  return map;
}

/** Pure: count DINING resources by section floor/zone + capacity. */
export function diningCountsFromRows(
  rows: DiningResourceRow[],
): Map<string, InventoryBucketKey & { diningResourceCount: number }> {
  const map = new Map<string, InventoryBucketKey & { diningResourceCount: number }>();
  for (const row of rows) {
    if (row.type !== 'DINING') continue;
    const capacity =
      row.capacity != null && row.capacity >= 1
        ? row.capacity
        : row.tableGroup?.capacity != null && row.tableGroup.capacity >= 1
          ? row.tableGroup.capacity
          : null;
    if (capacity == null) continue;
    const key: InventoryBucketKey = {
      shopId: row.shopId,
      floor: Math.max(1, row.section?.floor ?? 1),
      zone: normalizeDriftZone(row.section?.zone),
      capacity,
    };
    bumpDining(map, key, 1);
  }
  return map;
}

/**
 * Read-only drift report for shops that have at least one DINING resource.
 * Compares non-custom seating totals vs DINING unit counts by (floor, zone, capacity).
 */
export async function detectResourceDiningDrift(
  prisma: DbClient,
): Promise<ResourceDiningDriftReport> {
  const diningResources = await prisma.resource.findMany({
    where: { type: 'DINING' },
    select: {
      shopId: true,
      type: true,
      capacity: true,
      section: { select: { floor: true, zone: true } },
      tableGroup: { select: { capacity: true } },
    },
  });

  const shopIds = [...new Set(diningResources.map((r) => r.shopId))];
  const seatingGroups =
    shopIds.length === 0
      ? []
      : await prisma.seatingTableGroup.findMany({
          where: { shopId: { in: shopIds }, isCustom: false },
          select: {
            shopId: true,
            floor: true,
            zone: true,
            capacity: true,
            totalCount: true,
            isCustom: true,
          },
        });

  const seatingMap = seatingTotalsFromRows(
    seatingGroups.map((g) => ({
      shopId: g.shopId,
      floor: g.floor,
      zone: String(g.zone),
      capacity: g.capacity,
      totalCount: g.totalCount,
      isCustom: g.isCustom,
    })),
  );
  const diningMap = diningCountsFromRows(
    diningResources.map((r) => ({
      shopId: r.shopId,
      type: r.type,
      capacity: r.capacity,
      section: r.section,
      tableGroup: r.tableGroup,
    })),
  );

  // Only buckets for shops that have DINING resources (already filtered).
  const buckets = mergeInventoryBuckets(seatingMap, diningMap).filter((b) =>
    shopIds.includes(b.shopId),
  );
  const drifts = computeDriftRows(buckets);

  return {
    shopsWithDiningResources: shopIds.length,
    shopsCompared: shopIds.length,
    bucketsCompared: buckets.length,
    matchedBuckets: buckets.length - drifts.length,
    driftedBuckets: drifts.length,
    drifts,
    samples: drifts.slice(0, SAMPLE_CAP),
  };
}
