/**
 * Phase 1 pack/tier collapse: expand empty stored add-ons for STANDARD+
 * shops from `legacyAddOnsFromTier(tier)` into SubscriptionAddOn rows.
 *
 * Idempotent expand-only — never clears intentional STARTER/FREE empties.
 * Runtime authz already synthesizes the same set via `effectiveAddOnsForSubscription`;
 * this persists so reporting / rows-primary reads see explicit add-ons.
 *
 * Used by `scripts/backfill-legacy-addon-tier.ts` (pnpm `backfill:legacy-addon-tier`).
 */
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  legacyAddOnsFromTier,
  parseAddOns,
  serializeAddOns,
  replaceSubscriptionAddOnRows,
} from './venue-packs';

type DbClient = PrismaClient | Prisma.TransactionClient;

const LEGACY_PAID: SubscriptionTier[] = [
  SubscriptionTier.STANDARD,
  SubscriptionTier.PRO,
  SubscriptionTier.ENTERPRISE,
];

const ACTIVEISH: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIAL,
];

export type LegacyAddonBackfillCandidate = {
  id: string;
  shopId: string;
  tier: SubscriptionTier;
  packId: string | null;
  addOns: string;
  proposedAddOns: string;
};

export type LegacyAddonBackfillResult = {
  dryRun: boolean;
  candidates: number;
  updated?: number;
};

function storedAddOnsEmpty(addOnRows: { addOnId: string }[] | undefined): boolean {
  return !(addOnRows?.length);
}

/** List ACTIVE/TRIAL STANDARD+ rows with empty add-on rows (expand candidates). */
export async function listLegacyEmptyAddonSubscriptions(
  db: DbClient,
): Promise<LegacyAddonBackfillCandidate[]> {
  const rows = await db.subscription.findMany({
    where: {
      status: { in: ACTIVEISH },
      tier: { in: LEGACY_PAID },
    },
    select: {
      id: true,
      shopId: true,
      tier: true,
      packId: true,
      addOnRows: { select: { addOnId: true } },
    },
  });

  const out: LegacyAddonBackfillCandidate[] = [];
  for (const row of rows) {
    if (!storedAddOnsEmpty(row.addOnRows)) continue;
    const proposed = serializeAddOns(legacyAddOnsFromTier(row.tier));
    if (!parseAddOns(proposed).length) continue;
    out.push({
      id: row.id,
      shopId: row.shopId,
      tier: row.tier,
      packId: row.packId,
      addOns: '',
      proposedAddOns: proposed,
    });
  }
  return out;
}

/**
 * Persist legacy add-ons for empty STANDARD+ subscriptions (rows only).
 * @param opts.dryRun default true — list only
 * @param opts.apply set true (and dryRun false) to write rows
 */
export async function backfillLegacyEmptyAddOns(
  db: DbClient,
  opts?: { dryRun?: boolean; apply?: boolean },
): Promise<LegacyAddonBackfillResult> {
  const apply = opts?.apply === true && opts?.dryRun !== true;
  const dryRun = !apply;
  const candidates = await listLegacyEmptyAddonSubscriptions(db);

  if (dryRun) {
    return { dryRun: true, candidates: candidates.length };
  }

  let updated = 0;
  for (const c of candidates) {
    await replaceSubscriptionAddOnRows(db, c.id, c.proposedAddOns);
    updated += 1;
  }
  return { dryRun: false, candidates: candidates.length, updated };
}
