import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { InventoryPhase7Service } from './inventory-phase7.service';
import { InventoryV2Controller } from './inventory-v2.controller';
import { InventoryV2Service } from './inventory-v2.service';
@Module({imports:[PrismaModule,AuditModule],controllers:[InventoryV2Controller],providers:[InventoryV2Service,InventoryPhase7Service],exports:[InventoryV2Service,InventoryPhase7Service]})
export class InventoryV2Module{}
