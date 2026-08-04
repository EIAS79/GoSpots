import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  BillingCanonicalSubscriptionStatus,
  BillingOperationStatus,
  BillingRenewalMode,
} from '@prisma/client';
import { withBillingCronLock } from '../../common/pg-advisory-lock.util';
import { PrismaService } from '../../prisma/prisma.service';
import { isDualBillingEnabled, readBillingConfig } from './billing-config';
import { BillingEntitlementSync } from './billing-entitlement.sync';
import { BillingNotificationService } from './billing-notification.service';
import { BillingOrchestratorService } from './billing-orchestrator.service';
import { BillingReconciliationService } from './billing-reconciliation.service';
import {
  assertSubscriptionTransition,
  canTransitionSubscription,
} from './billing-state-machine';
import { BillingWebhookService } from './billing-webhook.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = [5, 3, 1] as const;

@Injectable()
export class BillingJobsProcessor {
  private readonly logger = new Logger(BillingJobsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: BillingNotificationService,
    private readonly entitlements: BillingEntitlementSync,
    private readonly webhooks: BillingWebhookService,
    private readonly reconciliation: BillingReconciliationService,
    private readonly orchestrator: BillingOrchestratorService,
  ) {}

  private enabled(): boolean {
    if (!isDualBillingEnabled(this.config)) return false;
    const raw = this.config
      .get<string>('BILLING_CRON')
      ?.trim()
      .toLowerCase();
    if (raw === 'off' || raw === 'false' || raw === '0') return false;
    return true;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async tick() {
    if (!this.enabled()) return;

    const outcome = await withBillingCronLock(
      this.prisma,
      () => this.runPass(),
      { timeout: 120_000 },
    );

    if (!outcome.acquired) {
      this.logger.debug('Billing cron skipped — lock not acquired');
      return;
    }

    this.logger.log(`Billing cron pass: ${JSON.stringify(outcome.result)}`);
  }

  /** Exposed for tests. */
  async runPass(now = new Date()) {
    const reminders = await this.sendRenewalReminders(now);
    const cardExpiry = await this.sendPaymentMethodExpiryReminders(now);
    const resumes = await this.orchestrator.resumeDuePausedSubscriptions(now);
    const grace = await this.expireGracePeriods(now);
    const stale = await this.cleanupStaleCheckouts(now);
    const webhooks = await this.webhooks.processDueEvents(50);
    const reconcile = await this.reconciliation.reconcileBatch(40);
    return { reminders, cardExpiry, resumes, grace, stale, webhooks, reconcile };
  }

  private async sendRenewalReminders(now: Date) {
    let sent = 0;
    const live: BillingCanonicalSubscriptionStatus[] = [
      'ACTIVE',
      'TRIALING',
      'CANCEL_AT_PERIOD_END',
    ];

    for (const days of REMINDER_DAYS) {
      const windowStart = new Date(now.getTime() + days * DAY_MS);
      const windowEnd = new Date(windowStart.getTime() + DAY_MS);

      const subs = await this.prisma.billingSubscription.findMany({
        where: {
          canonicalStatus: { in: live },
          currentPeriodEnd: {
            gte: windowStart,
            lt: windowEnd,
          },
        },
        take: 200,
      });

      for (const sub of subs) {
        const periodKey = sub.currentPeriodEnd?.toISOString() ?? 'none';
        const kind =
          sub.renewalMode === BillingRenewalMode.MANUAL_MONTHLY
            ? 'manual_renewal_reminder'
            : 'renewal_reminder';
        const dedupeKey = `${kind}:${sub.id}:${days}d:${periodKey}`;
        const result = await this.notifications.notify({
          shopId: sub.shopId,
          subscriptionId: sub.id,
          kind,
          daysBefore: days,
          periodEnd: sub.currentPeriodEnd,
          dedupeKey,
        });
        if (result.sent) sent += 1;
      }
    }
    return sent;
  }

  private async sendPaymentMethodExpiryReminders(now: Date) {
    let sent = 0;
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    // Cards expiring this calendar month (and not yet past).
    const methods = await this.prisma.billingPaymentMethodSummary.findMany({
      where: {
        isDefault: true,
        expiryYear: { not: null },
        expiryMonth: { not: null },
        OR: [
          { expiryYear: year, expiryMonth: month },
          {
            expiryYear: month === 12 ? year + 1 : year,
            expiryMonth: month === 12 ? 1 : month + 1,
          },
        ],
      },
      include: {
        billingAccount: {
          select: { shopId: true, id: true },
        },
      },
      take: 100,
    });

    for (const method of methods) {
      const shopId = method.billingAccount.shopId;
      const sub = await this.prisma.billingSubscription.findFirst({
        where: {
          shopId,
          billingAccountId: method.billingAccount.id,
          canonicalStatus: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (!sub) continue;
      const ym = `${method.expiryYear}-${String(method.expiryMonth).padStart(2, '0')}`;
      const result = await this.notifications.notify({
        shopId,
        subscriptionId: sub.id,
        kind: 'payment_method_expiring',
        dedupeKey: `pm_expiring:${method.id}:${ym}`,
        meta: {
          last4: method.last4,
          brand: method.cardBrand,
          expiryMonth: method.expiryMonth,
          expiryYear: method.expiryYear,
        },
      });
      if (result.sent) sent += 1;
    }
    return sent;
  }

  private async expireGracePeriods(now: Date) {
    let expired = 0;
    const pastDue = await this.prisma.billingSubscription.findMany({
      where: {
        canonicalStatus: 'PAST_DUE',
        gracePeriodEndsAt: { lte: now },
      },
      include: { addOns: true },
      take: 100,
    });

    for (const sub of pastDue) {
      const target: BillingCanonicalSubscriptionStatus = 'UNPAID';
      if (!canTransitionSubscription(sub.canonicalStatus, target)) continue;
      assertSubscriptionTransition(sub.canonicalStatus, target);

      const updated = await this.prisma.billingSubscription.update({
        where: { id: sub.id },
        data: {
          canonicalStatus: target,
          version: { increment: 1 },
        },
        include: { addOns: true },
      });
      await this.entitlements.syncShopEntitlementFromBilling(
        sub.shopId,
        updated,
      );
      await this.notifications.notify({
        shopId: sub.shopId,
        subscriptionId: sub.id,
        kind: 'grace_expired',
        dedupeKey: `grace_expired:${sub.id}:${sub.gracePeriodEndsAt?.toISOString() ?? 'n/a'}`,
      });
      expired += 1;
    }

    // Period-end cancel → CANCELED / EXPIRED
    const cancelDue = await this.prisma.billingSubscription.findMany({
      where: {
        canonicalStatus: 'CANCEL_AT_PERIOD_END',
        currentPeriodEnd: { lte: now },
      },
      include: { addOns: true },
      take: 100,
    });

    for (const sub of cancelDue) {
      if (!canTransitionSubscription(sub.canonicalStatus, 'CANCELED')) continue;
      assertSubscriptionTransition(sub.canonicalStatus, 'CANCELED');
      const updated = await this.prisma.billingSubscription.update({
        where: { id: sub.id },
        data: {
          canonicalStatus: 'CANCELED',
          canceledAt: now,
          version: { increment: 1 },
        },
        include: { addOns: true },
      });
      await this.entitlements.syncShopEntitlementFromBilling(
        sub.shopId,
        updated,
      );
      await this.notifications.notify({
        shopId: sub.shopId,
        subscriptionId: sub.id,
        kind: 'canceled',
        dedupeKey: `period_end_canceled:${sub.id}:${sub.currentPeriodEnd?.toISOString() ?? 'n/a'}`,
      });
      expired += 1;
    }

    // Manual renewal missed period end → EXPIRED
    const manualExpired = await this.prisma.billingSubscription.findMany({
      where: {
        renewalMode: BillingRenewalMode.MANUAL_MONTHLY,
        canonicalStatus: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { lte: now },
      },
      include: { addOns: true },
      take: 100,
    });

    for (const sub of manualExpired) {
      const cfg = readBillingConfig(this.config);
      // Give the same grace window before hard expire.
      const graceEnd = new Date(
        (sub.currentPeriodEnd?.getTime() ?? now.getTime()) +
          cfg.gracePeriodDays * DAY_MS,
      );
      if (graceEnd > now) {
        if (canTransitionSubscription(sub.canonicalStatus, 'PAST_DUE')) {
          assertSubscriptionTransition(sub.canonicalStatus, 'PAST_DUE');
          const updated = await this.prisma.billingSubscription.update({
            where: { id: sub.id },
            data: {
              canonicalStatus: 'PAST_DUE',
              gracePeriodEndsAt: graceEnd,
              version: { increment: 1 },
            },
            include: { addOns: true },
          });
          await this.entitlements.syncShopEntitlementFromBilling(
            sub.shopId,
            updated,
          );
        }
        continue;
      }
      if (!canTransitionSubscription(sub.canonicalStatus, 'EXPIRED')) continue;
      assertSubscriptionTransition(sub.canonicalStatus, 'EXPIRED');
      const updated = await this.prisma.billingSubscription.update({
        where: { id: sub.id },
        data: {
          canonicalStatus: 'EXPIRED',
          version: { increment: 1 },
        },
        include: { addOns: true },
      });
      await this.entitlements.syncShopEntitlementFromBilling(
        sub.shopId,
        updated,
      );
      expired += 1;
    }

    return expired;
  }

  private async cleanupStaleCheckouts(now: Date) {
    const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const staleDraft = await this.prisma.billingSubscription.updateMany({
      where: {
        canonicalStatus: 'DRAFT',
        createdAt: { lt: staleBefore },
      },
      data: { canonicalStatus: 'CANCELED' },
    });

    const staleSubs = await this.prisma.billingSubscription.updateMany({
      where: {
        canonicalStatus: {
          in: ['CHECKOUT_PENDING', 'INCOMPLETE'],
        },
        createdAt: { lt: staleBefore },
      },
      data: {
        canonicalStatus: 'INCOMPLETE_EXPIRED',
      },
    });

    const staleOps = await this.prisma.billingOperation.updateMany({
      where: {
        status: BillingOperationStatus.PENDING,
        expiresAt: { lt: now },
      },
      data: { status: BillingOperationStatus.EXPIRED },
    });

    return {
      subscriptions: staleDraft.count + staleSubs.count,
      operations: staleOps.count,
    };
  }
}
