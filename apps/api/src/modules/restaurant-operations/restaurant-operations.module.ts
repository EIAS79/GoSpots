import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrderingModule } from '../ordering/ordering.module';
import { RestaurantConfigurationService } from './restaurant-configuration.service';
import { RestaurantOperationsController } from './restaurant-operations.controller';
import { RestaurantOperationsService } from './restaurant-operations.service';
import { RestaurantOrderIntegrityService } from './restaurant-order-integrity.service';

@Module({
  imports: [PrismaModule, OrderingModule],
  controllers: [RestaurantOperationsController],
  providers: [RestaurantOperationsService, RestaurantConfigurationService, RestaurantOrderIntegrityService],
  exports: [RestaurantOperationsService, RestaurantConfigurationService, RestaurantOrderIntegrityService],
})
export class RestaurantOperationsModule {}
