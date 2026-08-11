import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EdgeHubModule } from '../edge-hub/edge-hub.module';
import { FoundationModule } from '../foundation/foundation.module';
import { HardwareController } from './hardware.controller';
import { HardwareService } from './hardware.service';

@Module({
  imports: [FoundationModule, AuditModule, EdgeHubModule],
  controllers: [HardwareController],
  providers: [HardwareService],
  exports: [HardwareService],
})
export class HardwareModule {}
