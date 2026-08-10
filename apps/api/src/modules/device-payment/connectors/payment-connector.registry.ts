import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentConnector } from './payment-connector';

export function normalizePaymentProvider(provider: string): string {
  return String(provider ?? '').trim().toLowerCase();
}

@Injectable()
export class PaymentConnectorRegistry {
  private readonly connectors = new Map<string, PaymentConnector>();

  register(connector: PaymentConnector): void {
    const key = normalizePaymentProvider(connector.provider);
    if (!key) throw new Error('Payment connector provider is required');
    if (this.connectors.has(key)) {
      throw new Error(`Payment connector already registered: ${key}`);
    }
    this.connectors.set(key, connector);
  }

  resolve(provider: string): PaymentConnector {
    const key = normalizePaymentProvider(provider);
    const connector = this.connectors.get(key);
    if (!connector) {
      throw new NotFoundException(`Payment connector is not configured: ${key || 'unknown'}`);
    }
    return connector;
  }

  has(provider: string): boolean {
    return this.connectors.has(normalizePaymentProvider(provider));
  }

  providers(): string[] {
    return [...this.connectors.keys()].sort();
  }
}
