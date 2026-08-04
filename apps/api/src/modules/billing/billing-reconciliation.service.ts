import { Injectable, Logger } from '@nestjs/common';
import {
  BillingCanonicalSubscriptionStatus,
  BillingProvider,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isDualBillingEnabled } from './billing-config';
import { BillingProviderRegistry } from './billing-provider.registry';
import { ConfigService } from '@nestjs/config';

const LIVE: BillingCanonicalSubscriptionStatus[] = [
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'PAUSE_PENDING',
  'PAUSED',
  'RESUME_PENDING',
  'CANCEL_AT_PERIOD_END',
  'PROCESSING',
];

/**
 * Periodic compare of local BillingSubscription vs Stripe/Mollie.
 * Flags mismatches for operator review; does not auto-fix dangerous drift.
 * Invoked from BillingJobsProcessor under withBillingCronLock (single-flight).
 */
@Injectable()
export class BillingReconciliationService {
  private readonly logger = new Logger(BillingReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: BillingProviderRegistry,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async reconcileBatch(limit = 40) {
    if (!isDualBillingEnabled(this.config)) {
      return { checked: 0, mismatches: 0 };
    }
    const rows = await this.prisma.billingSubscription.findMany({
      where: {
        canonicalStatus: { in: LIVE },
        provider: { in: [BillingProvider.STRIPE, BillingProvider.MOLLIE] },
        providerSubscriptionId: { not: null },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    let mismatches = 0;
    for (const row of rows) {
      if (!row.providerSubscriptionId) continue;
      try {
        const adapter = this.registry.get(
          row.provider === BillingProvider.MOLLIE ? 'MOLLIE' : 'STRIPE',
        );
        const remote = await adapter.retrieveSubscription(
          row.providerSubscriptionId,
        );
        const issues: string[] = [];
        if (
          remote.status &&
          row.providerStatus &&
          remote.status !== row.providerStatus
        ) {
          issues.push(
            `providerStatus local=${row.providerStatus} remote=${remote.status}`,
          );
        }
        if (
          remote.currentPeriodEnd &&
          row.currentPeriodEnd &&
          Math.abs(
            remote.currentPeriodEnd.getTime() - row.currentPeriodEnd.getTime(),
          ) >
            2 * 60 * 60 * 1000
        ) {
          issues.push('currentPeriodEnd drift > 2h');
        }
        if (
          remote.amountMinor != null &&
          row.amountMinor != null &&
          remote.amountMinor !== row.amountMinor
        ) {
          issues.push(
            `amountMinor local=${row.amountMinor} remote=${remote.amountMinor}`,
          );
        }
        if (issues.length) {
          mismatches += 1;
          this.logger.warn(
            `Billing reconcile mismatch shop=${row.shopId} sub=${row.id}: ${issues.join('; ')}`,
          );
          await this.audit.recordForShop(row.shopId, {
            section: 'subscription',
            action: 'billing.reconcile_mismatch',
            summary: `Provider/local mismatch on ${row.provider} subscription`,
            meta: {
              billingSubscriptionId: row.id,
              issues,
              remoteStatus: remote.status,
            },
            actorName: 'Billing reconciliation',
          });
        }
      } catch (err) {
        this.logger.warn(
          `Billing reconcile failed for ${row.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { checked: rows.length, mismatches };
  }
}
