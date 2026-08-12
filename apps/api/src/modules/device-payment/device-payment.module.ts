import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceRegistryService } from './device-registry.service';
import { FakePaymentConnectorProvider } from './connectors/fake-payment.provider';
import { PaymentConnectorRegistry } from './connectors/payment-connector.registry';
import { StripeTerminalConnector } from './connectors/stripe-terminal.connector';
import { PaymentDomainService } from './payment-domain.service';
import { PaymentOperationStateService } from './payment-operation-state.service';
import { PaymentController } from './payment.controller';
import { StripeTerminalWebhookController } from './stripe-terminal-webhook.controller';

@Module({
  controllers: [DeviceController, PaymentController, StripeTerminalWebhookController],
  providers: [
    DeviceRegistryService,
    PaymentConnectorRegistry,
    StripeTerminalConnector,
    FakePaymentConnectorProvider,
    PaymentOperationStateService,
    PaymentDomainService,
  ],
  exports: [
    DeviceRegistryService,
    PaymentConnectorRegistry,
    StripeTerminalConnector,
    PaymentOperationStateService,
    PaymentDomainService,
  ],
})
export class DevicePaymentModule {}
