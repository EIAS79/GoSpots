import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingCanonicalPaymentStatus,
  BillingCanonicalSubscriptionStatus,
  BillingProvider,
  BillingRenewalMode,
  BillingWebhookProcessingStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import type Stripe from 'stripe';
import { readBillingConfig } from './billing-config';
import { BillingEntitlementSync } from './billing-entitlement.sync';
import { BillingNotificationService } from './billing-notification.service';
import { BillingOrchestratorService } from './billing-orchestrator.service';
import { BillingProviderRegistry } from './billing-provider.registry';
import {
  assertPaymentTransition,
  assertSubscriptionTransition,
  canTransitionPayment,
  canTransitionSubscription,
} from './billing-state-machine';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StripeBillingAdapter } from './providers/stripe.adapter';
import { MollieBillingAdapter } from './providers/mollie.adapter';

const STRIPE_PROVIDER = 'STRIPE';
const MOLLIE_PROVIDER = 'MOLLIE';

const STRIPE_HANDLED = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
  'invoice.created',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
]);

@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stripe: StripeBillingAdapter,
    private readonly mollie: MollieBillingAdapter,
    private readonly registry: BillingProviderRegistry,
    private readonly entitlements: BillingEntitlementSync,
    private readonly notifications: BillingNotificationService,
    private readonly orchestrator: BillingOrchestratorService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Verify Stripe signature → durable RECEIVED inbox → 200.
   * Processing happens asynchronously via BillingWebhookProcessor.
   */
  async ingestStripe(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ ok: true; duplicate?: boolean; eventId: string }> {
    let event: Stripe.Event;
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.warn(
        `Stripe webhook signature failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new UnauthorizedException('Invalid Stripe webhook signature.');
    }

    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const shopId = this.extractStripeShopId(event);
    return this.insertInbox({
      provider: STRIPE_PROVIDER,
      eventId: event.id,
      eventName: event.type,
      shopId,
      payloadHash,
      redactedPayload: {
        type: event.type,
        id: event.id,
        shopId,
        objectId: this.stripeObjectId(event),
      },
    });
  }

  /**
   * Mollie: body only carries payment id — fetch payment from API to verify.
   * Never trust body fields alone for money mutations.
   */
  async ingestMollie(
    body: unknown,
  ): Promise<{ ok: true; duplicate?: boolean; eventId: string }> {
    const paymentId = this.parseMolliePaymentId(body);
    if (!paymentId) {
      throw new BadRequestException('Mollie webhook missing payment id.');
    }

    // Verify by fetching from Mollie API (auth via API key).
    const payment = await this.mollie.retrievePayment(paymentId);
    const shopId =
      payment.metadata?.shop_id ||
      payment.metadata?.shopId ||
      null;
    const eventId = `mollie_payment_${payment.id}_${payment.status}`;
    const payloadHash = createHash('sha256')
      .update(`${payment.id}:${payment.status}:${payment.amountMinor}`)
      .digest('hex');

    return this.insertInbox({
      provider: MOLLIE_PROVIDER,
      eventId,
      eventName: `payment.${payment.status}`,
      shopId,
      payloadHash,
      redactedPayload: {
        paymentId: payment.id,
        status: payment.status,
        shopId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      },
      // Stash verified snapshot for the processor (no second trust of raw body).
      canonicalEntityId: payment.id,
    });
  }

  /** Claim + process one inbox row. PROCESSED only after mutations commit. */
  async processEvent(eventRowId: string): Promise<void> {
    const claimed = await this.claimEvent(eventRowId);
    if (!claimed) return;

    try {
      if (claimed.provider === STRIPE_PROVIDER) {
        await this.processStripeEvent(claimed);
      } else if (claimed.provider === MOLLIE_PROVIDER) {
        await this.processMollieEvent(claimed);
      } else {
        this.logger.log(
          `Skipping non dual-provider webhook ${claimed.provider}/${claimed.eventName}`,
        );
      }

      await this.prisma.billingWebhookEvent.update({
        where: { id: claimed.id },
        data: {
          status: BillingWebhookProcessingStatus.PROCESSED,
          processedAt: new Date(),
          lastError: null,
          nextAttemptAt: null,
        },
      });
    } catch (err) {
      const cfg = readBillingConfig(this.config);
      const attempts = claimed.attemptCount;
      const max = cfg.webhookMaxAttempts;
      const message = err instanceof Error ? err.message : String(err);
      const dead = attempts >= max;
      const backoffMs = Math.min(
        60 * 60 * 1000,
        1000 * Math.pow(2, Math.min(attempts, 10)),
      );

      this.logger.error(
        `Webhook ${claimed.id} failed (attempt ${attempts}/${max}): ${message}`,
      );

      await this.prisma.billingWebhookEvent.update({
        where: { id: claimed.id },
        data: {
          status: dead
            ? BillingWebhookProcessingStatus.DEAD
            : BillingWebhookProcessingStatus.FAILED,
          lastError: message.slice(0, 2000),
          nextAttemptAt: dead ? null : new Date(Date.now() + backoffMs),
        },
      });
    }
  }

  async processDueEvents(limit = 25): Promise<number> {
    const now = new Date();
    const due = await this.prisma.billingWebhookEvent.findMany({
      where: {
        OR: [
          { status: BillingWebhookProcessingStatus.RECEIVED },
          {
            status: BillingWebhookProcessingStatus.FAILED,
            nextAttemptAt: { lte: now },
          },
        ],
        provider: { in: [STRIPE_PROVIDER, MOLLIE_PROVIDER] },
      },
      orderBy: { receivedAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    for (const row of due) {
      await this.processEvent(row.id);
    }
    return due.length;
  }

  /**
   * Operator / owner dead-letter requeue. Resets DEAD → FAILED with immediate retry.
   */
  async requeueDeadLetter(
    actor: { sysRole?: string | null; shopRole?: string | null; shopId?: string | null },
    eventRowId: string,
  ): Promise<{ ok: true; eventId: string }> {
    const row = await this.prisma.billingWebhookEvent.findUnique({
      where: { id: eventRowId },
    });
    if (!row) {
      throw new BadRequestException('Webhook event not found.');
    }
    if (row.status !== BillingWebhookProcessingStatus.DEAD) {
      throw new BadRequestException('Only DEAD webhook events can be requeued.');
    }
    const isSuper = actor.sysRole === 'SUPER_ADMIN';
    const isOwnerOfShop =
      actor.shopRole === 'OWNER' &&
      row.shopId != null &&
      actor.shopId === row.shopId;
    if (!isSuper && !isOwnerOfShop) {
      throw new ForbiddenException(
        'Only the venue owner or a platform admin can requeue dead-letter webhooks.',
      );
    }

    await this.prisma.billingWebhookEvent.update({
      where: { id: row.id },
      data: {
        status: BillingWebhookProcessingStatus.FAILED,
        nextAttemptAt: new Date(),
        lastError: `Requeued by ${isSuper ? 'SUPER_ADMIN' : 'OWNER'}`,
      },
    });

    await this.processEvent(row.id);
    return { ok: true, eventId: row.eventId };
  }

  async deadLetterSummary(
    actor: { sysRole?: string | null; shopRole?: string | null; shopId?: string | null },
    limit = 50,
  ) {
    const isSuper = actor.sysRole === 'SUPER_ADMIN';
    if (!isSuper && actor.shopRole !== 'OWNER') {
      throw new ForbiddenException(
        'Dead-letter review is restricted to owners and platform admins.',
      );
    }
    const items = await this.prisma.billingWebhookEvent.findMany({
      where: {
        status: BillingWebhookProcessingStatus.DEAD,
        ...(isSuper ? {} : { shopId: actor.shopId ?? undefined }),
      },
      orderBy: { receivedAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        provider: true,
        eventId: true,
        eventName: true,
        shopId: true,
        attemptCount: true,
        lastError: true,
        receivedAt: true,
      },
    });
    return { items };
  }

  private async insertInbox(input: {
    provider: string;
    eventId: string;
    eventName: string;
    shopId: string | null;
    payloadHash: string;
    redactedPayload: Prisma.InputJsonValue;
    canonicalEntityId?: string | null;
  }): Promise<{ ok: true; duplicate?: boolean; eventId: string }> {
    try {
      await this.prisma.billingWebhookEvent.create({
        data: {
          provider: input.provider,
          eventId: input.eventId,
          eventName: input.eventName,
          shopId: input.shopId,
          payloadHash: input.payloadHash,
          status: BillingWebhookProcessingStatus.RECEIVED,
          attemptCount: 0,
          redactedPayload: input.redactedPayload,
          canonicalEntityId: input.canonicalEntityId ?? null,
          processedAt: null,
        },
      });
      return { ok: true, eventId: input.eventId };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { ok: true, duplicate: true, eventId: input.eventId };
      }
      throw err;
    }
  }

  private async claimEvent(eventRowId: string) {
    const row = await this.prisma.billingWebhookEvent.findUnique({
      where: { id: eventRowId },
    });
    if (!row) return null;
    if (
      row.status !== BillingWebhookProcessingStatus.RECEIVED &&
      row.status !== BillingWebhookProcessingStatus.FAILED
    ) {
      return null;
    }

    const updated = await this.prisma.billingWebhookEvent.updateMany({
      where: {
        id: eventRowId,
        status: { in: [BillingWebhookProcessingStatus.RECEIVED, BillingWebhookProcessingStatus.FAILED] },
      },
      data: {
        status: BillingWebhookProcessingStatus.PROCESSING,
        attemptCount: { increment: 1 },
      },
    });
    if (updated.count === 0) return null;

    return this.prisma.billingWebhookEvent.findUniqueOrThrow({
      where: { id: eventRowId },
    });
  }

  private async processStripeEvent(row: {
    id: string;
    eventId: string;
    eventName: string;
    shopId: string | null;
  }) {
    if (!STRIPE_HANDLED.has(row.eventName)) {
      this.logger.log(`Stripe event ignored: ${row.eventName}`);
      return;
    }

    const event = await this.stripe.retrieveWebhookEvent(row.eventId);
    const shopId = this.extractStripeShopId(event) ?? row.shopId;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata ?? {};
      const billingSubId = meta.billing_subscription_id;
      const resolvedShop = meta.shop_id || session.client_reference_id || shopId;
      if (!resolvedShop) {
        throw new BadRequestException('Checkout session missing shop_id.');
      }

      if (typeof session.subscription === 'string') {
        const remote = await this.stripe.retrieveSubscription(session.subscription);
        await this.applyProviderSubscription(
          resolvedShop,
          'STRIPE',
          remote,
          event.type,
        );
      } else if (billingSubId) {
        await this.markSubscriptionActiveFromCheckout(billingSubId);
      }

      const payment = await this.prisma.billingPayment.findFirst({
        where: {
          provider: BillingProvider.STRIPE,
          providerCheckoutId: session.id,
        },
      });
      if (payment) {
        await this.upsertPaymentStatus(payment.id, 'PAID', 'paid');
      } else if (
        session.payment_intent &&
        typeof session.payment_intent === 'string' &&
        billingSubId
      ) {
        await this.upsertPaymentByProviderId({
          shopId: resolvedShop,
          subscriptionId: billingSubId,
          provider: BillingProvider.STRIPE,
          providerPaymentId: session.payment_intent,
          amountMinor: session.amount_total ?? 0,
          currency: (session.currency ?? 'eur').toUpperCase(),
          canonicalStatus: 'PAID',
          providerStatus: 'succeeded',
          paidAt: new Date(),
        });
      }
      return;
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted' ||
      event.type === 'customer.subscription.paused' ||
      event.type === 'customer.subscription.resumed'
    ) {
      const subObj = event.data.object as Stripe.Subscription;
      const remote = await this.stripe.retrieveSubscription(subObj.id);
      const resolvedShop =
        remote.metadata?.shop_id || shopId;
      if (!resolvedShop) {
        throw new BadRequestException('Stripe subscription missing shop_id metadata.');
      }
      await this.applyProviderSubscription(
        resolvedShop,
        'STRIPE',
        remote,
        event.type,
      );
      return;
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const billingSubId = session.metadata?.billing_subscription_id;
      if (billingSubId) {
        const sub = await this.prisma.billingSubscription.findUnique({
          where: { id: billingSubId },
        });
        if (
          sub &&
          (sub.canonicalStatus === 'CHECKOUT_PENDING' ||
            sub.canonicalStatus === 'DRAFT' ||
            sub.canonicalStatus === 'INCOMPLETE')
        ) {
          await this.transitionSubscription(sub.id, 'INCOMPLETE_EXPIRED');
        }
      }
      return;
    }

    if (
      event.type === 'invoice.created' ||
      event.type === 'invoice.finalized' ||
      event.type === 'customer.subscription.trial_will_end'
    ) {
      // Inbox durable; no local mutation required beyond ack.
      return;
    }

    if (
      event.type === 'payment_intent.processing' ||
      event.type === 'payment_intent.succeeded' ||
      event.type === 'payment_intent.payment_failed'
    ) {
      const pi = event.data.object as Stripe.PaymentIntent;
      const existing = await this.prisma.billingPayment.findFirst({
        where: {
          provider: BillingProvider.STRIPE,
          providerPaymentId: pi.id,
        },
      });
      if (!existing) return;
      const mapped =
        event.type === 'payment_intent.succeeded'
          ? 'PAID'
          : event.type === 'payment_intent.payment_failed'
            ? 'FAILED'
            : 'PROCESSING';
      await this.upsertPaymentStatus(existing.id, mapped, pi.status);
      return;
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const piId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : null;
      const payment = await this.prisma.billingPayment.findFirst({
        where: {
          provider: BillingProvider.STRIPE,
          OR: [
            { providerPaymentId: charge.id },
            ...(piId ? [{ providerPaymentId: piId }] : []),
          ],
        },
      });
      if (payment) {
        const fully =
          (charge.amount_refunded ?? 0) >= (charge.amount ?? 0) &&
          (charge.amount ?? 0) > 0;
        const target = fully ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        if (canTransitionPayment(payment.canonicalStatus, target)) {
          assertPaymentTransition(payment.canonicalStatus, target);
          await this.prisma.billingPayment.update({
            where: { id: payment.id },
            data: {
              canonicalStatus: target,
              amountRefundedMinor: charge.amount_refunded ?? 0,
              refundedAt: new Date(),
            },
          });
        }
      }
      return;
    }

    if (event.type === 'charge.dispute.closed') {
      // Keep DISPUTED / CHARGEBACK representation; operators review audit.
      return;
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const subRef = (invoice as { subscription?: string | { id?: string } | null })
        .subscription;
      const subId =
        typeof subRef === 'string'
          ? subRef
          : subRef && typeof subRef === 'object'
            ? subRef.id
            : null;
      let resolvedShop = shopId;
      let billingSub = null as Awaited<
        ReturnType<BillingWebhookService['findBillingSubForShop']>
      >;

      if (subId) {
        const remote = await this.stripe.retrieveSubscription(subId);
        resolvedShop = remote.metadata?.shop_id || resolvedShop;
        if (resolvedShop) {
          await this.applyProviderSubscription(
            resolvedShop,
            'STRIPE',
            remote,
            event.type,
          );
          billingSub = await this.prisma.billingSubscription.findFirst({
            where: { shopId: resolvedShop, providerSubscriptionId: subId },
            include: { addOns: true },
          });
        }
      }
      if (!resolvedShop) return;
      billingSub =
        billingSub ?? (await this.findBillingSubForShop(resolvedShop, 'STRIPE'));
      if (!billingSub) return;

      if (event.type === 'invoice.paid') {
        await this.onPaymentSucceeded(billingSub.id, resolvedShop, {
          providerPaymentId:
            typeof invoice.id === 'string' ? invoice.id : null,
          amountMinor: invoice.amount_paid ?? billingSub.amountMinor,
          currency: (invoice.currency ?? billingSub.currency).toUpperCase(),
        });
      } else {
        await this.onPaymentFailed(billingSub.id, resolvedShop);
      }
      return;
    }

    if (event.type === 'invoice.payment_action_required') {
      const invoice = event.data.object as Stripe.Invoice;
      const resolvedShop = shopId;
      if (!resolvedShop) return;
      const billingSub = await this.findBillingSubForShop(resolvedShop, 'STRIPE');
      if (!billingSub) return;
      await this.transitionSubscription(billingSub.id, 'REQUIRES_ACTION');
      await this.notifications.notify({
        shopId: resolvedShop,
        subscriptionId: billingSub.id,
        kind: 'payment_failed',
        dedupeKey: `action_required:${billingSub.id}:${invoice.id}`,
      });
      return;
    }

    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId =
        typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
      if (!shopId || !chargeId) return;
      const payment = await this.prisma.billingPayment.findFirst({
        where: {
          shopId,
          providerPaymentId: chargeId,
        },
      });
      if (payment && canTransitionPayment(payment.canonicalStatus, 'DISPUTED')) {
        assertPaymentTransition(payment.canonicalStatus, 'DISPUTED');
        await this.prisma.billingPayment.update({
          where: { id: payment.id },
          data: {
            canonicalStatus: 'DISPUTED',
            disputedAt: new Date(),
          },
        });
      }
    }
  }

  private async processMollieEvent(row: {
    id: string;
    eventId: string;
    shopId: string | null;
    canonicalEntityId: string | null;
  }) {
    const paymentId = row.canonicalEntityId;
    if (!paymentId) {
      throw new BadRequestException('Mollie inbox row missing payment id.');
    }

    // Always re-fetch — never trust stored status alone for money.
    const payment = await this.mollie.retrievePayment(paymentId);
    const shopId =
      payment.metadata?.shop_id ||
      payment.metadata?.shopId ||
      row.shopId;
    if (!shopId) {
      throw new BadRequestException('Mollie payment missing shop_id metadata.');
    }

    const billingSubId = payment.metadata?.billing_subscription_id;
    let billingSub = billingSubId
      ? await this.prisma.billingSubscription.findFirst({
          where: { id: billingSubId, shopId },
          include: { addOns: true, billingAccount: true },
        })
      : null;

    if (!billingSub) {
      billingSub = await this.prisma.billingSubscription.findFirst({
        where: {
          shopId,
          provider: BillingProvider.MOLLIE,
          canonicalStatus: {
            in: [
              'CHECKOUT_PENDING',
              'PROCESSING',
              'ACTIVE',
              'PAST_DUE',
              'TRIALING',
              'REQUIRES_ACTION',
            ],
          },
        },
        include: { addOns: true, billingAccount: true },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (!billingSub) {
      this.logger.warn(`Mollie payment ${paymentId} — no billing subscription for shop ${shopId}`);
      return;
    }

    const canonical = this.mollie.mapPaymentState(payment.status);
    await this.upsertPaymentByProviderId({
      shopId,
      subscriptionId: billingSub.id,
      provider: BillingProvider.MOLLIE,
      providerPaymentId: payment.id,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      canonicalStatus: canonical,
      providerStatus: payment.status,
      paidAt: payment.paidAt,
    });

    if (canonical === 'PAID') {
      if (
        billingSub.renewalMode === BillingRenewalMode.AUTOMATIC_RENEWAL &&
        !billingSub.providerSubscriptionId &&
        payment.customerId
      ) {
        await this.orchestrator.ensureMollieSubscriptionAfterMandate({
          shopId,
          billingSubscriptionId: billingSub.id,
          customerId: payment.customerId,
        });
      }
      await this.onPaymentSucceeded(billingSub.id, shopId, {
        providerPaymentId: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      });
    } else if (canonical === 'FAILED' || canonical === 'EXPIRED' || canonical === 'CANCELED') {
      if (billingSub.canonicalStatus === 'CHECKOUT_PENDING') {
        await this.transitionSubscription(
          billingSub.id,
          canonical === 'EXPIRED' ? 'INCOMPLETE_EXPIRED' : 'CANCELED',
        );
      } else {
        await this.onPaymentFailed(billingSub.id, shopId);
      }
    } else if (canonical === 'REQUIRES_ACTION' || canonical === 'OPEN' || canonical === 'PENDING') {
      if (canTransitionSubscription(billingSub.canonicalStatus, 'REQUIRES_ACTION')) {
        await this.transitionSubscription(billingSub.id, 'REQUIRES_ACTION');
      }
    }
  }

  private async applyProviderSubscription(
    shopId: string,
    provider: 'STRIPE' | 'MOLLIE',
    remote: {
      id: string;
      status: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodStart?: Date | null;
      currentPeriodEnd?: Date | null;
      trialEndsAt?: Date | null;
      priceId?: string | null;
      amountMinor?: number | null;
      currency?: string | null;
      metadata?: Record<string, string>;
      customerId: string;
    },
    eventName: string,
  ) {
    const adapter = this.registry.get(provider);
    let canonical = adapter.mapSubscriptionState(remote.status);
    if (remote.cancelAtPeriodEnd && canonical === 'ACTIVE') {
      canonical = 'CANCEL_AT_PERIOD_END';
    }
    if (eventName === 'customer.subscription.deleted') {
      canonical = 'CANCELED';
    }

    const billingSubId = remote.metadata?.billing_subscription_id;
    let billingSub = billingSubId
      ? await this.prisma.billingSubscription.findFirst({
          where: { id: billingSubId, shopId },
          include: { addOns: true },
        })
      : await this.prisma.billingSubscription.findFirst({
          where: {
            shopId,
            provider,
            OR: [
              { providerSubscriptionId: remote.id },
              {
                canonicalStatus: {
                  in: ['CHECKOUT_PENDING', 'PROCESSING', 'INCOMPLETE', 'REQUIRES_ACTION'],
                },
              },
            ],
          },
          include: { addOns: true },
          orderBy: { updatedAt: 'desc' },
        });

    if (!billingSub) {
      this.logger.warn(
        `No BillingSubscription for ${provider} sub ${remote.id} shop ${shopId}`,
      );
      return;
    }

    if (!canTransitionSubscription(billingSub.canonicalStatus, canonical)) {
      // Soft skip illegal transitions (idempotent replays).
      this.logger.warn(
        `Skip transition ${billingSub.canonicalStatus} → ${canonical} for ${billingSub.id}`,
      );
      canonical = billingSub.canonicalStatus;
    } else {
      assertSubscriptionTransition(billingSub.canonicalStatus, canonical);
    }

    const graceDays = readBillingConfig(this.config).gracePeriodDays;
    const updated = await this.prisma.billingSubscription.update({
      where: { id: billingSub.id },
      data: {
        providerSubscriptionId: remote.id,
        providerStatus: remote.status,
        canonicalStatus: canonical,
        providerPriceId: remote.priceId ?? undefined,
        amountMinor: remote.amountMinor ?? undefined,
        currency: remote.currency ?? undefined,
        currentPeriodStart: remote.currentPeriodStart ?? undefined,
        currentPeriodEnd: remote.currentPeriodEnd ?? undefined,
        nextBillingAt: remote.currentPeriodEnd ?? undefined,
        trialEndsAt: remote.trialEndsAt ?? undefined,
        cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
        canceledAt: canonical === 'CANCELED' ? new Date() : undefined,
        gracePeriodEndsAt:
          canonical === 'PAST_DUE'
            ? new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
            : undefined,
        version: { increment: 1 },
      },
      include: { addOns: true },
    });

    await this.prisma.billingAccount.upsert({
      where: {
        shopId_provider: { shopId, provider },
      },
      create: {
        shopId,
        provider,
        providerCustomerId: remote.customerId,
      },
      update: {
        providerCustomerId: remote.customerId,
      },
    });

    await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);

    await this.audit.recordForShop(shopId, {
      section: 'subscription',
      action: `billing.webhook.${eventName}`,
      summary: `Billing ${eventName} → ${canonical}`,
      meta: {
        billingSubscriptionId: updated.id,
        providerSubscriptionId: remote.id,
      },
      actorName: provider,
    });

    if (canonical === 'CANCELED') {
      await this.notifications.notify({
        shopId,
        subscriptionId: updated.id,
        kind: 'canceled',
        dedupeKey: `canceled:${updated.id}:${eventName}`,
      });
    }
  }

  private async onPaymentSucceeded(
    billingSubscriptionId: string,
    shopId: string,
    payment: {
      providerPaymentId?: string | null;
      amountMinor: number;
      currency: string;
    },
  ) {
    const sub = await this.prisma.billingSubscription.findUniqueOrThrow({
      where: { id: billingSubscriptionId },
      include: { addOns: true },
    });

    const nextStatus: BillingCanonicalSubscriptionStatus =
      sub.canonicalStatus === 'TRIALING' ? 'TRIALING' : 'ACTIVE';

    if (canTransitionSubscription(sub.canonicalStatus, nextStatus)) {
      assertSubscriptionTransition(sub.canonicalStatus, nextStatus);
    }

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    const updated = await this.prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        canonicalStatus: canTransitionSubscription(sub.canonicalStatus, nextStatus)
          ? nextStatus
          : sub.canonicalStatus,
        lastSuccessfulPaymentAt: new Date(),
        failureCount: 0,
        gracePeriodEndsAt: null,
        currentPeriodStart: sub.currentPeriodStart ?? periodStart,
        currentPeriodEnd: sub.currentPeriodEnd ?? periodEnd,
        nextBillingAt: sub.nextBillingAt ?? periodEnd,
        version: { increment: 1 },
      },
      include: { addOns: true },
    });

    await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);

    await this.notifications.notify({
      shopId,
      subscriptionId: updated.id,
      kind: 'payment_succeeded',
      dedupeKey: `payment_ok:${updated.id}:${payment.providerPaymentId ?? updated.lastSuccessfulPaymentAt?.toISOString()}`,
    });
  }

  private async onPaymentFailed(billingSubscriptionId: string, shopId: string) {
    const sub = await this.prisma.billingSubscription.findUniqueOrThrow({
      where: { id: billingSubscriptionId },
      include: { addOns: true },
    });

    const graceDays = readBillingConfig(this.config).gracePeriodDays;
    let next: BillingCanonicalSubscriptionStatus = 'PAST_DUE';
    if (!canTransitionSubscription(sub.canonicalStatus, next)) {
      next = sub.canonicalStatus;
    } else {
      assertSubscriptionTransition(sub.canonicalStatus, next);
    }

    const updated = await this.prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        canonicalStatus: next,
        lastFailedPaymentAt: new Date(),
        failureCount: { increment: 1 },
        gracePeriodEndsAt:
          sub.gracePeriodEndsAt ??
          new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000),
        version: { increment: 1 },
      },
      include: { addOns: true },
    });

    await this.entitlements.syncShopEntitlementFromBilling(shopId, updated);
    await this.notifications.notify({
      shopId,
      subscriptionId: updated.id,
      kind: 'payment_failed',
      dedupeKey: `payment_fail:${updated.id}:${updated.failureCount}`,
    });
  }

  private async markSubscriptionActiveFromCheckout(billingSubscriptionId: string) {
    const sub = await this.prisma.billingSubscription.findUniqueOrThrow({
      where: { id: billingSubscriptionId },
      include: { addOns: true },
    });
    if (!canTransitionSubscription(sub.canonicalStatus, 'ACTIVE')) return;
    assertSubscriptionTransition(sub.canonicalStatus, 'ACTIVE');
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    const updated = await this.prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        canonicalStatus: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextBillingAt: periodEnd,
        lastSuccessfulPaymentAt: new Date(),
        version: { increment: 1 },
      },
      include: { addOns: true },
    });
    await this.entitlements.syncShopEntitlementFromBilling(sub.shopId, updated);
  }

  private async transitionSubscription(
    id: string,
    to: BillingCanonicalSubscriptionStatus,
  ) {
    const sub = await this.prisma.billingSubscription.findUniqueOrThrow({
      where: { id },
      include: { addOns: true },
    });
    if (!canTransitionSubscription(sub.canonicalStatus, to)) return;
    assertSubscriptionTransition(sub.canonicalStatus, to);
    const updated = await this.prisma.billingSubscription.update({
      where: { id },
      data: { canonicalStatus: to, version: { increment: 1 } },
      include: { addOns: true },
    });
    await this.entitlements.syncShopEntitlementFromBilling(sub.shopId, updated);
  }

  private async upsertPaymentStatus(
    paymentId: string,
    to: BillingCanonicalPaymentStatus,
    providerStatus: string,
  ) {
    const payment = await this.prisma.billingPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (!canTransitionPayment(payment.canonicalStatus, to)) return;
    assertPaymentTransition(payment.canonicalStatus, to);
    await this.prisma.billingPayment.update({
      where: { id: paymentId },
      data: {
        canonicalStatus: to,
        providerStatus,
        paidAt: to === 'PAID' ? new Date() : undefined,
        failedAt: to === 'FAILED' ? new Date() : undefined,
        requiresCustomerAction: false,
      },
    });
  }

  private async upsertPaymentByProviderId(input: {
    shopId: string;
    subscriptionId: string;
    provider: BillingProvider;
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    canonicalStatus: BillingCanonicalPaymentStatus;
    providerStatus: string;
    paidAt?: Date | null;
  }) {
    const existing = await this.prisma.billingPayment.findUnique({
      where: {
        provider_providerPaymentId: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
        },
      },
    });
    if (existing) {
      if (canTransitionPayment(existing.canonicalStatus, input.canonicalStatus)) {
        assertPaymentTransition(existing.canonicalStatus, input.canonicalStatus);
        await this.prisma.billingPayment.update({
          where: { id: existing.id },
          data: {
            canonicalStatus: input.canonicalStatus,
            providerStatus: input.providerStatus,
            paidAt: input.paidAt ?? (input.canonicalStatus === 'PAID' ? new Date() : undefined),
            failedAt:
              input.canonicalStatus === 'FAILED' ? new Date() : undefined,
          },
        });
      }
      return;
    }
    await this.prisma.billingPayment.create({
      data: {
        shopId: input.shopId,
        subscriptionId: input.subscriptionId,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        canonicalStatus: input.canonicalStatus,
        providerStatus: input.providerStatus,
        paidAt: input.paidAt ?? null,
      },
    });
  }

  private async findBillingSubForShop(
    shopId: string,
    provider: 'STRIPE' | 'MOLLIE',
  ) {
    return this.prisma.billingSubscription.findFirst({
      where: {
        shopId,
        provider,
        canonicalStatus: {
          in: [
            'ACTIVE',
            'TRIALING',
            'PAST_DUE',
            'CANCEL_AT_PERIOD_END',
            'CHECKOUT_PENDING',
            'PROCESSING',
            'REQUIRES_ACTION',
          ],
        },
      },
      include: { addOns: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private extractStripeShopId(event: Stripe.Event): string | null {
    const obj = event.data?.object as {
      metadata?: Record<string, string>;
      client_reference_id?: string | null;
      subscription_details?: { metadata?: Record<string, string> };
    };
    return (
      obj?.metadata?.shop_id ||
      obj?.client_reference_id ||
      obj?.subscription_details?.metadata?.shop_id ||
      null
    );
  }

  private stripeObjectId(event: Stripe.Event): string | null {
    const obj = event.data?.object as { id?: string };
    return typeof obj?.id === 'string' ? obj.id : null;
  }

  private parseMolliePaymentId(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const id = (body as { id?: unknown }).id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }
}
