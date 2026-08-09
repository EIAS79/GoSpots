import { Global, Module } from '@nestjs/common';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { FeatureFlagService } from './feature-flag.service';

@Global()
@Module({
  providers: [DomainEventOutboxService, FeatureFlagService],
  exports: [DomainEventOutboxService, FeatureFlagService],
})
export class FoundationModule {}
