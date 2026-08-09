import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShopModule } from '../shop/shop.module';
import { BillingCatalogService } from './billing-catalog.service';
import { BillingController } from './billing.controller';
import { BillingEntitlementSync } from './billing-entitlement.sync';
import { BillingJobsProcessor } from './billing-jobs.processor';
import { BillingNotificationService } from './billing-notification.service';
import { BillingOrchestratorService } from './billing-orchestrator.service';
import { BillingProviderRegistry } from './billing-provider.registry';
import { BillingReconciliationService } from './billing-reconciliation.service';
import { BillingService } from './billing.service';
import { BillingWebhookProcessor } from './billing-webhook.processor';
import { BillingWebhookService } from './billing-webhook.service';
import { TrialCheckoutGuard } from './guards/trial-checkout.guard';
import { LemonSqueezyClient } from './lemon-squeezy.client';
import { MollieBillingAdapter } from './providers/mollie.adapter';
import { StripeBillingAdapter } from './providers/stripe.adapter';

@Module({
  imports: [AuditModule, ShopModule, NotificationsModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    LemonSqueezyClient,
    BillingCatalogService,
    BillingEntitlementSync,
    BillingNotificationService,
    StripeBillingAdapter,
    MollieBillingAdapter,
    BillingProviderRegistry,
    BillingOrchestratorService,
    BillingWebhookService,
    BillingWebhookProcessor,
    BillingJobsProcessor,
    BillingReconciliationService,
    TrialCheckoutGuard,
  ],
  exports: [
    BillingService,
    BillingCatalogService,
    BillingEntitlementSync,
    BillingProviderRegistry,
    BillingOrchestratorService,
    BillingNotificationService,
    StripeBillingAdapter,
    MollieBillingAdapter,
  ],
})
export class BillingModule {}
