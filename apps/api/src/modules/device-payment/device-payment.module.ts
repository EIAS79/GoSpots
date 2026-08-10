import { Module } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceRegistryService } from './device-registry.service';
import { PaymentConnectorRegistry } from './connectors/payment-connector.registry';
import { PaymentDomainService } from './payment-domain.service';
import { PaymentOperationStateService } from './payment-operation-state.service';

@Module({
  controllers: [DeviceController],
  providers: [
    DeviceRegistryService,
    PaymentConnectorRegistry,
    PaymentOperationStateService,
    PaymentDomainService,
  ],
  exports: [
    DeviceRegistryService,
    PaymentConnectorRegistry,
    PaymentOperationStateService,
    PaymentDomainService,
  ],
})
export class DevicePaymentModule {}
