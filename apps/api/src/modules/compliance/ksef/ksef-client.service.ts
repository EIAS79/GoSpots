import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KsefCryptoService } from './ksef-crypto.service';

export type KsefSubmissionResult =
  | { state: 'SUBMITTED'; sessionReference: string; invoiceReference: string; response: unknown }
  | { state: 'UNKNOWN'; sessionReference?: string; invoiceReference?: string; errorCode: string; errorMessage: string };

@Injectable()
export class KsefClientService {
  constructor(
    private readonly config: ConfigService,
    private readonly crypto: KsefCryptoService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('KSEF_ENABLED')?.trim().toLowerCase() === 'true';
  }

  private required(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new Error(`${name} is required when KSEF_ENABLED=true`);
    return value;
  }

  private baseUrl(): string {
    return this.required('KSEF_API_URL').replace(/\/$/, '');
  }

  private formCode() {
    return {
      systemCode: this.config.get<string>('KSEF_FORM_SYSTEM_CODE')?.trim() || 'FA (3)',
      schemaVersion: this.config.get<string>('KSEF_FORM_SCHEMA_VERSION')?.trim() || '1-0E',
      value: this.config.get<string>('KSEF_FORM_VALUE')?.trim() || 'FA',
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = this.required('KSEF_ACCESS_TOKEN');
    return fetch(`${this.baseUrl()}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  async submitOnlineInvoice(xml: string): Promise<KsefSubmissionResult> {
    if (!this.isEnabled()) {
      throw new Error('KSeF live submission is disabled');
    }
    const material = this.crypto.createSessionMaterial(
      this.required('KSEF_PUBLIC_KEY_PEM'),
      this.config.get<string>('KSEF_PUBLIC_KEY_ID'),
    );
    let sessionReference: string | undefined;
    let invoiceReference: string | undefined;
    try {
      const open = await this.request('/sessions/online', {
        method: 'POST',
        body: JSON.stringify({
          formCode: this.formCode(),
          encryption: {
            encryptedSymmetricKey: material.encryptedSymmetricKey,
            initializationVector: material.initializationVector,
            ...(material.publicKeyId ? { publicKeyId: material.publicKeyId } : {}),
          },
        }),
      });
      if (!open.ok) throw new Error(`KSeF open session failed (${open.status})`);
      const openBody = (await open.json()) as { referenceNumber?: string };
      sessionReference = openBody.referenceNumber;
      if (!sessionReference) throw new Error('KSeF session response has no referenceNumber');

      const encoded = this.crypto.encryptInvoice(Buffer.from(xml, 'utf8'), material);
      const sent = await this.request(`/sessions/online/${encodeURIComponent(sessionReference)}/invoices`, {
        method: 'POST',
        body: JSON.stringify({
          invoiceHash: encoded.invoiceHash,
          invoiceSize: encoded.invoiceSize,
          encryptedInvoiceHash: encoded.encryptedInvoiceHash,
          encryptedInvoiceSize: encoded.encryptedInvoiceSize,
          encryptedInvoiceContent: encoded.encryptedInvoiceContent,
          offlineMode: false,
        }),
      });
      if (!sent.ok) throw new Error(`KSeF invoice send failed (${sent.status})`);
      const sentBody = (await sent.json()) as { referenceNumber?: string };
      invoiceReference = sentBody.referenceNumber;
      if (!invoiceReference) throw new Error('KSeF invoice response has no referenceNumber');
      return { state: 'SUBMITTED', sessionReference, invoiceReference, response: sentBody };
    } catch (error) {
      return {
        state: 'UNKNOWN',
        ...(sessionReference ? { sessionReference } : {}),
        ...(invoiceReference ? { invoiceReference } : {}),
        errorCode: 'KSEF_OUTCOME_UNKNOWN',
        errorMessage: error instanceof Error ? error.message : 'KSeF request failed',
      };
    }
  }

  async getInvoiceStatus(sessionReference: string, invoiceReference: string): Promise<unknown> {
    const res = await this.request(
      `/sessions/${encodeURIComponent(sessionReference)}/invoices/${encodeURIComponent(invoiceReference)}`,
      { method: 'GET' },
    );
    if (!res.ok) throw new Error(`KSeF status failed (${res.status})`);
    return res.json();
  }

  async closeOnlineSession(sessionReference: string): Promise<void> {
    const res = await this.request(`/sessions/online/${encodeURIComponent(sessionReference)}/close`, { method: 'POST' });
    if (!res.ok) throw new Error(`KSeF close session failed (${res.status})`);
  }
}
