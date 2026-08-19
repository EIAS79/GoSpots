import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceRegistryService } from './device-registry.service';
import { AdyenTerminalConnector } from './connectors/adyen-terminal.connector';
import { FakePaymentConnectorProvider } from './connectors/fake-payment.provider';
import { PaymentConnectorRegistry } from './connectors/payment-connector.registry';
import { AdyenTerminalWebhookController } from './adyen-terminal-webhook.controller';
import { PaymentDomainService } from './payment-domain.service';
import { PaymentOperationStateService } from './payment-operation-state.service';
import { PaymentController } from './payment.controller';
import { MoneyOperationsController } from './money-operations.controller';
import { MoneyOperationsService } from './money-operations.service';

@Module({
  controllers: [
    DeviceController,
    PaymentController,
    MoneyOperationsController,
    AdyenTerminalWebhookController,
  ],
  providers: [
    DeviceRegistryService,
    PaymentConnectorRegistry,
    AdyenTerminalConnector,
    FakePaymentConnectorProvider,
    PaymentOperationStateService,
    PaymentDomainService,
    MoneyOperationsService,
  ],
  exports: [
    DeviceRegistryService,
    PaymentConnectorRegistry,
    AdyenTerminalConnector,
    PaymentOperationStateService,
    PaymentDomainService,
    MoneyOperationsService,
  ],
})
export class DevicePaymentModule {}
