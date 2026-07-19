import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { SubscriptionStatus } from '@prisma/client';
import {
  monthlyTotal,
  resolvePackId,
  serializeAddOns,
  type AddOnId,
} from '../../common/venue-packs';
import { tierForPack } from '../../common/subscription-tier';
import { requireShopId } from '../../common/tenant';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyRatesService } from '../shop/currency-rates.service';
import { LemonSqueezyClient } from './lemon-squeezy.client';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lemon: LemonSqueezyClient,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly rates: CurrencyRatesService,
  ) {}

  status() {
    return {
      provider: 'lemon_squeezy' as const,
      configured: this.lemon.isConfigured(),
      currenciesNote:
        'Lemon Squeezy is Merchant of Record — customers pay in supported currencies; tax/VAT handled for you.',
    };
  }

  async createCheckout(actor: JwtAccessPayload) {
    if (
      actor.shopRole !== 'OWNER' &&
      !hasPermission(actor.perms ?? '', PERMISSIONS.SUBSCRIPTION_MANAGE)
    ) {
      throw new ForbiddenException(
        'Only the venue owner or a manager with billing access can manage billing.',
      );
    }
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { subscription: true, owner: true },
    });
    if (!shop?.subscription) throw new NotFoundException('Subscription not found.');

    const lemonId = (shop.subscription as { lemonSubscriptionId?: string | null })
      .lemonSubscriptionId;
    if (lemonId) {
      // Prevent duplicate Lemon subscriptions — send them to the portal.
      const url = await this.lemon.getCustomerPortalUrl(lemonId);
      await this.audit.record(actor, {
        section: 'subscription',
        action: 'billing.portal',
        summary: 'Opened Lemon Squeezy customer portal',
        meta: { lemonSubscriptionId: lemonId },
      });
      return { url, mode: 'portal' as const, amountEur: null as number | null };
    }

    const packId = resolvePackId(
      (shop.subscription as { pendingPackId?: string | null }).pendingPackId ??
        shop.subscription.packId,
    );
    const addOns =
      (shop.subscription as { pendingAddOns?: string | null }).pendingAddOns ??
      shop.subscription.addOns;
    const seats =
      (shop.subscription as { pendingStaffSeatQuantity?: number | null })
        .pendingStaffSeatQuantity ??
      (shop.subscription as { staffSeatQuantity?: number }).staffSeatQuantity ??
      0;
    const eurTotal = monthlyTotal(packId, addOns, seats);
    const currency = (shop.currency || 'EUR').toUpperCase();
    const { rate, ratesAt } = await this.rates.getRate('EUR', currency, {
      forceRefresh: true,
    });
    const localTotal = this.rates.convertAmount(eurTotal, rate);
    const cents = Math.round(localTotal * 100);

    const webApp =
      this.config.get<string>('WEB_APP_URL') ??
      this.config.get<string>('WEB_ORIGIN') ??
      'http://localhost:3000';
    const dashboardPath = `${shop.slug}--${shop.dashboardKey}`;
    const redirectUrl = `${webApp.replace(/\/$/, '')}/dashboard/${dashboardPath}/subscription?billing=success`;

    const { url } = await this.lemon.createCheckout({
      email: shop.owner.email,
      name: shop.owner.name,
      customPriceCents: cents,
      redirectUrl,
      currency,
      custom: {
        shop_id: shop.id,
        pack_id: packId,
        add_ons: addOns,
        staff_seats: String(seats),
        billing_currency: currency,
        amount_eur: String(eurTotal),
        fx_rate: String(rate),
        fx_rates_at: ratesAt,
      },
    });

    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.checkout_start',
      summary: `Started Lemon Squeezy checkout for ${packId} (${localTotal} ${currency}/mo · €${eurTotal} @ ${rate.toFixed(6)})`,
      meta: { packId, addOns, eurTotal, localTotal, currency, rate, ratesAt },
    });

    return {
      url,
      mode: 'checkout' as const,
      amountEur: eurTotal,
      amount: localTotal,
      currency,
      rate,
    };
  }

  async openPortal(actor: JwtAccessPayload) {
    if (
      actor.shopRole !== 'OWNER' &&
      !hasPermission(actor.perms ?? '', PERMISSIONS.SUBSCRIPTION_MANAGE)
    ) {
      throw new ForbiddenException(
        'Only the venue owner or a manager with billing access can manage billing.',
      );
    }
    const shopId = requireShopId(actor);
    const sub = await this.prisma.subscription.findUnique({
      where: { shopId },
    });
    if (!sub) throw new NotFoundException('Subscription not found.');
    const lemonId = (sub as { lemonSubscriptionId?: string | null })
      .lemonSubscriptionId;
    if (!lemonId) {
      throw new BadRequestException(
        'No active Lemon Squeezy subscription yet. Start checkout first.',
      );
    }
    const url = await this.lemon.getCustomerPortalUrl(lemonId);
    return { url, mode: 'portal' as const };
  }

  verifySignature(rawBody: Buffer | string, signature: string | undefined) {
    const secret = this.config.get<string>('LEMON_SQUEEZY_WEBHOOK_SECRET') ?? '';
    if (!secret) {
      throw new BadRequestException('Webhook secret not configured.');
    }
    if (!signature) throw new BadRequestException('Missing signature.');

    const hmac = createHmac('sha256', secret);
    hmac.update(typeof rawBody === 'string' ? rawBody : rawBody);
    const digest = hmac.digest('hex');
    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid webhook signature.');
    }
  }

  async handleWebhook(payload: {
    meta?: {
      event_name?: string;
      custom_data?: Record<string, string>;
    };
    data?: {
      id?: string;
      type?: string;
      attributes?: Record<string, unknown>;
    };
  }) {
    const event = payload.meta?.event_name ?? '';
    const custom = payload.meta?.custom_data ?? {};
    const shopId = custom.shop_id;
    const attrs = payload.data?.attributes ?? {};

    this.logger.log(`Lemon webhook: ${event} shop=${shopId ?? 'n/a'}`);

    if (!shopId) {
      // Still acknowledge — some events lack custom_data
      return { ok: true, ignored: true };
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { shopId },
    });
    if (!sub) return { ok: true, ignored: true };

    if (
      event === 'subscription_created' ||
      event === 'subscription_updated' ||
      event === 'subscription_resumed' ||
      event === 'subscription_unpaused'
    ) {
      const statusRaw = String(attrs.status ?? 'active').toLowerCase();
      const lsStatus =
        statusRaw === 'active' || statusRaw === 'on_trial'
          ? SubscriptionStatus.ACTIVE
          : statusRaw === 'past_due' || statusRaw === 'unpaid'
            ? SubscriptionStatus.PAST_DUE
            : statusRaw === 'cancelled' || statusRaw === 'expired'
              ? SubscriptionStatus.CANCELED
              : SubscriptionStatus.ACTIVE;

      const renewsAt = attrs.renews_at
        ? new Date(String(attrs.renews_at))
        : null;

      const pendingPackId = (sub as { pendingPackId?: string | null })
        .pendingPackId;
      const periodAdvanced =
        !!pendingPackId &&
        !!renewsAt &&
        (!sub.currentPeriodEnd ||
          renewsAt.getTime() > sub.currentPeriodEnd.getTime());

      let packId = resolvePackId(custom.pack_id ?? sub.packId);
      let addOns =
        custom.add_ons != null
          ? serializeAddOns(
              String(custom.add_ons)
                .split(',')
                .filter(Boolean) as AddOnId[],
            )
          : sub.addOns;
      let staffSeatQuantity =
        (sub as { staffSeatQuantity?: number }).staffSeatQuantity ?? 0;
      let clearPending = false;

      if (periodAdvanced) {
        packId = resolvePackId(pendingPackId!);
        addOns =
          (sub as { pendingAddOns?: string | null }).pendingAddOns ??
          sub.addOns;
        staffSeatQuantity =
          (sub as { pendingStaffSeatQuantity?: number | null })
            .pendingStaffSeatQuantity ?? staffSeatQuantity;
        clearPending = true;
      } else if (custom.staff_seats != null) {
        staffSeatQuantity = Math.max(
          0,
          Math.min(100, Math.floor(Number(custom.staff_seats) || 0)),
        );
      }

      // First successful payment (or any ACTIVE sync) unlocks the pending plan.
      if (lsStatus === SubscriptionStatus.ACTIVE) {
        clearPending = true;
      }

      const tier = tierForPack(packId, addOns);

      await this.prisma.subscription.update({
        where: { shopId },
        data: {
          status: lsStatus,
          packId,
          addOns,
          tier,
          staffSeatQuantity,
          lemonSubscriptionId: payload.data?.id
            ? String(payload.data.id)
            : undefined,
          lemonCustomerId: attrs.customer_id
            ? String(attrs.customer_id)
            : undefined,
          lemonOrderId: attrs.order_id ? String(attrs.order_id) : undefined,
          billingCurrency: custom.billing_currency ?? undefined,
          currentPeriodEnd: renewsAt,
          trialEndsAt:
            lsStatus === SubscriptionStatus.ACTIVE ? null : sub.trialEndsAt,
          ...(clearPending
            ? {
                pendingPackId: null,
                pendingAddOns: null,
                pendingStaffSeatQuantity: null,
              }
            : {}),
        } as never,
      });

      if (periodAdvanced || lsStatus === SubscriptionStatus.ACTIVE) {
        await this.prisma.shop.update({
          where: { id: shopId },
          data: { venueType: packId },
        });
      }

      await this.audit.recordForShop(shopId, {
        section: 'subscription',
        action: `billing.${event}`,
        summary: `Billing ${event.replace(/_/g, ' ')} → ${lsStatus}`,
        meta: {
          packId,
          addOns,
          lemonId: payload.data?.id,
          appliedPending: clearPending,
        },
        actorName: 'Lemon Squeezy',
      });
    }

    if (
      event === 'subscription_cancelled' ||
      event === 'subscription_expired' ||
      event === 'subscription_paused'
    ) {
      await this.prisma.subscription.update({
        where: { shopId },
        data: {
          status:
            event === 'subscription_paused'
              ? SubscriptionStatus.PAST_DUE
              : SubscriptionStatus.CANCELED,
        },
      });
      await this.audit.recordForShop(shopId, {
        section: 'subscription',
        action: `billing.${event}`,
        summary: `Billing ${event.replace(/_/g, ' ')}`,
        meta: { lemonId: payload.data?.id },
        actorName: 'Lemon Squeezy',
      });
    }

    return { ok: true };
  }
}
