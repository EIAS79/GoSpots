import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** When true, production throws if Resend is not configured. */
  required?: boolean;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('RESEND_API_KEY')?.trim());
  }

  private isProduction() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  async send(input: SendMailInput): Promise<{ sent: boolean; skipped?: boolean }> {
    const to = input.to.trim().toLowerCase();
    if (!to) return { sent: false, skipped: true };

    const from = this.fromAddress();
    const resendKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const required = input.required === true;

    if (resendKey) {
      await this.sendViaResend(resendKey, from, input);
      return { sent: true };
    }

    this.logger.warn(
      `[mail skipped] Set RESEND_API_KEY to send email. Would send to ${to}: ${input.subject}`,
    );

    if (required || this.isProduction()) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Set RESEND_API_KEY (and MAIL_FROM) on the API.',
      );
    }

    this.logger.log(`--- email preview ---\n${input.text}\n---`);
    return { sent: false, skipped: true };
  }

  private fromAddress() {
    const name =
      this.config.get<string>('MAIL_FROM_NAME')?.trim() || 'GoSpots';
    const email =
      this.config.get<string>('MAIL_FROM')?.trim() ||
      'bookings@notifications.gospots.app';
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
