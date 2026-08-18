import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { OfflineSyncModule } from '../offline-sync/offline-sync.module';
import { OperationsModule } from '../operations/operations.module';
import { EdgeContinuityService } from './edge-continuity.service';
import { EdgeHubController } from './edge-hub.controller';
import { EdgeHubService } from './edge-hub.service';

@Module({
  imports: [OfflineSyncModule, OperationsModule, CheckoutModule],
  controllers: [EdgeHubController],
  providers: [EdgeHubService, EdgeContinuityService],
  exports: [EdgeHubService, EdgeContinuityService],
})
export class EdgeHubModule {}
