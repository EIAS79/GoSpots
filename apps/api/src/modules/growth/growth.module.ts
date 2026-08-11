import { Module } from '@nestjs/common';
import { GuestCheckModule } from '../guest-check/guest-check.module';
import { CommerceGrowthService } from './commerce-growth.service';
import { EventsGrowthService } from './events-growth.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { GrowthCapacityService } from './growth-capacity.service';
import { GrowthCrmService } from './growth-crm.service';
import { GrowthPricingService } from './growth-pricing.service';
import { GrowthPublicController } from './growth-public.controller';
import { GrowthController } from './growth.controller';
import { ReservationGrowthService } from './reservation-growth.service';

@Module({
  imports: [GuestCheckModule],
  controllers: [GrowthController, GrowthPublicController],
  providers: [
    ReservationGrowthService,
    GrowthCapacityService,
    GrowthPricingService,
    GrowthCrmService,
    CommerceGrowthService,
    EventsGrowthService,
    GrowthAnalyticsService,
  ],
  exports: [
    ReservationGrowthService,
    GrowthCapacityService,
    CommerceGrowthService,
    EventsGrowthService,
    GrowthAnalyticsService,
  ],
})
export class GrowthModule {}
