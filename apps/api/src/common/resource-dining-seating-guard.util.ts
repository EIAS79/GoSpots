/**
 * Phase 3 guardrails: block staff manual CRUD on non-custom advisory seating mirrors
 * when the shop has a DINING layout (Option C). Dual-write util bypasses this path.
 *
 * Seating mirror API guardrails during resource/dining dual-write.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Emergency override for operators — default deny manual mirror edits. */
export function isSeatingMirrorManualOverrideEnabled(): boolean {
  const v = process.env.SEATING_MIRROR_MANUAL_OVERRIDE?.trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true' || v === 'yes';
}

export async function shopHasActiveDiningLayout(
  prisma: DbClient,
  shopId: string,
): Promise<boolean> {
  const category = await prisma.resourceCategory.findFirst({
    where: { shopId, type: 'DINING' },
    select: { id: true },
  });
  return category != null;
}

export type SeatingManualEditRow = {
  isCustom: boolean;
  sourceDiningTableGroupId: string | null;
};

export function isAdvisoryDiningMirrorRow(row: SeatingManualEditRow): boolean {
  return !row.isCustom && row.sourceDiningTableGroupId != null;
}

/** True when staff SeatingTablesService mutation must be rejected (override off). */
export function shouldDenyManualSeatingMutation(input: {
  row: SeatingManualEditRow;
  shopHasDiningLayout: boolean;
  overrideEnabled?: boolean;
}): boolean {
  if (input.overrideEnabled ?? isSeatingMirrorManualOverrideEnabled()) {
    return false;
  }
  if (input.row.isCustom) return false;
  return (
    input.row.sourceDiningTableGroupId != null || input.shopHasDiningLayout
  );
}

export const SEATING_MANUAL_EDIT_DENIED_MESSAGE =
  'Dining table inventory is managed from the layout editor. Edit tables under Dining layout, or create a custom event floor block.';
