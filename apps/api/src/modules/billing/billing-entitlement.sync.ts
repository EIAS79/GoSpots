import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  BillingSubscription,
  BillingSubscriptionAddOn,
} from '@prisma/client';
import { SubscriptionStatus } from '@prisma/client';
import {
  resolvePackId,
  serializeAddOns,
  syncSubscriptionAddOnRows,
  type AddOnId,
  VENUE_ADD_ONS,
} from '../../common/venue-packs';
import { tierForPack } from '../../common/subscription-tier';
import { PrismaService } from '../../prisma/prisma.service';
import { canonicalToEntitlementStatus } from './billing-state-machine';

export type BillingSubscriptionForSync = BillingSubscription & {
  addOns?: BillingSubscriptionAddOn[];
};

function resolveBillingAddOnIds(
  billingSub: BillingSubscriptionForSync,
): AddOnId[] {
  const rows = billingSub.addOns ?? [];
  return [
    ...new Set(
      rows
        .map((r) => r.addOnId.trim())
        .filter((id): id is AddOnId => id in VENUE_ADD_ONS),
    ),
  ];
}

@Injectable()
export class BillingEntitlementSync {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Project a provider-neutral `BillingSubscription` onto the entitlement
   * `Subscription` row (status, period, pack/seats/add-ons, link).
   */
  async syncShopEntitlementFromBilling(
    shopId: string,
    billingSub: BillingSubscriptionForSync,
  ) {
    const existing = await this.prisma.subscription.findUnique({
      where: { shopId },
      include: { addOnRows: true },
    });
    if (!existing) {
      throw new NotFoundException(`Subscription not found for shop ${shopId}`);
    }

    const status = canonicalToEntitlementStatus(billingSub.canonicalStatus);
    const packId = resolvePackId(billingSub.planId);
    const addOnIds = resolveBillingAddOnIds(billingSub);
    const addOnsCsv = serializeAddOns(addOnIds);
    const tier = tierForPack(packId, addOnsCsv);

    const updated = await this.prisma.subscription.update({
      where: { shopId },
      data: {
        status,
        packId,
        tier,
        staffSeatQuantity: Math.max(0, billingSub.seatQuantity ?? 0),
        currentPeriodEnd: billingSub.currentPeriodEnd,
        billingCurrency: billingSub.currency,
        billingSubscriptionId: billingSub.id,
        trialEndsAt:
          status === SubscriptionStatus.ACTIVE ? null : existing.trialEndsAt,
      },
    });

    await syncSubscriptionAddOnRows(this.prisma, updated.id, addOnsCsv);

    if (
      status === SubscriptionStatus.ACTIVE ||
      status === SubscriptionStatus.PAST_DUE
    ) {
      await this.prisma.shop.update({
        where: { id: shopId },
        data: { venueType: packId },
      });
    }

    return updated;
  }
}
