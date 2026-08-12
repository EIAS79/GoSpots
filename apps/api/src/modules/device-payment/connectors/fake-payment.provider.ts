import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakePaymentConnector } from './fake-payment.connector';
import { PaymentConnectorRegistry } from './payment-connector.registry';

/**
 * Test-only connector registration. It is deliberately impossible to enable in
 * production, even if E2E_FAKE_PAYMENT_ENABLED is accidentally present.
 */
@Injectable()
export class FakePaymentConnectorProvider implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly registry: PaymentConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'production') return;
    if (
      this.config
        .get<string>('E2E_FAKE_PAYMENT_ENABLED')
        ?.trim()
        .toLowerCase() !== 'true'
    ) {
      return;
    }
    if (!this.registry.has('fake')) {
      this.registry.register(new FakePaymentConnector());
    }
  }
}
