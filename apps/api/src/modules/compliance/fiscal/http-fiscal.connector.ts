import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type {
  FiscalConnector,
  FiscalConnectorResult,
  FiscalSubmitInput,
} from './fiscal-connector';

@Injectable()
export class HttpFiscalConnector implements FiscalConnector {
  readonly provider = 'HTTP_BRIDGE';

  constructor(private readonly config: ConfigService) {}

  private settings() {
    const baseUrl = this.config.get<string>('FISCAL_PROVIDER_BASE_URL')?.trim().replace(/\/$/, '');
    const secret = this.config.get<string>('FISCAL_PROVIDER_HMAC_SECRET')?.trim();
    if (!baseUrl || !secret) {
      throw new ServiceUnavailableException(
        'Fiscal provider bridge is not configured (FISCAL_PROVIDER_BASE_URL / FISCAL_PROVIDER_HMAC_SECRET).',
      );
    }
    return { baseUrl, secret };
  }

  private signature(secret: string, timestamp: string, body: string) {
    return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  }

  private async request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<FiscalConnectorResult> {
    const { baseUrl, secret } = this.settings();
    const payload = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Date.now());
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        signal: AbortSignal.timeout(12_000),
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          'X-GoSpots-Timestamp': timestamp,
          'X-GoSpots-Signature': this.signature(secret, timestamp, payload),
        },
        ...(body === undefined ? {} : { body: payload }),
      });
    } catch (error) {
      return {
        state: 'UNKNOWN',
        errorCode: 'FISCAL_PROVIDER_UNREACHABLE',
        errorMessage: error instanceof Error ? error.message : 'Fiscal provider request failed',
      };
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = (await response.json()) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const reference = typeof parsed.externalReference === 'string' ? parsed.externalReference : undefined;
    const state = typeof parsed.state === 'string' ? parsed.state.toUpperCase() : '';
    if (response.ok && state === 'ACCEPTED') {
      const fiscalNumber = typeof parsed.fiscalNumber === 'string' ? parsed.fiscalNumber : null;
      const proof = typeof parsed.proof === 'string' ? parsed.proof : null;
      if (!reference || !fiscalNumber || !proof) {
        return {
          state: 'UNKNOWN',
          ...(reference ? { externalReference: reference } : {}),
          errorCode: 'FISCAL_PROVIDER_INCOMPLETE',
          errorMessage: 'Fiscal provider accepted the request but returned incomplete proof data.',
          payload: parsed,
        };
      }
      return { state: 'ACCEPTED', externalReference: reference, fiscalNumber, proof, payload: parsed };
    }
    if (response.ok && state === 'PENDING' && reference) {
      return { state: 'PENDING', externalReference: reference, payload: parsed };
    }
    if (!response.ok || state === 'REJECTED') {
      return {
        state: 'REJECTED',
        ...(reference ? { externalReference: reference } : {}),
        errorCode: typeof parsed.errorCode === 'string' ? parsed.errorCode : `HTTP_${response.status}`,
        errorMessage: typeof parsed.errorMessage === 'string' ? parsed.errorMessage : 'Fiscal provider rejected the request.',
        payload: parsed,
      };
    }
    return {
      state: 'UNKNOWN',
      ...(reference ? { externalReference: reference } : {}),
      errorCode: 'FISCAL_PROVIDER_UNKNOWN',
      errorMessage: 'Fiscal provider returned an ambiguous state.',
      payload: parsed,
    };
  }

  submit(input: FiscalSubmitInput) {
    return this.request('/v1/fiscalize', 'POST', input);
  }

  status(externalReference: string) {
    return this.request(`/v1/fiscalize/${encodeURIComponent(externalReference)}`, 'GET');
  }

  async health() {
    const { baseUrl } = this.settings();
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
      return { ok: response.ok, message: response.ok ? 'Fiscal provider bridge reachable.' : `Fiscal provider health returned ${response.status}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Fiscal provider bridge unreachable.' };
    }
  }
}
