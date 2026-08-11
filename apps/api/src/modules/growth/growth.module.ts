import { Module } from '@nestjs/common';
import { CommerceGrowthService } from './commerce-growth.service';
import { EventsGrowthService } from './events-growth.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { GrowthController } from './growth.controller';
import { ReservationGrowthService } from './reservation-growth.service';

@Module({controllers:[GrowthController],providers:[ReservationGrowthService,CommerceGrowthService,EventsGrowthService,GrowthAnalyticsService],exports:[ReservationGrowthService,CommerceGrowthService,EventsGrowthService,GrowthAnalyticsService]})
export class GrowthModule {}
