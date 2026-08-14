import { BadRequestException } from '@nestjs/common';
import { DemoIntegrationConnector } from './demo.connector';
import { IntegrationConnectorRegistry } from './integration-connector.registry';

describe('IntegrationConnectorRegistry', () => {
  it('registers only explicitly installed standalone connectors', () => {
    const registry = new IntegrationConnectorRegistry(
      new DemoIntegrationConnector(),
    );

    expect(registry.list()).toEqual([
      expect.objectContaining({ provider: 'demo' }),
    ]);
  });

  it('rejects providers that are not explicitly installed', () => {
    const registry = new IntegrationConnectorRegistry(
      new DemoIntegrationConnector(),
    );

    expect(() => registry.get('unknown-provider')).toThrow(BadRequestException);
  });
});
