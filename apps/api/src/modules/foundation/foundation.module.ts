import { Global, Module } from '@nestjs/common';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagService } from './feature-flag.service';

@Global()
@Module({
  providers: [DomainEventOutboxService, FeatureFlagService, FeatureFlagGuard],
  exports: [DomainEventOutboxService, FeatureFlagService, FeatureFlagGuard],
})
export class FoundationModule {}
