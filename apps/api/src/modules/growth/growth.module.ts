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
    {
      provide: APP_INTERCEPTOR,
      useClass: ReservationStripeWebhookRoutingInterceptor,
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
  ],
})
export class GrowthModule {}
