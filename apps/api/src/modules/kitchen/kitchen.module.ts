import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
@Module({imports:[PrismaModule,AuditModule],controllers:[KitchenController],providers:[KitchenService],exports:[KitchenService]}) export class KitchenModule {}
