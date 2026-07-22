/**
 * Phase 2 dual-write: mirror DiningTableGroup inventory onto advisory SeatingTableGroup
 * (bible #14 / Option C). Does not auto-sync availableCount from reservations.
 *
 * See docs/audit/GO_SPOTS_RESOURCE_MODEL_MERGE.md.
 */

import type { Prisma, PrismaClient, SeatingZone } from '@prisma/client';

import { normalizeDriftZone } from './resource-dining-drift.util';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type DiningMirrorInput = {
  shopId: string;
  diningTableGroupId: string;
  label: string;
  capacity: number;
  totalCount: number;
  floor: number;
  zone: SeatingZone;
};

/**
 * Default ON. Set RESOURCE_DINING_DUAL_WRITE=off|0|false to disable.
 * Expand-only advisory mirror — safe after migrate; bookings never touch seating counts.
 */
export function isResourceDiningDualWriteEnabled(): boolean {
  const v = process.env.RESOURCE_DINING_DUAL_WRITE?.trim().toLowerCase();
  if (v === 'off' || v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

export function seatingZoneFromSectionZone(
  zone: string | null | undefined,
): SeatingZone {
  return normalizeDriftZone(zone) === 'OUTDOOR' ? 'OUTDOOR' : 'INDOOR';
}

/** When totalCount shrinks, clamp availableCount; never invent free tables from bookings. */
export function clampAvailableOnTotalChange(
  prevAvailable: number,
  newTotal: number,
): number {
  const total = Math.max(0, newTotal);
  return Math.min(Math.max(0, prevAvailable), total);
}

export function buildDiningMirrorLabel(
  name: string | null | undefined,
  capacity: number,
): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed.slice(0, 80);
  return `Table for ${capacity}`.slice(0, 80);
}

/**
 * Upsert non-custom advisory seating linked to a dining table group.
 * Create: availableCount = totalCount. Update: clamp available only; never auto-decrement from books.
 */
export async function upsertAdvisorySeatingForDiningGroup(
  prisma: DbClient,
  input: DiningMirrorInput,
): Promise<'skipped' | 'created' | 'updated'> {
  if (!isResourceDiningDualWriteEnabled()) return 'skipped';

  const totalCount = Math.max(0, Math.floor(input.totalCount));
  const capacity = Math.max(1, Math.floor(input.capacity));
  const floor = Math.max(1, Math.min(10, Math.floor(input.floor) || 1));
  const label = buildDiningMirrorLabel(input.label, capacity);

  const existing = await prisma.seatingTableGroup.findFirst({
    where: {
      shopId: input.shopId,
      sourceDiningTableGroupId: input.diningTableGroupId,
    },
  });

  if (!existing) {
    const maxSort = await prisma.seatingTableGroup.aggregate({
      where: { shopId: input.shopId },
      _max: { sortOrder: true },
    });
    await prisma.seatingTableGroup.create({
      data: {
        shopId: input.shopId,
        zone: input.zone,
        floor,
        label,
        capacity,
        totalCount,
        availableCount: totalCount,
        isCustom: false,
        sourceDiningTableGroupId: input.diningTableGroupId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
    return 'created';
  }

  await prisma.seatingTableGroup.update({
    where: { id: existing.id },
    data: {
      zone: input.zone,
      floor,
      label,
      capacity,
      totalCount,
      availableCount: clampAvailableOnTotalChange(
        existing.availableCount,
        totalCount,
      ),
      isCustom: false,
    },
  });
  return 'updated';
}

/** Explicit delete of mirror (DiningTableGroup Cascade also covers FK). */
export async function deleteAdvisorySeatingForDiningGroup(
  prisma: DbClient,
  shopId: string,
  diningTableGroupId: string,
): Promise<'skipped' | 'deleted' | 'none'> {
  if (!isResourceDiningDualWriteEnabled()) return 'skipped';

  const result = await prisma.seatingTableGroup.deleteMany({
    where: {
      shopId,
      sourceDiningTableGroupId: diningTableGroupId,
      isCustom: false,
    },
  });
  return result.count > 0 ? 'deleted' : 'none';
}

/**
 * Re-sync all mirrors for dining table groups in a section (floor/zone move).
 */
export async function syncAdvisorySeatingMirrorsForSection(
  prisma: DbClient,
  shopId: string,
  sectionId: string,
): Promise<'skipped' | 'synced'> {
  if (!isResourceDiningDualWriteEnabled()) return 'skipped';

  const section = await prisma.gamingSection.findFirst({
    where: { id: sectionId, shopId },
    select: {
      floor: true,
      zone: true,
      tableGroups: {
        select: {
          id: true,
          name: true,
          capacity: true,
          _count: { select: { resources: true } },
        },
      },
    },
  });
  if (!section) return 'synced';

  const zone = seatingZoneFromSectionZone(section.zone);
  for (const g of section.tableGroups) {
    await upsertAdvisorySeatingForDiningGroup(prisma, {
      shopId,
      diningTableGroupId: g.id,
      label: buildDiningMirrorLabel(g.name, g.capacity),
      capacity: g.capacity,
      totalCount: g._count.resources,
      floor: section.floor,
      zone,
    });
  }
  return 'synced';
}
