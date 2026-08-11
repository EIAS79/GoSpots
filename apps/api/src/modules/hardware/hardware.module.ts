import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EdgeHubModule } from '../edge-hub/edge-hub.module';
import { FoundationModule } from '../foundation/foundation.module';
import { HardwareController } from './hardware.controller';
import { HardwareRecoveryService } from './hardware-recovery.service';
import { HardwareService } from './hardware.service';

@Module({
  imports: [FoundationModule, AuditModule, EdgeHubModule],
  controllers: [HardwareController],
  providers: [HardwareService, HardwareRecoveryService],
  exports: [HardwareService],
})
export class HardwareModule {}
