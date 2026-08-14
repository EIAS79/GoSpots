import { BadRequestException } from '@nestjs/common';
import { DemoIntegrationConnector } from './demo.connector';
import { IntegrationConnectorRegistry } from './integration-connector.registry';

describe('IntegrationConnectorRegistry', () => {
  it('registers only the standalone demo connector by default', () => {
    const registry = new IntegrationConnectorRegistry(new DemoIntegrationConnector());
    expect(registry.list()).toEqual([
      expect.objectContaining({ provider: 'demo' }),
    ]);
  });

  it('rejects providers that are not explicitly installed in the registry', () => {
    const registry = new IntegrationConnectorRegistry(new DemoIntegrationConnector());
    expect(() => registry.get('unknown-provider')).toThrow(BadRequestException);
  });
});
