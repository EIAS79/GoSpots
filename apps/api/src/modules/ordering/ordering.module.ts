import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { OrderingController } from './ordering.controller';
import { OrderingPricingService } from './ordering-pricing.service';
import { OrderingService } from './ordering.service';

@Module({ imports: [PrismaModule, AuditModule], controllers: [OrderingController], providers: [OrderingPricingService, OrderingService], exports: [OrderingPricingService, OrderingService] })
export class OrderingModule {}
