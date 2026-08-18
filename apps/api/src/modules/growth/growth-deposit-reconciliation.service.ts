import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { GrowthPublicDepositService } from './growth-public-deposit.service';

@Injectable()
export class GrowthDepositReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly deposits: GrowthPublicDepositService,
  ) {}

  async reconcile(providerSessionId: string) {
    const sessionId = providerSessionId?.trim();
    if (!sessionId || !sessionId.startsWith('cs_')) {
      throw new BadRequestException('A valid Stripe Checkout sessionId is required.');
    }

    const attempt =
      await this.prisma.reservationDepositCheckoutAttempt.findUnique({
        where: { providerSessionId: sessionId },
      });
    if (!attempt) {
      throw new NotFoundException('Reservation deposit checkout attempt not found.');
    }

    const stripe = this.stripe();
    let session: Stripe.Checkout.Session | null = null;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      // An already-captured deposit remains canonically succeeded even if the
      // provider read is temporarily unavailable. Recovery of an unresolved
      // attempt still requires a successful provider read.
      if (attempt.status !== 'SUCCEEDED') {
        throw new ServiceUnavailableException(
          'Stripe Checkout status could not be reconciled.',
        );
      }
    }

    if (session) {
      if (
        session.metadata?.purpose !== 'RESERVATION_DEPOSIT' ||
        session.metadata?.reservationId !== attempt.reservationId ||
        session.metadata?.shopId !== attempt.shopId
      ) {
        throw new ConflictException(
          'Stripe Checkout metadata does not match the reservation deposit attempt.',
        );
      }

      if (session.payment_status === 'paid' && session.status === 'complete') {
        const secret = this.webhookSecret();
        const payload = JSON.stringify({
          id: `reconcile:${session.id}`,
          object: 'event',
          api_version: null,
          created: Math.floor(Date.now() / 1000),
          data: { object: session },
          livemode: session.livemode,
          pending_webhooks: 0,
          request: null,
          type: 'checkout.session.completed',
        });
        const signature = stripe.webhooks.generateTestHeaderString({
          payload,
          secret,
        });

        // Always reuse the exact signed-webhook capture path, including after
        // success. A repeated reconciliation therefore exercises the same
        // duplicate-callback path as Stripe while the webhook handler's lock,
        // SUCCEEDED guard and ledger correlation keep the financial fact single.
        await this.deposits.handleStripeWebhook(
          Buffer.from(payload, 'utf8'),
          signature,
        );
      }
    }

    const [current, ledger] = await Promise.all([
      this.prisma.reservationDepositCheckoutAttempt.findUnique({
        where: { providerSessionId: sessionId },
      }),
      this.prisma.reservationDepositLedgerEntry.findMany({
        where: {
          shopId: attempt.shopId,
          reservationId: attempt.reservationId,
        },
        select: { amountMinor: true, type: true, correlationId: true },
      }),
    ]);

    const balanceMinor = ledger.reduce(
      (sum, entry) => sum + entry.amountMinor,
      0,
    );

    return {
      reservationId: attempt.reservationId,
      checkoutSessionId: sessionId,
      attemptStatus: current?.status ?? attempt.status,
      reconciled: current?.status === 'SUCCEEDED',
      balanceMinor,
      currency: attempt.currency,
      ledgerEntries: ledger.length,
    };
  }

  private stripe() {
    const key = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException('Stripe is not configured.');
    }
    return new Stripe(key);
  }

  private webhookSecret() {
    const secret =
      this.config
        .get<string>('STRIPE_RESERVATION_DEPOSIT_WEBHOOK_SECRET')
        ?.trim() || this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'Stripe reservation-deposit webhook is not configured.',
      );
    }
    return secret;
  }
}
