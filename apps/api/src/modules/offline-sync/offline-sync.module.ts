import { Module } from '@nestjs/common';
import { OrderingModule } from '../ordering/ordering.module';
import { OfflineSyncController } from './offline-sync.controller';
import { OfflineSyncService } from './offline-sync.service';

@Module({
  imports: [OrderingModule],
  controllers: [OfflineSyncController],
  providers: [OfflineSyncService],
  exports: [OfflineSyncService],
})
export class OfflineSyncModule {}
