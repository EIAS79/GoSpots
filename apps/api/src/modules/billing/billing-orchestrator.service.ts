import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingCanonicalSubscriptionStatus,
  BillingOperationStatus,
  BillingProvider,
  BillingRenewalMode,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import {
  hashIdempotencyRequest,
  IDEMPOTENCY_SCOPES,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { VENUE_ADD_ONS, type AddOnId } from '../../common/venue-packs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  isDualBillingEnabled,
  readBillingConfig,
  type BillingProviderChoice,
} from './billing-config';
import { BillingCatalogService } from './billing-catalog.service';
import { BillingEntitlementSync } from './billing-entitlement.sync';
import { BillingNotificationService } from './billing-notification.service';
import { BillingProviderRegistry } from './billing-provider.registry';
import {
  assertSubscriptionTransition,
} from './billing-state-machine';
import type {
  CancelDto,
  ChangePlanDto,
  ChangeRenewalModeDto,
  CheckoutDto,
  PauseDto,
  SwitchProviderDto,
} from './dto/billing.dto';
import { MollieBillingAdapter } from './providers/mollie.adapter';

const LIVE_STATUSES: BillingCanonicalSubscriptionStatus[] = [
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCEL_AT_PERIOD_END',
];

const OPERATION_TTL_MS = 24 * 60 * 60 * 1000;

type TxClient = Prisma.TransactionClient;

@Injectable()
export class BillingOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly catalog: BillingCatalogService,
    private readonly registry: BillingProviderRegistry,
    private readonly entitlements: BillingEntitlementSync,
    private readonly audit: AuditService,
    private readonly notifications: BillingNotificationService,
    private readonly mollie: MollieBillingAdapter,
  ) {}

  private assertBillingManage(actor: JwtAccessPayload) {
    if (
      actor.shopRole !== 'OWNER' &&
      !hasPermission(actor.perms ?? '', PERMISSIONS.SUBSCRIPTION_MANAGE)
    ) {
      throw new ForbiddenException(
        'Only the venue owner or a manager with billing access can manage billing.',
      );
    }
  }

  private assertDualEnabled() {
    if (!isDualBillingEnabled(this.config)) {
      throw new ServiceUnavailableException(
        'Dual-provider billing is not enabled. Set BILLING_ENABLED=true.',
      );
    }
  }

  private webAppBase(): string {
    return (
      this.config.get<string>('WEB_APP_URL') ??
      this.config.get<string>('WEB_ORIGIN') ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private resolveProvider(
    preferred?: string | null,
  ): BillingProviderChoice {
    if (preferred === 'STRIPE' || preferred === 'MOLLIE') {
      return preferred;
    }
    const adapter = this.registry.defaultProvider();
    if (!adapter) {
      throw new ServiceUnavailableException(
        'No billing provider is configured. Enable Stripe and/or Mollie.',
      );
    }
    return adapter.provider;
  }

  listProviders(actor?: JwtAccessPayload) {
    if (actor) this.assertBillingManage(actor);
    this.assertDualEnabled();
    const cfg = readBillingConfig(this.config);
    return {
      enabled: cfg.enabled,
      defaultProvider: cfg.defaultProvider,
      providers: this.registry.listEnabled().map((a) => a.provider),
      gracePeriodDays: cfg.gracePeriodDays,
    };
  }

  async getCatalog(actor: JwtAccessPayload, currency?: string) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found.');
    return this.catalog.listCatalog(
      currency?.trim() || shop.currency || 'EUR',
    );
  }

  async getSubscription(actor: JwtAccessPayload, shopId: string) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    const sub = await this.prisma.billingSubscription.findFirst({
      where: {
        shopId,
        canonicalStatus: {
          notIn: ['CANCELED', 'EXPIRED', 'INCOMPLETE_EXPIRED', 'DRAFT'],
        },
      },
      include: {
        addOns: true,
        billingAccount: {
          include: {
            paymentMethods: { orderBy: { isDefault: 'desc' }, take: 3 },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!sub) {
      const any = await this.prisma.billingSubscription.findFirst({
        where: { shopId },
        include: {
          addOns: true,
          billingAccount: {
            include: {
              paymentMethods: { orderBy: { isDefault: 'desc' }, take: 3 },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return { subscription: any };
    }
    return { subscription: sub };
  }

  async listPayments(actor: JwtAccessPayload, shopId: string, take = 40) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    const items = await this.prisma.billingPayment.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 100),
    });
    return { items };
  }

  async getCheckoutStatus(
    actor: JwtAccessPayload,
    shopId: string,
    operationId: string,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    const op = await this.prisma.billingOperation.findFirst({
      where: { id: operationId, shopId },
    });
    if (!op) throw new NotFoundException('Checkout operation not found.');
    return {
      id: op.id,
      status: op.status,
      operationType: op.operationType,
      response: op.responseJson,
      expiresAt: op.expiresAt,
      createdAt: op.createdAt,
    };
  }

  async createCheckout(
    actor: JwtAccessPayload,
    shopId: string,
    dto: CheckoutDto,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    if (requireShopId(actor) !== shopId) {
      throw new ForbiddenException('Shop mismatch.');
    }

    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_CHECKOUT,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
        requireKey: true,
      },
      () => this.runCreateCheckout(actor, shopId, dto, idempotencyKey),
    );
  }

  private async runCreateCheckout(
    actor: JwtAccessPayload,
    shopId: string,
    dto: CheckoutDto,
    idempotencyKey?: string | null,
  ) {
    if (!dto.packId || !dto.renewalMode) {
      throw new BadRequestException(
        'packId and renewalMode are required for dual-provider checkout.',
      );
    }
    if (
      dto.renewalMode === 'AUTOMATIC_RENEWAL' &&
      dto.autoRenewConsent !== true
    ) {
      throw new BadRequestException(
        'autoRenewConsent must be true for automatic renewal.',
      );
    }

    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { owner: true },
    });
    if (!shop) throw new NotFoundException('Shop not found.');

    const currency = (dto.currency || shop.currency || 'EUR').toUpperCase();
    const quote = await this.catalog.quote({
      packId: dto.packId,
      addOnIds: dto.addOnIds ?? [],
      seatQuantity: dto.seatQuantity,
      currency,
    });

    const provider = this.resolveProvider(dto.provider);
    const adapter = this.registry.get(provider);
    const renewalMode =
      dto.renewalMode === 'MANUAL_MONTHLY'
        ? BillingRenewalMode.MANUAL_MONTHLY
        : BillingRenewalMode.AUTOMATIC_RENEWAL;

    const requestHash = hashIdempotencyRequest(dto);
    const opKey = idempotencyKey?.trim() || requestHash;

    const existingOp = await this.prisma.billingOperation.findUnique({
      where: {
        shopId_operationType_idempotencyKey: {
          shopId,
          operationType: 'checkout',
          idempotencyKey: opKey,
        },
      },
    });
    if (
      existingOp &&
      existingOp.status === BillingOperationStatus.COMPLETED &&
      existingOp.responseJson
    ) {
      return existingOp.responseJson as Record<string, unknown>;
    }

    const { billingSub, account, operation } = await this.prisma.$transaction(
      async (tx) => {
        await this.lockAndAssertNoLiveConflict(tx, shopId, {
          allowCancelAtPeriodEnd: Boolean(
            (dto as CheckoutDto & { _allowCancelAtPeriodEnd?: boolean })
              ._allowCancelAtPeriodEnd,
          ),
        });

        let account = await tx.billingAccount.findUnique({
          where: {
            shopId_provider: { shopId, provider },
          },
        });
        if (!account) {
          account = await this.createPlaceholderAccount(
            tx,
            shopId,
            provider,
            shop.owner.email,
          );
        }

        const billingSub = await tx.billingSubscription.create({
          data: {
            shopId,
            billingAccountId: account.id,
            provider,
            planId: quote.packId,
            renewalMode,
            canonicalStatus: 'DRAFT',
            currency: quote.currency,
            amountMinor: quote.amountMinor,
            seatQuantity: quote.seatQuantity,
            autoRenewConsentAt:
              renewalMode === BillingRenewalMode.AUTOMATIC_RENEWAL
                ? new Date()
                : null,
            addOns: {
              create: quote.addOnIds.map((id) => ({
                addOnId: id,
                quantity:
                  id === 'team_accounts' ? Math.max(1, quote.seatQuantity) : 1,
                unitAmountMinor: Math.round(
                  (VENUE_ADD_ONS[id as AddOnId]?.monthlyPrice ?? 0) * 100,
                ),
              })),
            },
          },
          include: { addOns: true },
        });

        assertSubscriptionTransition('DRAFT', 'CHECKOUT_PENDING');
        await tx.billingSubscription.update({
          where: { id: billingSub.id },
          data: { canonicalStatus: 'CHECKOUT_PENDING' },
        });

        const operation = await tx.billingOperation.create({
          data: {
            shopId,
            operationType: 'checkout',
            idempotencyKey: opKey,
            requestHash,
            status: BillingOperationStatus.PENDING,
            expiresAt: new Date(Date.now() + OPERATION_TTL_MS),
          },
        });

        return { billingSub, account, operation };
      },
    );

    const successUrl = `${this.webAppBase()}/dashboard/${shop.slug}/subscription?billing=confirming&op=${operation.id}`;
    const cancelUrl = `${this.webAppBase()}/dashboard/${shop.slug}/subscription?billing=cancel`;

    const metadata: Record<string, string> = {
      shop_id: shopId,
      billing_subscription_id: billingSub.id,
      pack_id: quote.packId,
      add_ons: quote.addOnIds.join(','),
      seat_quantity: String(quote.seatQuantity),
      renewal_mode: renewalMode,
      amount_eur: String(quote.amountEur),
      fx_rate: String(quote.fxRate),
    };

    const priceId =
      quote.lineItems.find((l) => l.kind === 'pack')?.stripePriceId ??
      this.catalog.resolveStripePriceId(`pack:${quote.packId}`, quote.currency);

    try {
      const checkout =
        renewalMode === BillingRenewalMode.MANUAL_MONTHLY
          ? await adapter.createManualPaymentCheckout({
              shopId,
              email: shop.owner.email,
              name: shop.owner.name,
              customerId: account.providerCustomerId.startsWith('pending_')
                ? null
                : account.providerCustomerId,
              successUrl,
              cancelUrl,
              amountMinor: quote.amountMinor,
              currency: quote.currency,
              description: `GoSpots ${quote.packId} (manual monthly)`,
              metadata,
            })
          : await adapter.createAutomaticSubscriptionCheckout({
              shopId,
              email: shop.owner.email,
              name: shop.owner.name,
              customerId: account.providerCustomerId.startsWith('pending_')
                ? null
                : account.providerCustomerId,
              successUrl,
              cancelUrl,
              amountMinor: quote.amountMinor,
              currency: quote.currency,
              description: `GoSpots ${quote.packId}`,
              priceId,
              metadata,
              trialDays: dto.trialDays,
              interval: 'month',
            });

      if (checkout.providerCustomerId) {
        await this.prisma.billingAccount.update({
          where: { id: account.id },
          data: {
            providerCustomerId: checkout.providerCustomerId,
            billingEmail: shop.owner.email,
          },
        });
      }

      await this.prisma.billingSubscription.update({
        where: { id: billingSub.id },
        data: {
          providerSubscriptionId: checkout.providerSubscriptionId ?? undefined,
          providerPriceId: priceId ?? undefined,
        },
      });

      if (checkout.providerPaymentId || checkout.providerCheckoutId) {
        await this.prisma.billingPayment.create({
          data: {
            shopId,
            subscriptionId: billingSub.id,
            provider,
            providerPaymentId: checkout.providerPaymentId ?? null,
            providerCheckoutId: checkout.providerCheckoutId ?? null,
            canonicalStatus: 'OPEN',
            amountMinor: quote.amountMinor,
            currency: quote.currency,
            actionUrl: checkout.url,
            requiresCustomerAction: true,
          },
        });
      }

      const response = {
        url: checkout.url,
        mode: checkout.mode,
        provider,
        operationId: operation.id,
        billingSubscriptionId: billingSub.id,
        amount: quote.amount,
        amountMinor: quote.amountMinor,
        amountEur: quote.amountEur,
        currency: quote.currency,
        renewalMode,
      };

      await this.prisma.billingOperation.update({
        where: { id: operation.id },
        data: {
          status: BillingOperationStatus.COMPLETED,
          responseJson: response,
        },
      });

      await this.audit.record(actor, {
        section: 'subscription',
        action: 'billing.checkout_start',
        summary: `Started ${provider} checkout for ${quote.packId}`,
        meta: {
          provider,
          billingSubscriptionId: billingSub.id,
          operationId: operation.id,
          amountMinor: quote.amountMinor,
          currency: quote.currency,
        },
      });

      await this.notifications.notify({
        shopId,
        subscriptionId: billingSub.id,
        kind: 'checkout_started',
        dedupeKey: `checkout_started:${billingSub.id}`,
      });

      return response;
    } catch (err) {
      await this.prisma.billingSubscription.update({
        where: { id: billingSub.id },
        data: { canonicalStatus: 'PROVIDER_ERROR' },
      });
      await this.prisma.billingOperation.update({
        where: { id: operation.id },
        data: {
          status: BillingOperationStatus.FAILED,
          responseJson: {
            error: err instanceof Error ? err.message : String(err),
          },
        },
      });
      throw err;
    }
  }

  async cancel(
    actor: JwtAccessPayload,
    shopId: string,
    dto: CancelDto,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_CANCEL,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.runCancel(actor, shopId, dto),
    );
  }

  private async runCancel(
    actor: JwtAccessPayload,
    shopId: string,
    dto: CancelDto,
  ) {
    const locked = await this.lockLiveSubscription(shopId);
    const adapter = this.registry.get(locked.provider as BillingProviderChoice);
    const customerId = locked.billingAccount.providerCustomerId;

    if (dto.timing === 'IMMEDIATE') {
      if (!locked.providerSubscriptionId) {
        assertSubscriptionTransition(locked.canonicalStatus, 'CANCELED');
        const updated = await this.prisma.billingSubscription.update({
          where: { id: locked.id },
          data: {
            canonicalStatus: 'CANCELED',
            canceledAt: new Date(),
            cancelAtPeriodEnd: false,
            version: { increment: 1 },
          },
          include: { addOns: true },
        });
        await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);
      } else {
        const remote = await adapter.cancelImmediately(
          locked.providerSubscriptionId,
          customerId,
        );
        assertSubscriptionTransition(locked.canonicalStatus, 'CANCELED');
        const updated = await this.prisma.billingSubscription.update({
          where: { id: locked.id },
          data: {
            canonicalStatus: 'CANCELED',
            providerStatus: remote.status,
            canceledAt: new Date(),
            cancelAtPeriodEnd: false,
            version: { increment: 1 },
          },
          include: { addOns: true },
        });
        await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);
      }
    } else {
      if (locked.providerSubscriptionId) {
        await adapter.cancelAtPeriodEnd(
          locked.providerSubscriptionId,
          customerId,
        );
      }
      assertSubscriptionTransition(
        locked.canonicalStatus,
        'CANCEL_AT_PERIOD_END',
      );
      const updated = await this.prisma.billingSubscription.update({
        where: { id: locked.id },
        data: {
          canonicalStatus: 'CANCEL_AT_PERIOD_END',
          cancelAtPeriodEnd: true,
          cancellationRequestedAt: new Date(),
          version: { increment: 1 },
        },
        include: { addOns: true },
      });
      await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);
    }

    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.cancel',
      summary: `Canceled subscription (${dto.timing})`,
      meta: { timing: dto.timing, billingSubscriptionId: locked.id },
    });

    if (dto.timing === 'IMMEDIATE') {
      await this.notifications.notify({
        shopId,
        subscriptionId: locked.id,
        kind: 'canceled',
        dedupeKey: `canceled:${locked.id}:${Date.now()}`,
      });
    }

    return this.getSubscription(actor, shopId);
  }

  async pause(
    actor: JwtAccessPayload,
    shopId: string,
    dto: PauseDto,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_PAUSE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(dto ?? {}),
      },
      () => this.runPause(actor, shopId, dto),
    );
  }

  private async runPause(
    actor: JwtAccessPayload,
    shopId: string,
    dto: PauseDto,
  ) {
    const locked = await this.lockLiveSubscription(shopId);
    if (!locked.providerSubscriptionId) {
      throw new BadRequestException('No provider subscription to pause.');
    }
    const adapter = this.registry.get(locked.provider as BillingProviderChoice);
    assertSubscriptionTransition(locked.canonicalStatus, 'PAUSE_PENDING');
    await this.prisma.billingSubscription.update({
      where: { id: locked.id },
      data: { canonicalStatus: 'PAUSE_PENDING' },
    });

    const result = await adapter.pause(
      locked.providerSubscriptionId,
      locked.billingAccount.providerCustomerId,
    );

    const resumeAt =
      dto.resumeAt && !Number.isNaN(Date.parse(dto.resumeAt))
        ? new Date(dto.resumeAt)
        : null;

    assertSubscriptionTransition('PAUSE_PENDING', 'PAUSED');
    const updated = await this.prisma.billingSubscription.update({
      where: { id: locked.id },
      data: {
        canonicalStatus: 'PAUSED',
        providerStatus: result.providerStatus ?? undefined,
        providerSubscriptionId:
          result.localNote === 'PAUSED'
            ? null
            : (result.providerSubscriptionId ?? locked.providerSubscriptionId),
        pausedAt: new Date(),
        resumeAt,
        version: { increment: 1 },
      },
      include: { addOns: true },
    });
    await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);

    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.pause',
      summary: 'Paused subscription',
      meta: { billingSubscriptionId: locked.id },
    });
    await this.notifications.notify({
      shopId,
      subscriptionId: locked.id,
      kind: 'paused',
      dedupeKey: `paused:${locked.id}:${updated.version}`,
    });

    return this.getSubscription(actor, shopId);
  }

  async resume(
    actor: JwtAccessPayload,
    shopId: string,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_RESUME,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ action: 'resume' }),
      },
      () => this.runResume(actor, shopId),
    );
  }

  private async runResume(actor: JwtAccessPayload, shopId: string) {
    const locked = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "BillingSubscription"
        WHERE "shopId" = ${shopId}
          AND "canonicalStatus" IN ('PAUSED', 'PAUSE_PENDING')
        ORDER BY "updatedAt" DESC
        LIMIT 1
        FOR UPDATE
      `;
      if (!rows[0]) {
        throw new NotFoundException('No paused subscription to resume.');
      }
      return tx.billingSubscription.findUniqueOrThrow({
        where: { id: rows[0].id },
        include: { billingAccount: true, addOns: true },
      });
    });

    const adapter = this.registry.get(locked.provider as BillingProviderChoice);
    assertSubscriptionTransition(locked.canonicalStatus, 'RESUME_PENDING');
    await this.prisma.billingSubscription.update({
      where: { id: locked.id },
      data: { canonicalStatus: 'RESUME_PENDING' },
    });

    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
    });

    const resumed = await adapter.resume({
      subscriptionId: locked.providerSubscriptionId,
      customerId: locked.billingAccount.providerCustomerId,
      amountMinor: locked.amountMinor,
      currency: locked.currency,
      description: `GoSpots ${locked.planId}`,
      interval: 'month',
      metadata: {
        shop_id: shopId,
        billing_subscription_id: locked.id,
        pack_id: locked.planId,
      },
    });

    assertSubscriptionTransition('RESUME_PENDING', 'ACTIVE');
    const updated = await this.prisma.billingSubscription.update({
      where: { id: locked.id },
      data: {
        canonicalStatus: 'ACTIVE',
        providerSubscriptionId: resumed.providerSubscriptionId,
        providerStatus: resumed.providerStatus ?? undefined,
        pausedAt: null,
        resumeAt: null,
        version: { increment: 1 },
      },
      include: { addOns: true },
    });
    await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);

    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.resume',
      summary: 'Resumed subscription',
      meta: { billingSubscriptionId: locked.id, slug: shop.slug },
    });
    await this.notifications.notify({
      shopId,
      subscriptionId: locked.id,
      kind: 'resumed',
      dedupeKey: `resumed:${locked.id}:${updated.version}`,
    });

    return this.getSubscription(actor, shopId);
  }

  async changePlan(
    actor: JwtAccessPayload,
    shopId: string,
    dto: ChangePlanDto,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_CHANGE_PLAN,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.runChangePlan(actor, shopId, dto),
    );
  }

  private async runChangePlan(
    actor: JwtAccessPayload,
    shopId: string,
    dto: ChangePlanDto,
  ) {
    const locked = await this.lockLiveSubscription(shopId);
    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
    });
    const quote = await this.catalog.quote({
      packId: dto.packId,
      addOnIds: dto.addOnIds ?? [],
      seatQuantity: dto.seatQuantity ?? locked.seatQuantity,
      currency: locked.currency,
    });

    // Schedule at period end on entitlement Subscription pending* fields.
    await this.prisma.subscription.update({
      where: { shopId },
      data: {
        pendingPackId: quote.packId,
        pendingAddOns: quote.addOnIds.join(','),
        pendingStaffSeatQuantity: quote.seatQuantity,
      } as never,
    });

    // If Stripe/Mollie supports live update and period end is far, still stage pending.
    if (locked.providerSubscriptionId && locked.provider === 'STRIPE') {
      const adapter = this.registry.get('STRIPE');
      const priceId =
        quote.lineItems.find((l) => l.kind === 'pack')?.stripePriceId ??
        this.catalog.resolveStripePriceId(`pack:${quote.packId}`, quote.currency);
      // Stripe proration applied; pending fields remain for entitlement pack sync at period end.
      await adapter.updateSubscription({
        subscriptionId: locked.providerSubscriptionId,
        customerId: locked.billingAccount.providerCustomerId,
        priceId,
        amountMinor: quote.amountMinor,
        currency: quote.currency,
        description: `GoSpots ${quote.packId}`,
        metadata: {
          shop_id: shopId,
          billing_subscription_id: locked.id,
          pack_id: quote.packId,
          pending_at_period_end: '1',
        },
      });
    }

    await this.prisma.billingSubscription.update({
      where: { id: locked.id },
      data: {
        amountMinor: quote.amountMinor,
        seatQuantity: quote.seatQuantity,
        version: { increment: 1 },
      },
    });

    await this.prisma.billingSubscriptionAddOn.deleteMany({
      where: { subscriptionId: locked.id },
    });
    if (quote.addOnIds.length) {
      await this.prisma.billingSubscriptionAddOn.createMany({
        data: quote.addOnIds.map((id) => ({
          subscriptionId: locked.id,
          addOnId: id,
          quantity:
            id === 'team_accounts' ? Math.max(1, quote.seatQuantity) : 1,
          unitAmountMinor: Math.round(
            (VENUE_ADD_ONS[id as AddOnId]?.monthlyPrice ?? 0) * 100,
          ),
        })),
      });
    }

    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.change_plan',
      summary: `Scheduled plan change to ${quote.packId}`,
      meta: { packId: quote.packId, slug: shop.slug },
    });
    await this.notifications.notify({
      shopId,
      subscriptionId: locked.id,
      kind: 'plan_change_scheduled',
      periodEnd: locked.currentPeriodEnd,
      dedupeKey: `plan_change:${locked.id}:${quote.packId}:${locked.currentPeriodEnd?.toISOString() ?? 'none'}`,
    });

    return this.getSubscription(actor, shopId);
  }

  async changeRenewalMode(
    actor: JwtAccessPayload,
    shopId: string,
    dto: ChangeRenewalModeDto,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_CHANGE_RENEWAL_MODE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.runChangeRenewalMode(actor, shopId, dto),
    );
  }

  private async runChangeRenewalMode(
    actor: JwtAccessPayload,
    shopId: string,
    dto: ChangeRenewalModeDto,
  ) {
    if (
      dto.renewalMode === 'AUTOMATIC_RENEWAL' &&
      dto.autoRenewConsent !== true
    ) {
      throw new BadRequestException(
        'autoRenewConsent must be true for automatic renewal.',
      );
    }
    const locked = await this.lockLiveSubscription(shopId);
    const renewalMode =
      dto.renewalMode === 'MANUAL_MONTHLY'
        ? BillingRenewalMode.MANUAL_MONTHLY
        : BillingRenewalMode.AUTOMATIC_RENEWAL;

    // Apply at period end conceptually — persist now; provider switch for Mollie
    // mandate happens on next renewal / resume.
    const updated = await this.prisma.billingSubscription.update({
      where: { id: locked.id },
      data: {
        renewalMode,
        autoRenewConsentAt:
          renewalMode === BillingRenewalMode.AUTOMATIC_RENEWAL
            ? new Date()
            : null,
        version: { increment: 1 },
      },
      include: { addOns: true },
    });

    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.change_renewal_mode',
      summary: `Renewal mode → ${renewalMode}`,
      meta: { billingSubscriptionId: locked.id, renewalMode },
    });

    return { subscription: updated };
  }

  async switchProvider(
    actor: JwtAccessPayload,
    shopId: string,
    dto: SwitchProviderDto,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_SWITCH_PROVIDER,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.runSwitchProvider(actor, shopId, dto, idempotencyKey),
    );
  }

  private async runSwitchProvider(
    actor: JwtAccessPayload,
    shopId: string,
    dto: SwitchProviderDto,
    idempotencyKey?: string | null,
  ) {
    const locked = await this.lockLiveSubscription(shopId);
    if (locked.provider === dto.provider) {
      throw new BadRequestException('Already on that provider.');
    }

    // Schedule cancel of current at period end, then open checkout on target.
    if (locked.providerSubscriptionId) {
      const adapter = this.registry.get(
        locked.provider as BillingProviderChoice,
      );
      await adapter.cancelAtPeriodEnd(
        locked.providerSubscriptionId,
        locked.billingAccount.providerCustomerId,
      );
    }
    if (canTransition(locked.canonicalStatus, 'CANCEL_AT_PERIOD_END')) {
      assertSubscriptionTransition(
        locked.canonicalStatus,
        'CANCEL_AT_PERIOD_END',
      );
      await this.prisma.billingSubscription.update({
        where: { id: locked.id },
        data: {
          canonicalStatus: 'CANCEL_AT_PERIOD_END',
          cancelAtPeriodEnd: true,
          cancellationRequestedAt: new Date(),
          version: { increment: 1 },
        },
      });
    }

    const addOns = locked.addOns.map((a) => a.addOnId);
    const checkoutDto: CheckoutDto & { _allowCancelAtPeriodEnd?: boolean } = {
      packId: locked.planId,
      addOnIds: addOns,
      seatQuantity: locked.seatQuantity,
      provider: dto.provider,
      renewalMode:
        dto.renewalMode ??
        (locked.renewalMode === BillingRenewalMode.MANUAL_MONTHLY
          ? 'MANUAL_MONTHLY'
          : 'AUTOMATIC_RENEWAL'),
      currency: locked.currency,
      autoRenewConsent:
        dto.autoRenewConsent ??
        ((dto.renewalMode ??
          (locked.renewalMode === BillingRenewalMode.MANUAL_MONTHLY
            ? 'MANUAL_MONTHLY'
            : 'AUTOMATIC_RENEWAL')) !== 'MANUAL_MONTHLY'
          ? true
          : undefined),
      _allowCancelAtPeriodEnd: true,
    };

    await this.notifications.notify({
      shopId,
      subscriptionId: locked.id,
      kind: 'provider_switch_scheduled',
      periodEnd: locked.currentPeriodEnd,
      dedupeKey: `provider_switch:${locked.id}:${dto.provider}:${locked.currentPeriodEnd?.toISOString() ?? 'none'}`,
    });

    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.switch_provider',
      summary: `Switch provider → ${dto.provider}`,
      meta: { from: locked.provider, to: dto.provider },
    });

    return this.runCreateCheckout(
      actor,
      shopId,
      checkoutDto,
      idempotencyKey
        ? `${idempotencyKey}:target-checkout`
        : `switch:${locked.id}:${dto.provider}`,
    );
  }

  async createManualRenewalCheckout(
    actor: JwtAccessPayload,
    shopId: string,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_MANUAL_RENEWAL,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ action: 'manual-renewal' }),
        requireKey: true,
      },
      () => this.runManualRenewal(actor, shopId, idempotencyKey),
    );
  }

  private async runManualRenewal(
    actor: JwtAccessPayload,
    shopId: string,
    idempotencyKey?: string | null,
  ) {
    const locked = await this.lockLiveSubscription(shopId);
    if (locked.renewalMode !== BillingRenewalMode.MANUAL_MONTHLY) {
      throw new BadRequestException(
        'Manual renewal checkout is only for MANUAL_MONTHLY subscriptions.',
      );
    }

    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      include: { owner: true },
    });
    const adapter = this.registry.get(locked.provider as BillingProviderChoice);
    const requestHash = hashIdempotencyRequest({
      action: 'manual-renewal',
      subId: locked.id,
      periodEnd: locked.currentPeriodEnd?.toISOString() ?? null,
    });
    const opKey =
      idempotencyKey?.trim() ||
      `manual-renewal:${locked.id}:${locked.currentPeriodEnd?.toISOString() ?? 'open'}`;

    const operation = await this.prisma.billingOperation.create({
      data: {
        shopId,
        operationType: 'manual_renewal',
        idempotencyKey: opKey,
        requestHash,
        status: BillingOperationStatus.PENDING,
        expiresAt: new Date(Date.now() + OPERATION_TTL_MS),
      },
    });

    const successUrl = `${this.webAppBase()}/dashboard/${shop.slug}/subscription?billing=confirming&op=${operation.id}`;
    const cancelUrl = `${this.webAppBase()}/dashboard/${shop.slug}/subscription?billing=cancel`;

    try {
      const checkout = await adapter.createManualPaymentCheckout({
        shopId,
        email: shop.owner.email,
        name: shop.owner.name,
        customerId: locked.billingAccount.providerCustomerId.startsWith(
          'pending_',
        )
          ? null
          : locked.billingAccount.providerCustomerId,
        successUrl,
        cancelUrl,
        amountMinor: locked.amountMinor,
        currency: locked.currency,
        description: `GoSpots ${locked.planId} renewal`,
        metadata: {
          shop_id: shopId,
          billing_subscription_id: locked.id,
          pack_id: locked.planId,
          purpose: 'manual_renewal',
        },
      });

      if (checkout.providerCustomerId) {
        await this.prisma.billingAccount.update({
          where: { id: locked.billingAccountId },
          data: { providerCustomerId: checkout.providerCustomerId },
        });
      }

      await this.prisma.billingPayment.create({
        data: {
          shopId,
          subscriptionId: locked.id,
          provider: locked.provider,
          providerPaymentId: checkout.providerPaymentId ?? null,
          providerCheckoutId: checkout.providerCheckoutId ?? null,
          canonicalStatus: 'OPEN',
          amountMinor: locked.amountMinor,
          currency: locked.currency,
          actionUrl: checkout.url,
          requiresCustomerAction: true,
          sequenceType: 'manual_renewal',
        },
      });

      const response = {
        url: checkout.url,
        mode: checkout.mode,
        provider: locked.provider,
        operationId: operation.id,
        billingSubscriptionId: locked.id,
        amountMinor: locked.amountMinor,
        currency: locked.currency,
      };

      await this.prisma.billingOperation.update({
        where: { id: operation.id },
        data: {
          status: BillingOperationStatus.COMPLETED,
          responseJson: response,
        },
      });

      await this.audit.record(actor, {
        section: 'subscription',
        action: 'billing.manual_renewal_checkout',
        summary: 'Started manual renewal checkout',
        meta: { billingSubscriptionId: locked.id, operationId: operation.id },
      });

      return response;
    } catch (err) {
      await this.prisma.billingOperation.update({
        where: { id: operation.id },
        data: {
          status: BillingOperationStatus.FAILED,
          responseJson: {
            error: err instanceof Error ? err.message : String(err),
          },
        },
      });
      throw err;
    }
  }

  async updatePaymentMethod(
    actor: JwtAccessPayload,
    shopId: string,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_PAYMENT_METHOD_UPDATE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ action: 'payment-method' }),
      },
      () => this.runUpdatePaymentMethod(actor, shopId),
    );
  }

  private async runUpdatePaymentMethod(
    actor: JwtAccessPayload,
    shopId: string,
  ) {
    const locked = await this.lockLiveSubscription(shopId);
    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
    });
    const adapter = this.registry.get(locked.provider as BillingProviderChoice);
    const returnUrl = `${this.webAppBase()}/dashboard/${shop.slug}/subscription?billing=payment-method`;
    const portal = await adapter.changePaymentMethod({
      customerId: locked.billingAccount.providerCustomerId,
      returnUrl,
      subscriptionId: locked.providerSubscriptionId ?? undefined,
    });
    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.payment_method_update',
      summary: 'Opened payment method update',
      meta: { provider: locked.provider },
    });
    return { url: portal.url, mode: 'portal' as const };
  }

  async openStripeCustomerPortal(
    actor: JwtAccessPayload,
    shopId: string,
    idempotencyKey?: string | null,
  ) {
    this.assertBillingManage(actor);
    this.assertDualEnabled();
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.BILLING_STRIPE_PORTAL,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ action: 'stripe-portal' }),
      },
      () => this.runStripePortal(actor, shopId),
    );
  }

  private async runStripePortal(actor: JwtAccessPayload, shopId: string) {
    const account = await this.prisma.billingAccount.findUnique({
      where: { shopId_provider: { shopId, provider: BillingProvider.STRIPE } },
    });
    if (!account || account.providerCustomerId.startsWith('pending_')) {
      throw new BadRequestException(
        'No Stripe customer for this venue yet. Complete checkout first.',
      );
    }
    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
    });
    const adapter = this.registry.get('STRIPE');
    if (!adapter.createCustomerManagementSession) {
      throw new ServiceUnavailableException(
        'Stripe customer portal is unavailable.',
      );
    }
    const returnUrl = `${this.webAppBase()}/dashboard/${shop.slug}/subscription`;
    const portal = await adapter.createCustomerManagementSession({
      customerId: account.providerCustomerId,
      returnUrl,
    });
    await this.audit.record(actor, {
      section: 'subscription',
      action: 'billing.stripe_portal',
      summary: 'Opened Stripe customer portal',
      meta: {},
    });
    return { url: portal.url, mode: 'portal' as const };
  }

  /** Used by webhook processor after Mollie first payment succeeds. */
  async ensureMollieSubscriptionAfterMandate(input: {
    shopId: string;
    billingSubscriptionId: string;
    customerId: string;
  }) {
    const sub = await this.prisma.billingSubscription.findFirst({
      where: { id: input.billingSubscriptionId, shopId: input.shopId },
    });
    if (!sub || sub.provider !== 'MOLLIE') return null;
    if (sub.providerSubscriptionId) return sub;
    if (sub.renewalMode !== BillingRenewalMode.AUTOMATIC_RENEWAL) return sub;

    const created = await this.mollie.createSubscriptionAfterMandate({
      customerId: input.customerId,
      amountMinor: sub.amountMinor,
      currency: sub.currency,
      description: `GoSpots ${sub.planId}`,
      metadata: {
        shop_id: input.shopId,
        billing_subscription_id: sub.id,
        pack_id: sub.planId,
      },
    });

    return this.prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        providerSubscriptionId: created.id,
        providerStatus: created.status,
        currentPeriodStart: created.currentPeriodStart,
        currentPeriodEnd: created.currentPeriodEnd,
        nextBillingAt: created.currentPeriodEnd,
      },
      include: { addOns: true },
    });
  }

  /**
   * Cron: auto-resume PAUSED subscriptions whose resumeAt has elapsed.
   */
  async resumeDuePausedSubscriptions(now = new Date()) {
    const due = await this.prisma.billingSubscription.findMany({
      where: {
        canonicalStatus: 'PAUSED',
        resumeAt: { lte: now },
      },
      take: 40,
      select: { id: true, shopId: true },
    });
    let resumed = 0;
    for (const row of due) {
      try {
        await this.runResumeSystem(row.shopId);
        resumed += 1;
      } catch (err) {
        // Leave PAUSED; operators see audit/logs. Owner can still resume manually.
        await this.audit.recordForShop(row.shopId, {
          section: 'subscription',
          action: 'billing.resume_scheduled_failed',
          summary: 'Scheduled resume failed',
          meta: {
            billingSubscriptionId: row.id,
            error: err instanceof Error ? err.message.slice(0, 500) : String(err),
          },
          actorName: 'Billing jobs',
        });
      }
    }
    return resumed;
  }

  private async runResumeSystem(shopId: string) {
    // Reuse owner resume path without JWT — audit via recordForShop.
    const locked = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "BillingSubscription"
        WHERE "shopId" = ${shopId}
          AND "canonicalStatus" IN ('PAUSED', 'PAUSE_PENDING')
        ORDER BY "updatedAt" DESC
        LIMIT 1
        FOR UPDATE
      `;
      if (!rows[0]) {
        throw new NotFoundException('No paused subscription to resume.');
      }
      return tx.billingSubscription.findUniqueOrThrow({
        where: { id: rows[0].id },
        include: { billingAccount: true, addOns: true },
      });
    });

    const adapter = this.registry.get(locked.provider as BillingProviderChoice);
    assertSubscriptionTransition(locked.canonicalStatus, 'RESUME_PENDING');
    await this.prisma.billingSubscription.update({
      where: { id: locked.id },
      data: { canonicalStatus: 'RESUME_PENDING' },
    });

    const resumed = await adapter.resume({
      subscriptionId: locked.providerSubscriptionId,
      customerId: locked.billingAccount.providerCustomerId,
      amountMinor: locked.amountMinor,
      currency: locked.currency,
      description: `GoSpots ${locked.planId}`,
      interval: 'month',
      metadata: {
        shop_id: shopId,
        billing_subscription_id: locked.id,
        pack_id: locked.planId,
      },
    });

    assertSubscriptionTransition('RESUME_PENDING', 'ACTIVE');
    const updated = await this.prisma.billingSubscription.update({
      where: { id: locked.id },
      data: {
        canonicalStatus: 'ACTIVE',
        providerSubscriptionId: resumed.providerSubscriptionId,
        providerStatus: resumed.providerStatus ?? undefined,
        pausedAt: null,
        resumeAt: null,
        version: { increment: 1 },
      },
      include: { addOns: true },
    });
    await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);
    await this.audit.recordForShop(shopId, {
      section: 'subscription',
      action: 'billing.resume_scheduled',
      summary: 'Resumed subscription on schedule',
      meta: { billingSubscriptionId: locked.id },
      actorName: 'Billing jobs',
    });
    await this.notifications.notify({
      shopId,
      subscriptionId: locked.id,
      kind: 'resumed',
      dedupeKey: `resumed_scheduled:${locked.id}:${updated.version}`,
    });
  }

  async getHealth() {
    const cfg = readBillingConfig(this.config);
    const [dead, failed, pendingOps, pastDue] = await Promise.all([
      this.prisma.billingWebhookEvent.count({
        where: { status: 'DEAD' },
      }),
      this.prisma.billingWebhookEvent.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.billingOperation.count({
        where: { status: BillingOperationStatus.PENDING },
      }),
      this.prisma.billingSubscription.count({
        where: { canonicalStatus: 'PAST_DUE' },
      }),
    ]);
    return {
      dualBillingEnabled: cfg.enabled,
      stripeEnabled: cfg.stripeEnabled,
      mollieEnabled: cfg.mollieEnabled,
      lemonEnabled: cfg.lemonEnabled,
      stripeConfigured: Boolean(
        this.config.get<string>('STRIPE_SECRET_KEY')?.trim(),
      ),
      mollieConfigured: Boolean(
        this.config.get<string>('MOLLIE_API_KEY')?.trim(),
      ),
      webhookDead: dead,
      webhookFailed: failed,
      pendingOperations: pendingOps,
      pastDueSubscriptions: pastDue,
      gracePeriodDays: cfg.gracePeriodDays,
    };
  }

  async listBillingAudit(actor: JwtAccessPayload, shopId: string, take = 50) {
    this.assertBillingManage(actor);
    requireShopId(actor);
    const items = await this.prisma.auditLog.findMany({
      where: {
        shopId,
        section: 'subscription',
        OR: [
          { action: { startsWith: 'billing.' } },
          { action: { contains: 'subscription' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
    return { items };
  }

  private async createPlaceholderAccount(
    tx: TxClient,
    shopId: string,
    provider: BillingProvider,
    email: string,
  ) {
    const pendingId = `pending_${createHash('sha256')
      .update(`${shopId}:${provider}:${Date.now()}`)
      .digest('hex')
      .slice(0, 24)}`;
    return tx.billingAccount.create({
      data: {
        shopId,
        provider,
        providerCustomerId: pendingId,
        billingEmail: email,
      },
    });
  }

  private async lockAndAssertNoLiveConflict(
    tx: TxClient,
    shopId: string,
    opts?: { allowCancelAtPeriodEnd?: boolean },
  ) {
    // Always lock candidate live rows so concurrent checkouts serialize.
    const rows = await tx.$queryRaw<
      Array<{ id: string; canonicalStatus: string }>
    >`
      SELECT id, "canonicalStatus" FROM "BillingSubscription"
      WHERE "shopId" = ${shopId}
        AND "canonicalStatus" IN ('ACTIVE','TRIALING','PAST_DUE','CANCEL_AT_PERIOD_END')
      FOR UPDATE
    `;
    const blocking = opts?.allowCancelAtPeriodEnd
      ? rows.filter((r) => r.canonicalStatus !== 'CANCEL_AT_PERIOD_END')
      : rows;
    if (blocking.length > 0) {
      throw new ConflictException(
        'This venue already has an active billing subscription. Cancel, wait for period end, or use change-plan / switch-provider.',
      );
    }
  }

  private async lockLiveSubscription(shopId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "BillingSubscription"
        WHERE "shopId" = ${shopId}
          AND "canonicalStatus" IN ('ACTIVE','TRIALING','PAST_DUE','CANCEL_AT_PERIOD_END','PAUSED','PAUSE_PENDING','RESUME_PENDING')
        ORDER BY "updatedAt" DESC
        LIMIT 1
        FOR UPDATE
      `;
      if (!rows[0]) {
        throw new NotFoundException('No manageable billing subscription found.');
      }
      return tx.billingSubscription.findUniqueOrThrow({
        where: { id: rows[0].id },
        include: { billingAccount: true, addOns: true },
      });
    });
  }
}

function canTransition(
  from: BillingCanonicalSubscriptionStatus,
  to: BillingCanonicalSubscriptionStatus,
): boolean {
  try {
    assertSubscriptionTransition(from, to);
    return true;
  } catch {
    return false;
  }
}
