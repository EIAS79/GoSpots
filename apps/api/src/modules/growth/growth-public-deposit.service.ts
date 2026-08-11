import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import {
  assertGuestTokenActive,
  guestTokenLookupWhere,
  verifyPresentedGuestToken,
} from '../../common/guest-token.util';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVE_RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

@Injectable()
export class GrowthPublicDepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async status(slug: string, reservationId: string, guestToken: string) {
    const { shopId, reservation } = await this.requireGuestReservation(
      slug,
      reservationId,
      guestToken,
    );
    return this.statusForReservation(shopId, reservation);
  }

  async createCheckout(
    slug: string,
    reservationId: string,
    guestToken: string,
  ) {
    const { shopId, reservation } = await this.requireGuestReservation(
      slug,
      reservationId,
      guestToken,
    );
    if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
      throw new ConflictException(
        'Deposits can only be paid for an active reservation.',
      );
    }

    const status = await this.statusForReservation(shopId, reservation);
    if (status.remainingMinor <= 0) {
      return { ...status, checkoutRequired: false, checkoutUrl: null };
    }
    if (status.requiredMinor <= 0) {
      throw new ConflictException(
        'This reservation has no payable deposit requirement.',
      );
    }

    const stripe = this.stripe();
    const baseUrl = this.webBaseUrl();
    const lockKey = `public-deposit-checkout:${shopId}:${reservation.id}`;

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const refreshed = await this.depositNumbers(tx, shopId, reservation);
        if (refreshed.remainingMinor <= 0) {
          return {
            ...refreshed,
            reservationId: reservation.id,
            checkoutRequired: false,
            checkoutUrl: null,
          };
        }

        const open = await tx.reservationDepositCheckoutAttempt.findFirst({
          where: {
            shopId,
            reservationId: reservation.id,
            status: 'OPEN',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
        });
        if (open) {
          try {
            const existing = await stripe.checkout.sessions.retrieve(
              open.providerSessionId,
            );
            if (existing.status === 'open' && existing.url) {
              return {
                ...refreshed,
                reservationId: reservation.id,
                checkoutRequired: true,
                checkoutUrl: existing.url,
                checkoutSessionId: existing.id,
                expiresAt: open.expiresAt,
              };
            }
          } catch {
            // Provider read failure must not mark money paid. We only close the
            // stale local attempt and create another server-idempotent session.
          }
          await tx.reservationDepositCheckoutAttempt.update({
            where: { id: open.id },
            data: { status: 'EXPIRED', canceledAt: new Date() },
          });
        }

        const attemptCount = await tx.reservationDepositCheckoutAttempt.count({
          where: { shopId, reservationId: reservation.id },
        });
        const idempotencyKey = `reservation-deposit:${reservation.id}:${refreshed.balanceMinor}:${attemptCount + 1}`;
        const expiresAt = new Date(Date.now() + 30 * 60_000);
        const session = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: refreshed.currency.toLowerCase(),
                  unit_amount: refreshed.remainingMinor,
                  product_data: {
                    name: 'Reservation deposit',
                    description: `Reservation ${reservation.id}`,
                  },
                },
              },
            ],
            metadata: {
              purpose: 'RESERVATION_DEPOSIT',
              shopId,
              reservationId: reservation.id,
            },
            payment_intent_data: {
              metadata: {
                purpose: 'RESERVATION_DEPOSIT',
                shopId,
                reservationId: reservation.id,
              },
            },
            success_url: `${baseUrl}/deposit-return?status=success`,
            cancel_url: `${baseUrl}/deposit-return?status=canceled`,
            expires_at: Math.floor(expiresAt.getTime() / 1000),
          },
          { idempotencyKey },
        );
        if (!session.url) {
          throw new ServiceUnavailableException(
            'Stripe did not return a checkout URL.',
          );
        }

        await tx.reservationDepositCheckoutAttempt.create({
          data: {
            shopId,
            reservationId: reservation.id,
            providerSessionId: session.id,
            providerPaymentIntentId: this.paymentIntentId(session.payment_intent),
            amountMinor: refreshed.remainingMinor,
            currency: refreshed.currency,
            status: 'OPEN',
            idempotencyKey,
            checkoutUrlHash: this.hash(session.url),
            expiresAt,
          },
        });

        return {
          ...refreshed,
          reservationId: reservation.id,
          checkoutRequired: true,
          checkoutUrl: session.url,
          checkoutSessionId: session.id,
          expiresAt,
        };
      },
      { timeout: 15_000 },
    );
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret =
      this.config.get<string>('STRIPE_RESERVATION_DEPOSIT_WEBHOOK_SECRET')?.trim() ||
      this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe reservation-deposit webhook is not configured.',
      );
    }
    const event = this.stripe().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (
        session.metadata?.purpose !== 'RESERVATION_DEPOSIT' ||
        session.payment_status !== 'paid'
      ) {
        return { received: true, ignored: true };
      }
      await this.captureSucceededSession(event.id, session);
      return { received: true };
    }

    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.purpose !== 'RESERVATION_DEPOSIT') {
        return { received: true, ignored: true };
      }
      await this.markProviderTerminal(
        event.id,
        session.id,
        event.type === 'checkout.session.expired' ? 'EXPIRED' : 'FAILED',
      );
      return { received: true };
    }

    return { received: true, ignored: true };
  }

  private async captureSucceededSession(
    eventId: string,
    session: Stripe.Checkout.Session,
  ) {
    const attempt = await this.prisma.reservationDepositCheckoutAttempt.findUnique({
      where: { providerSessionId: session.id },
    });
    if (!attempt) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`deposit-webhook:${attempt.shopId}:${attempt.reservationId}`}))`;
      const current = await tx.reservationDepositCheckoutAttempt.findUnique({
        where: { id: attempt.id },
      });
      if (!current || current.status === 'SUCCEEDED') return;

      const providerAmount = session.amount_total ?? 0;
      const providerCurrency = (session.currency ?? '').toUpperCase();
      if (
        providerAmount !== current.amountMinor ||
        providerCurrency !== current.currency.toUpperCase()
      ) {
        await tx.reservationDepositCheckoutAttempt.update({
          where: { id: current.id },
          data: {
            status: 'PROVIDER_MISMATCH',
            lastProviderEvent: eventId,
            failureCode: 'AMOUNT_OR_CURRENCY_MISMATCH',
            failureMessage: `Expected ${current.amountMinor} ${current.currency}; provider reported ${providerAmount} ${providerCurrency}.`,
          },
        });
        return;
      }

      const correlationId = `stripe-checkout:${session.id}`;
      await tx.reservationDepositLedgerEntry.upsert({
        where: {
          shopId_correlationId: {
            shopId: current.shopId,
            correlationId,
          },
        },
        create: {
          shopId: current.shopId,
          reservationId: current.reservationId,
          type: 'CAPTURE',
          amountMinor: current.amountMinor,
          currency: current.currency,
          correlationId,
          note: 'Stripe Checkout reservation deposit',
        },
        update: {},
      });
      await tx.reservationDepositCheckoutAttempt.update({
        where: { id: current.id },
        data: {
          status: 'SUCCEEDED',
          providerPaymentIntentId:
            this.paymentIntentId(session.payment_intent) ??
            current.providerPaymentIntentId,
          lastProviderEvent: eventId,
          succeededAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });
    });
  }

  private async markProviderTerminal(
    eventId: string,
    providerSessionId: string,
    status: 'EXPIRED' | 'FAILED',
  ) {
    const row = await this.prisma.reservationDepositCheckoutAttempt.findUnique({
      where: { providerSessionId },
    });
    if (!row || row.status === 'SUCCEEDED') return;
    await this.prisma.reservationDepositCheckoutAttempt.update({
      where: { id: row.id },
      data: {
        status,
        lastProviderEvent: eventId,
        canceledAt: status === 'EXPIRED' ? new Date() : row.canceledAt,
      },
    });
  }

  private async statusForReservation(
    shopId: string,
    reservation: {
      id: string;
      billingBaseAmount: Prisma.Decimal | null;
      billedAmount: Prisma.Decimal | null;
    },
  ) {
    const numbers = await this.depositNumbers(this.prisma, shopId, reservation);
    const latestAttempt =
      await this.prisma.reservationDepositCheckoutAttempt.findFirst({
        where: { shopId, reservationId: reservation.id },
        orderBy: { createdAt: 'desc' },
        select: {
          status: true,
          amountMinor: true,
          currency: true,
          createdAt: true,
          expiresAt: true,
          succeededAt: true,
        },
      });
    return {
      reservationId: reservation.id,
      ...numbers,
      paid: numbers.requiredMinor > 0 && numbers.remainingMinor === 0,
      latestAttempt,
    };
  }

  private async depositNumbers(
    client: Prisma.TransactionClient | PrismaService,
    shopId: string,
    reservation: {
      id: string;
      billingBaseAmount: Prisma.Decimal | null;
      billedAmount: Prisma.Decimal | null;
    },
  ) {
    const [extension, entries, applications, shop] = await Promise.all([
      client.reservationExtension.findFirst({
        where: { shopId, reservationId: reservation.id },
      }),
      client.reservationDepositLedgerEntry.findMany({
        where: { shopId, reservationId: reservation.id },
        select: { amountMinor: true, currency: true },
      }),
      client.reservationDepositApplication.findMany({
        where: { shopId, reservationId: reservation.id },
        select: { amountMinor: true },
      }),
      client.shop.findUnique({
        where: { id: shopId },
        select: { currency: true },
      }),
    ]);

    const requiredMinor = this.requiredFromSnapshot(
      extension?.policySnapshot,
      reservation,
    );
    const balanceMinor = entries.reduce(
      (sum, entry) => sum + entry.amountMinor,
      0,
    );
    const appliedMinor = applications.reduce(
      (sum, application) => sum + application.amountMinor,
      0,
    );
    const currency = (
      entries[0]?.currency ?? shop?.currency ?? 'EUR'
    ).toUpperCase();
    return {
      requiredMinor,
      balanceMinor,
      appliedMinor,
      unappliedMinor: Math.max(0, balanceMinor - appliedMinor),
      remainingMinor: Math.max(0, requiredMinor - balanceMinor),
      currency,
    };
  }

  private requiredFromSnapshot(
    snapshot: Prisma.JsonValue | null | undefined,
    reservation: {
      billingBaseAmount: Prisma.Decimal | null;
      billedAmount: Prisma.Decimal | null;
    },
  ) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return 0;
    }
    const rule = snapshot as Record<string, Prisma.JsonValue>;
    const kind = String(rule.depositKind ?? 'NONE');
    if (kind === 'FIXED') {
      const value = Number(rule.depositFixedMinor ?? 0);
      return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    }
    if (kind === 'PERCENT') {
      const basisPoints = Number(rule.depositPercentBps ?? 0);
      const base = reservation.billingBaseAmount ?? reservation.billedAmount;
      if (!base || !Number.isFinite(basisPoints)) return 0;
      return Math.max(
        0,
        Math.round(
          (Math.round(Number(base.toString()) * 100) * basisPoints) / 10_000,
        ),
      );
    }
    return 0;
  }

  private async requireGuestReservation(
    slug: string,
    reservationId: string,
    token: string,
  ) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id: reservationId,
        ...guestTokenLookupWhere(shop.id, token),
      },
    });
    if (!reservation || !verifyPresentedGuestToken(reservation, token)) {
      throw new NotFoundException('Booking not found.');
    }
    assertGuestTokenActive(reservation);
    return { shopId: shop.id, reservation };
  }

  private stripe() {
    const key = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException('Stripe is not configured.');
    }
    return new Stripe(key);
  }

  private webBaseUrl() {
    const value =
      this.config.get<string>('WEB_APP_URL')?.trim() ||
      this.config.get<string>('WEB_ORIGIN')?.trim()?.split(',')[0]?.trim();
    if (!value || !/^https?:\/\//i.test(value)) {
      throw new ServiceUnavailableException(
        'Public web origin is not configured.',
      );
    }
    return value.replace(/\/$/, '');
  }

  private paymentIntentId(
    value: string | Stripe.PaymentIntent | null | undefined,
  ) {
    return typeof value === 'string' ? value : value?.id ?? null;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
