import { Module } from '@nestjs/common';
import { OfflineSyncModule } from '../offline-sync/offline-sync.module';
import { EdgeHubController } from './edge-hub.controller';
import { EdgeHubService } from './edge-hub.service';

@Module({
  imports: [OfflineSyncModule],
  controllers: [EdgeHubController],
  providers: [EdgeHubService],
  exports: [EdgeHubService],
})
export class EdgeHubModule {}
