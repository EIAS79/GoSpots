import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type {
  FiscalConnector,
  FiscalConnectorResult,
  FiscalSubmitInput,
} from './fiscal-connector';

@Injectable()
export class SimulatedFiscalConnector implements FiscalConnector {
  readonly provider = 'SIMULATED';
  private readonly results = new Map<string, FiscalConnectorResult>();

  constructor(private readonly config: ConfigService) {}

  private allowed() {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException('Simulated fiscalization is disabled in production.');
    }
  }

  async submit(input: FiscalSubmitInput): Promise<FiscalConnectorResult> {
    this.allowed();
    const existing = this.results.get(input.idempotencyKey);
    if (existing) return existing;
    const digest = createHash('sha256')
      .update(`${input.documentId}|${input.documentNumber}|${input.grossAmount}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();
    const result: FiscalConnectorResult = {
      state: 'ACCEPTED',
      externalReference: `sim-${input.documentId}`,
      fiscalNumber: `SIM-${digest}`,
      proof: JSON.stringify({
        simulated: true,
        documentNumber: input.documentNumber,
        fiscalNumber: `SIM-${digest}`,
      }),
      payload: { simulated: true },
    };
    this.results.set(input.idempotencyKey, result);
    return result;
  }

  async status(externalReference: string): Promise<FiscalConnectorResult> {
    this.allowed();
    for (const value of this.results.values()) {
      if ('externalReference' in value && value.externalReference === externalReference) return value;
    }
    return {
      state: 'UNKNOWN',
      externalReference,
      errorCode: 'SIM_NOT_FOUND',
      errorMessage: 'Simulated fiscal reference was not found.',
    };
  }

  async health() {
    this.allowed();
    return { ok: true, message: 'Non-production simulated fiscal connector ready.' };
  }
}
