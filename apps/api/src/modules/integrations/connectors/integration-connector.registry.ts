import { BadRequestException, Injectable } from '@nestjs/common';
import { DemoIntegrationConnector } from './demo.connector';
import type { IntegrationConnector } from './integration-connector';

@Injectable()
export class IntegrationConnectorRegistry {
  private readonly connectors: Map<string, IntegrationConnector>;

  constructor(demo: DemoIntegrationConnector) {
    this.connectors = new Map(
      [demo].map((connector) => [connector.provider, connector]),
    );
  }

  normalize(provider: string) {
    return provider.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  }

  get(provider: string): IntegrationConnector {
    const normalized = this.normalize(provider);
    const connector = this.connectors.get(normalized);
    if (!connector) throw new BadRequestException(`Unsupported integration provider: ${normalized}`);
    return connector;
  }

  list() {
    return [...this.connectors.values()].map((connector) => ({
      provider: connector.provider,
      capabilities: connector.capabilities(),
    }));
  }
}
