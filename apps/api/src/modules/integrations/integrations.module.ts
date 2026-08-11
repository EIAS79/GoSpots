import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FoundationModule } from '../foundation/foundation.module';
import { DemoIntegrationConnector } from './connectors/demo.connector';
import { GoPosIntegrationConnector } from './connectors/gopos.connector';
import { IntegrationConnectorRegistry } from './connectors/integration-connector.registry';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { IntegrationInboundWebhookController } from './integration-inbound-webhook.controller';
import { IntegrationSecretBoxService } from './integration-secret-box.service';
import { IntegrationV1Controller } from './integration-v1.controller';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [FoundationModule, AuditModule],
  controllers: [
    IntegrationsController,
    IntegrationInboundWebhookController,
    IntegrationV1Controller,
  ],
  providers: [
    IntegrationsService,
    IntegrationSecretBoxService,
    DemoIntegrationConnector,
    GoPosIntegrationConnector,
    IntegrationConnectorRegistry,
    IntegrationApiKeyGuard,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
