import { BadRequestException, Injectable } from '@nestjs/common';
import type { FiscalConnector } from './fiscal-connector';
import { HttpFiscalConnector } from './http-fiscal.connector';
import { SimulatedFiscalConnector } from './simulated-fiscal.connector';

@Injectable()
export class FiscalConnectorRegistry {
  private readonly connectors: Map<string, FiscalConnector>;

  constructor(
    simulated: SimulatedFiscalConnector,
    http: HttpFiscalConnector,
  ) {
    this.connectors = new Map([
      [simulated.provider, simulated],
      [http.provider, http],
    ]);
  }

  get(provider: string): FiscalConnector {
    const normalized = provider.trim().toUpperCase();
    const connector = this.connectors.get(normalized);
    if (!connector) {
      throw new BadRequestException(
        `Unsupported fiscal provider '${normalized}'. Supported providers: ${[...this.connectors.keys()].join(', ')}.`,
      );
    }
    return connector;
  }
}
