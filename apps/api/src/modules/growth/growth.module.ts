import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { GuestCheckModule } from '../guest-check/guest-check.module';
import { CommerceGrowthService } from './commerce-growth.service';
import { EventsGrowthService } from './events-growth.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { GrowthCapacityService } from './growth-capacity.service';
import { GrowthCrmService } from './growth-crm.service';
import { GrowthDepositPublicController } from './growth-deposit-public.controller';
import { GrowthDepositReconciliationService } from './growth-deposit-reconciliation.service';
import { GrowthDepositWebhookController } from './growth-deposit-webhook.controller';
import { GrowthPricingService } from './growth-pricing.service';
import { GrowthPrivacyService } from './growth-privacy.service';
import { GrowthPublicController } from './growth-public.controller';
import { GrowthPublicDepositService } from './growth-public-deposit.service';
import { GrowthController } from './growth.controller';
import { Phase14AnalyticsController } from './phase14-analytics.controller';
import { Phase14AnalyticsService } from './phase14-analytics.service';
import { Phase9CustomerPortalProfileController } from './phase9-customer-portal-profile.controller';
import { Phase9CustomerPortalProfileService } from './phase9-customer-portal-profile.service';
import {
  Phase9CustomerPortalController,
  Phase9CustomerValueController,
} from './phase9-customer-value.controller';
import { Phase9CustomerPortalService } from './phase9-customer-portal.service';
import { Phase9CustomerValueService } from './phase9-customer-value.service';
import { Phase9GrowthInterceptor } from './phase9-growth.interceptor';
import { Phase9GuardrailsService } from './phase9-guardrails.service';
import { Phase9LoyaltyExpiryService } from './phase9-loyalty-expiry.service';
import { Phase9ReconciliationController } from './phase9-reconciliation.controller';
import { Phase9ReconciliationService } from './phase9-reconciliation.service';
import { Phase8ReservationController } from './phase8-reservation.controller';
import { Phase8ReservationService } from './phase8-reservation.service';
import { ReservationGrowthService } from './reservation-growth.service';
import { ReservationStripeWebhookRoutingInterceptor } from './reservation-stripe-webhook-routing.interceptor';

@Module({
  imports: [GuestCheckModule],
  controllers: [
    GrowthController,
    GrowthPublicController,
    GrowthDepositPublicController,
    GrowthDepositWebhookController,
    Phase8ReservationController,
    Phase9CustomerValueController,
    Phase9CustomerPortalController,
    Phase9CustomerPortalProfileController,
    Phase9ReconciliationController,
    Phase14AnalyticsController,
  ],
  providers: [
    ReservationGrowthService,
    GrowthCapacityService,
    GrowthPricingService,
    GrowthCrmService,
    GrowthPrivacyService,
    CommerceGrowthService,
    EventsGrowthService,
    GrowthAnalyticsService,
    GrowthPublicDepositService,
    GrowthDepositReconciliationService,
    Phase8ReservationService,
    Phase9CustomerValueService,
    Phase9CustomerPortalService,
    Phase9CustomerPortalProfileService,
    Phase9GuardrailsService,
    Phase9LoyaltyExpiryService,
    Phase9ReconciliationService,
    Phase14AnalyticsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ReservationStripeWebhookRoutingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: Phase9GrowthInterceptor,
    },
  ],
  exports: [
    ReservationGrowthService,
    GrowthCapacityService,
    GrowthPrivacyService,
    CommerceGrowthService,
    EventsGrowthService,
    GrowthAnalyticsService,
    Phase8ReservationService,
    Phase9CustomerValueService,
    Phase9GuardrailsService,
    Phase9ReconciliationService,
    Phase14AnalyticsService,
  ],
})
export class GrowthModule {}
