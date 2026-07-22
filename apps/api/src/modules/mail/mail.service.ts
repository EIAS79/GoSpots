import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailOutboxService } from './mail-outbox.service';
import type { MailOutboxIntent, MailOutboxPayload } from './mail-outbox.types';

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** When true, production throws if Resend is not configured. */
  required?: boolean;
  /** Optional tenant scope for the outbox row. */
  shopId?: string | null;
  /** Optional dedupe key for the outbox row. */
  idempotencyKey?: string | null;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly outbox: MailOutboxService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('RESEND_API_KEY')?.trim());
  }

  private isProduction() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /**
   * Persist to MailOutbox first, then attempt Resend. On success → SENT;
   * on failure → FAILED with retry schedule (worker picks up).
   */
  async send(input: SendMailInput): Promise<{ sent: boolean; skipped?: boolean }> {
    const to = input.to.trim().toLowerCase();
    if (!to) return { sent: false, skipped: true };

    const intent: MailOutboxIntent = {
      to,
      subject: input.subject,
      required: input.required,
    };

    const { id: outboxId } = await this.outbox.enqueue({
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      required: input.required,
      shopId: input.shopId,
      idempotencyKey: input.idempotencyKey,
    });

    try {
      const result = await this.deliverPayload({
        to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        required: input.required,
      });

      if (result.sent) {
        await this.outbox.markSent(outboxId, intent);
        return { sent: true };
      }

      await this.outbox.markSkipped(outboxId, intent);
      return { sent: false, skipped: true };
    } catch (error) {
      await this.outbox.markFailed(outboxId, error, intent);
      throw error;
    }
  }

  /**
   * Deliver without enqueue (used by `MailOutboxProcessor` for retries).
   * Throws on hard failure; returns skipped when Resend is unset in non-prod.
   */
  async deliverPayload(
    payload: MailOutboxPayload,
  ): Promise<{ sent: boolean; skipped?: boolean }> {
    const to = payload.to.trim().toLowerCase();
    if (!to) return { sent: false, skipped: true };

    const from = this.fromAddress();
    const resendKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const required = payload.required === true;

    if (resendKey) {
      await this.sendViaResend(resendKey, from, {
        to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        required: payload.required,
      });
      return { sent: true };
    }

    this.logger.warn(
      `[mail skipped] Set RESEND_API_KEY to send email. Would send to ${to}: ${payload.subject}`,
    );

    if (required || this.isProduction()) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Set RESEND_API_KEY (and MAIL_FROM) on the API.',
      );
    }

    this.logger.log(`--- email preview ---\n${payload.text}\n---`);
    return { sent: false, skipped: true };
  }

  private fromAddress() {
    const name =
      this.config.get<string>('MAIL_FROM_NAME')?.trim() || 'Locora';
    const email =
      this.config.get<string>('MAIL_FROM')?.trim() ||
      'bookings@notifications.locora.app';
    return `${name} <${email}>`;
  }

  private async sendViaResend(
    apiKey: string,
    from: string,
    input: SendMailInput,
  ) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend API ${res.status}: ${body}`);
    }
  }
}
