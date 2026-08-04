import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingWebhookService } from './billing-webhook.service';

/**
 * Claims RECEIVED / retryable FAILED dual-provider webhook inbox rows.
 * Also kicked after ingest for low-latency processing.
 */
@Injectable()
export class BillingWebhookProcessor {
  private readonly logger = new Logger(BillingWebhookProcessor.name);

  constructor(private readonly webhooks: BillingWebhookService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      const n = await this.webhooks.processDueEvents(40);
      if (n > 0) {
        this.logger.debug(`Processed ${n} billing webhook event(s)`);
      }
    } catch (err) {
      this.logger.error(
        `Webhook processor tick failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Fire-and-forget after durable inbox insert. */
  enqueueSoon(eventIdHint?: string) {
    void this.tick().catch((err) =>
      this.logger.warn(
        `Immediate webhook drain failed (${eventIdHint ?? 'n/a'}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
  }
}
