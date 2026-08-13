import { Global, Module } from '@nestjs/common';
import { CapabilityService } from './capability.service';
import { DomainEventConsumerService } from './domain-event-consumer.service';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagService } from './feature-flag.service';

@Global()
@Module({
  providers: [
    DomainEventOutboxService,
    DomainEventConsumerService,
    FeatureFlagService,
    CapabilityService,
    FeatureFlagGuard,
  ],
  exports: [
    DomainEventOutboxService,
    DomainEventConsumerService,
    FeatureFlagService,
    CapabilityService,
    FeatureFlagGuard,
  ],
})
export class FoundationModule {}
