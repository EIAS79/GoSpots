import { X509Certificate } from 'crypto';
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComplianceProfileService } from '../compliance-profile.service';
import { KsefCryptoService } from './ksef-crypto.service';

export type KsefSubmissionResult =
  | {
      state: 'SUBMITTED';
      sessionReference: string;
      invoiceReference: string;
      response: unknown;
    }
  | {
      state: 'UNKNOWN';
      sessionReference?: string;
      invoiceReference?: string;
      errorCode: string;
      errorMessage: string;
    };

type CachedAuth = {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string | null;
  refreshExpiresAt: number;
};

type PublicKeyRecord = {
  certificate: string;
  publicKeyId: string;
  validFrom: string;
  validTo: string;
  usage: string[];
};

const ENV_BASE: Record<string, string> = {
  TEST: 'https://api-test.ksef.mf.gov.pl/v2',
  DEMO: 'https://api-demo.ksef.mf.gov.pl/v2',
  PRD: 'https://api.ksef.mf.gov.pl/v2',
};

function tokenValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const token = (value as Record<string, unknown>).token;
    if (typeof token === 'string' && token.trim()) return token.trim();
  }
  return null;
}

function tokenExpiry(value: unknown, fallbackMs: number): number {
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    const validUntil = candidate.validUntil;
    if (typeof validUntil === 'string') {
      const parsed = Date.parse(validUntil);
      if (Number.isFinite(parsed)) return parsed;
    }
    const token = tokenValue(value);
    if (token) {
      try {
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
        ) as { exp?: number };
        if (typeof payload.exp === 'number') return payload.exp * 1000;
      } catch {
        // Use conservative fallback below.
      }
    }
  }
  return Date.now() + fallbackMs;
}

function certificatePem(derBase64: string): string {
  const cert = new X509Certificate(Buffer.from(derBase64, 'base64'));
  return cert.publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

@Injectable()
export class KsefClientService {
  private readonly authCache = new Map<string, CachedAuth>();

  constructor(
    private readonly config: ConfigService,
    private readonly crypto: KsefCryptoService,
    private readonly profiles: ComplianceProfileService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('KSEF_ENABLED')?.trim().toLowerCase() === 'true';
  }

  private async context(shopId: string) {
    const { profile, ksefToken } = await this.profiles.getKsefContext(shopId);
    const env = profile.ksefEnvironment.trim().toUpperCase();
    const override = this.config.get<string>(`KSEF_API_URL_${env}`)?.trim();
    const baseUrl = (override || ENV_BASE[env] || ENV_BASE.TEST).replace(/\/$/, '');
    return { profile, ksefToken, env, baseUrl };
  }

  private async raw(
    baseUrl: string,
    path: string,
    init: RequestInit = {},
    bearer?: string | null,
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        'X-Error-Format': 'problem-details',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  private async json<T>(response: Response, label: string): Promise<T> {
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`${label} failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    return response.json() as Promise<T>;
  }

  private async publicKey(
    baseUrl: string,
    usage: 'KsefTokenEncryption' | 'SymmetricKeyEncryption',
  ) {
    const response = await this.raw(baseUrl, '/security/public-key-certificates', {
      method: 'GET',
    });
    const records = await this.json<PublicKeyRecord[]>(response, 'KSeF public-key retrieval');
    const now = Date.now();
    const candidates = records
      .filter((record) => record.usage?.includes(usage))
      .filter((record) => Date.parse(record.validFrom) <= now && Date.parse(record.validTo) > now)
      .sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom));
    const selected = candidates[0];
    if (!selected) {
      throw new ServiceUnavailableException(`KSeF published no currently valid ${usage} key.`);
    }
    return {
      pem: certificatePem(selected.certificate),
      publicKeyId: selected.publicKeyId,
    };
  }

  private async refresh(shopId: string, cached: CachedAuth): Promise<CachedAuth | null> {
    if (!cached.refreshToken || cached.refreshExpiresAt <= Date.now() + 30_000) return null;
    const { baseUrl } = await this.context(shopId);
    try {
      const response = await this.raw(
        baseUrl,
        '/auth/token/refresh',
        { method: 'POST' },
        cached.refreshToken,
      );
      const body = await this.json<Record<string, unknown>>(response, 'KSeF access-token refresh');
      const accessToken = tokenValue(body.accessToken);
      if (!accessToken) return null;
      const next: CachedAuth = {
        ...cached,
        accessToken,
        accessExpiresAt: tokenExpiry(body.accessToken, 10 * 60_000),
      };
      this.authCache.set(shopId, next);
      return next;
    } catch {
      this.authCache.delete(shopId);
      return null;
    }
  }

  private async authenticate(shopId: string): Promise<CachedAuth> {
    const legacyAccess = this.config.get<string>('KSEF_ACCESS_TOKEN')?.trim();
    if (legacyAccess) {
      return {
        accessToken: legacyAccess,
        accessExpiresAt: Date.now() + 5 * 60_000,
        refreshToken: null,
        refreshExpiresAt: 0,
      };
    }

    const cached = this.authCache.get(shopId);
    if (cached && cached.accessExpiresAt > Date.now() + 45_000) return cached;
    if (cached) {
      const refreshed = await this.refresh(shopId, cached);
      if (refreshed) return refreshed;
    }

    const { profile, ksefToken, baseUrl } = await this.context(shopId);
    if (!ksefToken) {
      throw new ServiceUnavailableException('KSeF token is not configured for this venue.');
    }

    const challengeResponse = await this.raw(baseUrl, '/auth/challenge', { method: 'POST' });
    const challenge = await this.json<{
      challenge?: string;
      timestamp?: string;
      timestampMs?: number;
    }>(challengeResponse, 'KSeF auth challenge');
    if (!challenge.challenge) throw new Error('KSeF challenge response has no challenge.');
    const timestampMs =
      typeof challenge.timestampMs === 'number'
        ? challenge.timestampMs
        : challenge.timestamp
          ? Date.parse(challenge.timestamp)
          : NaN;
    if (!Number.isFinite(timestampMs)) throw new Error('KSeF challenge response has no valid timestamp.');

    const tokenKey = await this.publicKey(baseUrl, 'KsefTokenEncryption');
    const encryptedToken = this.crypto.encryptKsefToken(tokenKey.pem, ksefToken, timestampMs);
    const authResponse = await this.raw(baseUrl, '/auth/ksef-token', {
      method: 'POST',
      body: JSON.stringify({
        challenge: challenge.challenge,
        contextIdentifier: { type: 'Nip', value: profile.taxId },
        encryptedToken,
        publicKeyId: tokenKey.publicKeyId,
      }),
    });
    const auth = await this.json<Record<string, unknown>>(authResponse, 'KSeF token authentication');
    const referenceNumber = typeof auth.referenceNumber === 'string' ? auth.referenceNumber : null;
    const authenticationToken = tokenValue(auth.authenticationToken);
    if (!referenceNumber || !authenticationToken) {
      throw new Error('KSeF authentication response is incomplete.');
    }

    let authenticated = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400));
      const statusResponse = await this.raw(
        baseUrl,
        `/auth/${encodeURIComponent(referenceNumber)}`,
        { method: 'GET' },
        authenticationToken,
      );
      const status = await this.json<Record<string, unknown>>(statusResponse, 'KSeF authentication status');
      const statusInfo = status.status && typeof status.status === 'object'
        ? (status.status as Record<string, unknown>)
        : {};
      const code = typeof statusInfo.code === 'number' ? statusInfo.code : null;
      if (code === 200) {
        authenticated = true;
        break;
      }
      if (code !== null && code >= 400) {
        throw new Error(`KSeF authentication rejected (${code}).`);
      }
    }
    if (!authenticated) throw new Error('KSeF authentication did not complete within the polling window.');

    const redeemResponse = await this.raw(
      baseUrl,
      '/auth/token/redeem',
      { method: 'POST' },
      authenticationToken,
    );
    const redeemed = await this.json<Record<string, unknown>>(redeemResponse, 'KSeF token redeem');
    const accessToken = tokenValue(redeemed.accessToken);
    const refreshToken = tokenValue(redeemed.refreshToken);
    if (!accessToken) throw new Error('KSeF token redeem returned no accessToken.');
    const next: CachedAuth = {
      accessToken,
      accessExpiresAt: tokenExpiry(redeemed.accessToken, 10 * 60_000),
      refreshToken,
      refreshExpiresAt: tokenExpiry(redeemed.refreshToken, 6 * 24 * 60 * 60_000),
    };
    this.authCache.set(shopId, next);
    return next;
  }

  private async request(shopId: string, path: string, init: RequestInit = {}): Promise<Response> {
    const { baseUrl } = await this.context(shopId);
    const auth = await this.authenticate(shopId);
    const response = await this.raw(baseUrl, path, init, auth.accessToken);
    if (response.status !== 401) return response;
    this.authCache.delete(shopId);
    const retryAuth = await this.authenticate(shopId);
    return this.raw(baseUrl, path, init, retryAuth.accessToken);
  }

  private formCode() {
    return {
      systemCode: 'FA (3)',
      schemaVersion: '1-0E',
      value: 'FA',
    };
  }

  async submitOnlineInvoice(shopId: string, xml: string): Promise<KsefSubmissionResult> {
    if (!this.isEnabled()) throw new Error('KSeF live submission is disabled');
    const { baseUrl } = await this.context(shopId);
    const symmetricKey = await this.publicKey(baseUrl, 'SymmetricKeyEncryption');
    const material = this.crypto.createSessionMaterial(symmetricKey.pem, symmetricKey.publicKeyId);
    let sessionReference: string | undefined;
    let invoiceReference: string | undefined;
    try {
      const open = await this.request(shopId, '/sessions/online', {
        method: 'POST',
        headers: { 'X-KSeF-Feature': 'upo-v4-3' },
        body: JSON.stringify({
          formCode: this.formCode(),
          encryption: {
            encryptedSymmetricKey: material.encryptedSymmetricKey,
            initializationVector: material.initializationVector,
            publicKeyId: material.publicKeyId,
          },
        }),
      });
      const openBody = await this.json<{ referenceNumber?: string }>(open, 'KSeF open session');
      sessionReference = openBody.referenceNumber;
      if (!sessionReference) throw new Error('KSeF session response has no referenceNumber');

      const encoded = this.crypto.encryptInvoice(Buffer.from(xml, 'utf8'), material);
      const sent = await this.request(
        shopId,
        `/sessions/online/${encodeURIComponent(sessionReference)}/invoices`,
        {
          method: 'POST',
          body: JSON.stringify({
            invoiceHash: encoded.invoiceHash,
            invoiceSize: encoded.invoiceSize,
            encryptedInvoiceHash: encoded.encryptedInvoiceHash,
            encryptedInvoiceSize: encoded.encryptedInvoiceSize,
            encryptedInvoiceContent: encoded.encryptedInvoiceContent,
            offlineMode: false,
          }),
        },
      );
      const sentBody = await this.json<{ referenceNumber?: string }>(sent, 'KSeF invoice send');
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

  async getInvoiceStatus(shopId: string, sessionReference: string, invoiceReference: string): Promise<unknown> {
    const response = await this.request(
      shopId,
      `/sessions/${encodeURIComponent(sessionReference)}/invoices/${encodeURIComponent(invoiceReference)}`,
      { method: 'GET' },
    );
    return this.json(response, 'KSeF invoice status');
  }

  async getInvoiceUpo(shopId: string, sessionReference: string, invoiceReference: string): Promise<string> {
    const response = await this.request(
      shopId,
      `/sessions/${encodeURIComponent(sessionReference)}/invoices/${encodeURIComponent(invoiceReference)}/upo`,
      { method: 'GET', headers: { Accept: 'application/xml' } },
    );
    if (!response.ok) throw new Error(`KSeF UPO retrieval failed (${response.status})`);
    return response.text();
  }

  async closeOnlineSession(shopId: string, sessionReference: string): Promise<void> {
    const response = await this.request(
      shopId,
      `/sessions/online/${encodeURIComponent(sessionReference)}/close`,
      { method: 'POST' },
    );
    if (!response.ok) throw new Error(`KSeF close session failed (${response.status})`);
  }
}
