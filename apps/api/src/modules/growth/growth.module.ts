import { Module } from '@nestjs/common';
import { GuestCheckModule } from '../guest-check/guest-check.module';
import { CommerceGrowthService } from './commerce-growth.service';
import { EventsGrowthService } from './events-growth.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { GrowthCapacityService } from './growth-capacity.service';
import { GrowthCrmService } from './growth-crm.service';
import { GrowthDepositPublicController } from './growth-deposit-public.controller';
import { GrowthDepositWebhookController } from './growth-deposit-webhook.controller';
import { GrowthPricingService } from './growth-pricing.service';
import { GrowthPrivacyService } from './growth-privacy.service';
import { GrowthPublicController } from './growth-public.controller';
import { GrowthPublicDepositService } from './growth-public-deposit.service';
import { GrowthController } from './growth.controller';
import { ReservationGrowthService } from './reservation-growth.service';

@Module({
  imports: [GuestCheckModule],
  controllers: [
    GrowthController,
    GrowthPublicController,
    GrowthDepositPublicController,
    GrowthDepositWebhookController,
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
  ],
  exports: [
    ReservationGrowthService,
    GrowthCapacityService,
    GrowthPrivacyService,
    CommerceGrowthService,
    EventsGrowthService,
    GrowthAnalyticsService,
  ],
})
export class GrowthModule {}
