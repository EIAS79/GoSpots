import { Global, Module } from '@nestjs/common';
import { CapabilityService } from './capability.service';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagService } from './feature-flag.service';

@Global()
@Module({
  providers: [
    DomainEventOutboxService,
    FeatureFlagService,
    CapabilityService,
    FeatureFlagGuard,
  ],
  exports: [
    DomainEventOutboxService,
    FeatureFlagService,
    CapabilityService,
    FeatureFlagGuard,
  ],
})
export class FoundationModule {}
