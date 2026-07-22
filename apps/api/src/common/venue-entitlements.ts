/**
 * Central venue entitlement engine.
 *
 * Backend guards / services should prefer:
 *   getVenueEntitlements / hasFeature / assertStaffSeatCapacity
 *
 * Frontend mirror call site (keep in sync):
 *   apps/web/src/lib/use-venue-access.ts → resolveSubscriptionAccess (@/lib/plan)
 */
import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import {
  resolveAddOnsCsv,
  type AddOnId,
} from './venue-packs';
import {
  moduleHasFeature,
  resolveStaffSeatLimit,
  resolveSubscriptionAccess,
  type SubscriptionAccess,
} from './subscription-tier';

export type VenueEntitlementInput = {
  tier: SubscriptionAccess['billedTier'];
  status: import('@prisma/client').SubscriptionStatus;
  trialEndsAt: Date | null;
  packId?: string | null;
  /** Legacy CSV / API string — used only when addOnRows omitted */
  addOns?: string | null;
  /** Relational rows — SoT when provided (including empty) */
  addOnRows?: { addOnId: string }[] | null;
  staffSeatQuantity?: number | null;
} | null;

export type VenueEntitlements = SubscriptionAccess & {
  /** Effective add-on CSV (computed from rows / legacy compat) */
  effectiveAddOns: string;
  staffSeatLimit: number;
};

function toSubRow(input: NonNullable<VenueEntitlementInput>) {
  const addOns = resolveAddOnsCsv({
    addOns: input.addOns,
    addOnRows: input.addOnRows ?? undefined,
  });
  return {
    tier: input.tier,
    status: input.status,
    trialEndsAt: input.trialEndsAt,
    packId: input.packId,
    addOns,
    staffSeatQuantity: input.staffSeatQuantity,
  };
}

/** Pure entitlement snapshot from a subscription-shaped row. */
export function getVenueEntitlements(
  subscription: VenueEntitlementInput,
): VenueEntitlements {
  const row = subscription ? toSubRow(subscription) : null;
  const access = resolveSubscriptionAccess(row);
  return {
    ...access,
    effectiveAddOns: access.addOns,
    staffSeatLimit: resolveStaffSeatLimit(row),
  };
}

export function hasFeature(
  entitlements: VenueEntitlements | SubscriptionAccess | Set<string>,
  feature: string,
): boolean {
  if (entitlements instanceof Set) {
    return moduleHasFeature(entitlements, feature);
  }
  return moduleHasFeature(entitlements.enabledModules, feature);
}

/** Load shop subscription and resolve entitlements (add-on rows primary). */
export async function getVenueEntitlementsForShop(
  prisma: PrismaService,
  shopId: string,
): Promise<VenueEntitlements> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      subscription: {
        include: { addOnRows: true },
      },
    },
  });
  return getVenueEntitlements(shop?.subscription ?? null);
}

export async function assertShopHasFeature(
  prisma: PrismaService,
  shopId: string,
  feature: string,
): Promise<VenueEntitlements> {
  const entitlements = await getVenueEntitlementsForShop(prisma, shopId);
  if (!hasFeature(entitlements, feature)) {
    throw new ForbiddenException(
      `This feature is not included in your venue pack. Add it from Subscription to unlock ${feature}.`,
    );
  }
  return entitlements;
}

/**
 * First venue is always allowed. A second+ venue requires `multi_shop` on an
 * owned shop, or an active trial on an owned shop (acquisition funnel).
 */
export async function assertOwnerMayAddVenue(
  prisma: PrismaService,
  ownerId: string,
): Promise<void> {
  const shops = await prisma.shop.findMany({
    where: { ownerId },
    include: {
      subscription: { include: { addOnRows: true } },
    },
  });
  if (shops.length === 0) return;

  const allowed = shops.some((s) => {
    const e = getVenueEntitlements(s.subscription);
    return e.trialActive || hasFeature(e, 'multi_shop');
  });
  if (!allowed) {
    throw new ForbiddenException(
      'This feature is not included in your venue pack. Add it from Subscription to unlock multi_shop.',
    );
  }
}

/**
 * Linking / accessing more than one venue requires multi_shop or an active
 * trial on a shop the account already owns (or is about to link).
 */
export function assertMultiVenueEntitlement(
  subscriptions: VenueEntitlementInput[],
  currentVenueCount: number,
  addingCount: number,
): void {
  if (currentVenueCount + addingCount <= 1) return;
  const allowed = subscriptions.some((sub) => {
    const e = getVenueEntitlements(sub);
    return e.trialActive || hasFeature(e, 'multi_shop');
  });
  if (!allowed) {
    throw new ForbiddenException(
      'This feature is not included in your venue pack. Add it from Subscription to unlock multi_shop.',
    );
  }
}

/**
 * Enforce Team accounts (`roles`) + seat cap before creating or reactivating
 * an employee membership. `usedSeats` should count active STAFF/MANAGER
 * venue-staff memberships (inactive seats do not count).
 */
export function assertStaffSeatCapacity(
  entitlements: VenueEntitlements,
  usedSeats: number,
): void {
  if (!hasFeature(entitlements, 'roles')) {
    throw new ForbiddenException(
      'Enable Team accounts on Subscription and buy at least one employee seat.',
    );
  }
  const limit = entitlements.staffSeatLimit;
  if (limit === 0 || usedSeats >= limit) {
    throw new ForbiddenException(
      limit === 0
        ? 'No employee seats purchased yet. Add seats on Subscription, then create accounts.'
        : `Employee limit reached (${usedSeats}/${limit}). Buy more seats on Subscription.`,
    );
  }
}

export type { AddOnId };
