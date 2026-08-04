import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

export type BillingNoticeKind =
  | 'renewal_reminder'
  | 'manual_renewal_reminder'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'past_due'
  | 'grace_expired'
  | 'canceled'
  | 'paused'
  | 'resumed'
  | 'checkout_started'
  | 'plan_change_scheduled'
  | 'provider_switch_scheduled'
  | 'payment_method_expiring';

export type BillingNoticeInput = {
  shopId: string;
  subscriptionId?: string | null;
  kind: BillingNoticeKind;
  /** Days until period end for reminders (5 / 3 / 1). */
  daysBefore?: number;
  periodEnd?: Date | null;
  dedupeKey: string;
  /** Override copy when needed. */
  title?: string;
  body?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

const CRITICAL_KINDS = new Set<BillingNoticeKind>([
  'payment_failed',
  'past_due',
  'grace_expired',
  'canceled',
]);

function formatPeriodEnd(d: Date | null | undefined): string {
  if (!d) return 'your next billing date';
  return d.toISOString().slice(0, 10);
}

function formatMoney(amountMinor: number | null | undefined, currency: string) {
  if (amountMinor == null) return null;
  const major = (amountMinor / 100).toFixed(2);
  return `${major} ${currency.toUpperCase()}`;
}

function buildCopy(input: BillingNoticeInput): { title: string; body: string } {
  if (input.title && input.body) {
    return { title: input.title, body: input.body };
  }

  const period = formatPeriodEnd(input.periodEnd);
  const days = input.daysBefore;
  const amount = formatMoney(
    typeof input.meta?.amountMinor === 'number'
      ? input.meta.amountMinor
      : null,
    String(input.meta?.currency ?? 'EUR'),
  );
  const provider = String(input.meta?.provider ?? 'your payment provider');
  const methodLabel = String(input.meta?.methodLabel ?? 'your saved payment method');
  const payHref = String(input.meta?.payHref ?? '/subscription');
  const grace = input.meta?.gracePeriodEnds
    ? String(input.meta.gracePeriodEnds)
    : null;

  switch (input.kind) {
    case 'renewal_reminder':
      return {
        title: `Automatic renewal in ${days} day${days === 1 ? '' : 's'}`,
        body: amount
          ? `Your GoSpots subscription will renew automatically on ${period} for ${amount} through ${provider} using ${methodLabel}. Update your payment method or cancel from Subscription if needed.`
          : `Your GoSpots subscription renews automatically on ${period} through ${provider}. Update your payment method or cancel from Subscription if needed.`,
      };
    case 'manual_renewal_reminder':
      return {
        title: `Manual renewal due in ${days} day${days === 1 ? '' : 's'}`,
        body: amount
          ? `Your subscription period ends on ${period}. Automatic renewal is disabled. Pay ${amount} through ${provider} before this date to continue without interruption${grace ? ` (grace until ${grace})` : ''}. Open Subscription and use Pay now (${payHref}).`
          : `Your GoSpots subscription period ends on ${period}. Complete a renewal checkout before then to keep paid modules unlocked.`,
      };
    case 'payment_method_expiring':
      return {
        title: 'Payment method expiring soon',
        body: `Your ${String(input.meta?.brand ?? 'card')}${
          input.meta?.last4 ? ` ending in ${input.meta.last4}` : ''
        } expires soon. Update your payment method on Subscription to avoid a failed renewal.`,
      };
    case 'payment_succeeded':
      return {
        title: 'Payment received',
        body: 'Your GoSpots subscription payment succeeded. Thank you — your venue access stays active.',
      };
    case 'payment_failed':
      return {
        title: 'Payment failed',
        body: 'We could not collect your subscription payment. Update your payment method to avoid losing access to paid modules.',
      };
    case 'past_due':
      return {
        title: 'Subscription past due',
        body: 'Your subscription is past due. Paid modules remain available during the grace period — please update billing soon.',
      };
    case 'grace_expired':
      return {
        title: 'Subscription unpaid',
        body: 'The grace period ended without a successful payment. Paid modules are locked until you renew.',
      };
    case 'canceled':
      return {
        title: 'Subscription canceled',
        body: 'Your GoSpots subscription has been canceled. You can start a new checkout anytime from Subscription.',
      };
    case 'paused':
      return {
        title: 'Subscription paused',
        body: 'Your subscription is paused. Paid modules are locked until you resume billing.',
      };
    case 'resumed':
      return {
        title: 'Subscription resumed',
        body: 'Your GoSpots subscription is active again.',
      };
    case 'checkout_started':
      return {
        title: 'Checkout started',
        body: 'Complete payment to activate or renew your GoSpots subscription.',
      };
    case 'plan_change_scheduled':
      return {
        title: 'Plan change scheduled',
        body: `Your plan change will apply at the end of the current period (${period}).`,
      };
    case 'provider_switch_scheduled':
      return {
        title: 'Provider switch scheduled',
        body: `A switch to a new payment provider is scheduled for ${period}. Complete the new checkout when ready.`,
      };
    default: {
      const _exhaustive: never = input.kind;
      return { title: 'Billing update', body: String(_exhaustive) };
    }
  }
}

@Injectable()
export class BillingNotificationService {
  private readonly logger = new Logger(BillingNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Deliver in-app (always for critical) + email via MailService.
   * Deduped via BillingNotificationDelivery.dedupeKey (unique).
   */
  async notify(input: BillingNoticeInput): Promise<{ sent: boolean }> {
    const enriched = await this.enrichInput(input);
    const channels: Array<'in_app' | 'email'> = ['in_app', 'email'];
    let anySent = false;

    for (const channel of channels) {
      const channelKey = `${enriched.dedupeKey}:${channel}`;
      try {
        await this.prisma.billingNotificationDelivery.create({
          data: {
            shopId: enriched.shopId,
            subscriptionId: enriched.subscriptionId ?? null,
            notificationType: enriched.kind,
            periodEnd: enriched.periodEnd ?? null,
            channel,
            status: 'PENDING',
            dedupeKey: channelKey,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }

      const copy = buildCopy(enriched);
      try {
        if (channel === 'in_app') {
          await this.notifications.recordBillingEvent(enriched.shopId, {
            title: copy.title,
            body: copy.body,
            href: '/subscription',
            dedupeKey: channelKey,
          });
          anySent = true;
        } else {
          const critical = CRITICAL_KINDS.has(enriched.kind);
          const shop = await this.prisma.shop.findUnique({
            where: { id: enriched.shopId },
            include: { owner: { select: { email: true } } },
          });
          const to = shop?.owner?.email?.trim();
          if (!to) {
            await this.markDelivery(channelKey, 'SKIPPED');
            continue;
          }
          await this.mail.send({
            to,
            subject: copy.title,
            html: `<p>${escapeHtml(copy.body)}</p>`,
            text: copy.body,
            shopId: enriched.shopId,
            idempotencyKey: channelKey,
            required: critical,
          });
          anySent = true;
        }
        await this.markDelivery(channelKey, 'SENT');
      } catch (err) {
        this.logger.warn(
          `Billing notice ${enriched.kind}/${channel} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await this.markDelivery(
          channelKey,
          'FAILED',
          err instanceof Error ? err.message : String(err),
        );
        if (channel === 'in_app' && CRITICAL_KINDS.has(enriched.kind)) {
          throw err;
        }
      }
    }

    return { sent: anySent };
  }

  private async enrichInput(
    input: BillingNoticeInput,
  ): Promise<BillingNoticeInput> {
    if (!input.subscriptionId) return input;
    const sub = await this.prisma.billingSubscription.findUnique({
      where: { id: input.subscriptionId },
      include: {
        billingAccount: {
          include: {
            paymentMethods: {
              where: { isDefault: true },
              take: 1,
            },
          },
        },
        shop: { select: { slug: true } },
      },
    });
    if (!sub) return input;

    const pm = sub.billingAccount.paymentMethods[0];
    let methodLabel = 'your saved payment method';
    if (pm?.mandateStatus) {
      methodLabel = `your active ${pm.type ?? 'bank'} mandate${
        pm.bankName ? ` (${pm.bankName})` : ''
      }`;
    } else if (pm?.last4) {
      methodLabel = `${pm.cardBrand ?? 'card'} ending in ${pm.last4}`;
    }

    const cfgGrace = sub.gracePeriodEndsAt
      ? sub.gracePeriodEndsAt.toISOString().slice(0, 10)
      : null;

    return {
      ...input,
      periodEnd: input.periodEnd ?? sub.currentPeriodEnd,
      meta: {
        amountMinor: sub.amountMinor,
        currency: sub.currency,
        provider: sub.provider,
        methodLabel,
        payHref: `/dashboard/${sub.shop.slug}/subscription`,
        gracePeriodEnds: cfgGrace,
        brand: pm?.cardBrand,
        last4: pm?.last4,
        ...input.meta,
      },
    };
  }

  private async markDelivery(
    dedupeKey: string,
    status: string,
    _error?: string,
  ) {
    await this.prisma.billingNotificationDelivery.updateMany({
      where: { dedupeKey },
      data: { status, sentAt: new Date() },
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
