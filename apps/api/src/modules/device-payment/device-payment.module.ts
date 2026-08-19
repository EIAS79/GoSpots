import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceRegistryService } from './device-registry.service';
import { AdyenTerminalConnector } from './connectors/adyen-terminal.connector';
import { FakePaymentConnectorProvider } from './connectors/fake-payment.provider';
import { PaymentConnectorRegistry } from './connectors/payment-connector.registry';
import { StripeTerminalConnector } from './connectors/stripe-terminal.connector';
import { AdyenTerminalWebhookController } from './adyen-terminal-webhook.controller';
import { PaymentDomainService } from './payment-domain.service';
import { PaymentOperationStateService } from './payment-operation-state.service';
import { PaymentController } from './payment.controller';
import { StripeTerminalWebhookController } from './stripe-terminal-webhook.controller';
import { MoneyOperationsController } from './money-operations.controller';
import { MoneyOperationsService } from './money-operations.service';

@Module({
  controllers: [
    DeviceController,
    PaymentController,
    MoneyOperationsController,
    AdyenTerminalWebhookController,
    StripeTerminalWebhookController,
  ],
  providers: [
    DeviceRegistryService,
    PaymentConnectorRegistry,
    AdyenTerminalConnector,
    StripeTerminalConnector,
    FakePaymentConnectorProvider,
    PaymentOperationStateService,
    PaymentDomainService,
    MoneyOperationsService,
  ],
  exports: [
    DeviceRegistryService,
    PaymentConnectorRegistry,
    AdyenTerminalConnector,
    StripeTerminalConnector,
    PaymentOperationStateService,
    PaymentDomainService,
    MoneyOperationsService,
  ],
})
export class DevicePaymentModule {}
