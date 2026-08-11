import { Module } from '@nestjs/common';
import { CommerceGrowthService } from './commerce-growth.service';
import { EventsGrowthService } from './events-growth.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { GrowthCapacityService } from './growth-capacity.service';
import { GrowthPublicController } from './growth-public.controller';
import { GrowthController } from './growth.controller';
import { ReservationGrowthService } from './reservation-growth.service';

@Module({
  controllers: [GrowthController, GrowthPublicController],
  providers: [
    ReservationGrowthService,
    GrowthCapacityService,
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
