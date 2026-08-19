import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PaymentConnectorRegistry } from './payment-connector.registry';
import type {
  ConnectorHealth,
  ConnectorPaymentLookup,
  ConnectorPaymentResult,
  ConnectorReadiness,
  ConnectorRefundRequest,
  ConnectorRefundResult,
  CreateConnectorPaymentRequest,
  PaymentConnector,
  PaymentConnectorCapabilities,
} from './payment-connector';

type JsonObject = Record<string, unknown>;

type AdyenPaymentReference = {
  v: 1;
  poiId: string;
  saleId: string;
  paymentServiceId: string;
  transactionId?: string;
  transactionTime?: string;
  pspReference?: string;
};

export type AdyenStandardWebhookItem = {
  additionalData?: { hmacSignature?: string } & Record<string, unknown>;
  amount?: { value?: number; currency?: string };
  eventCode?: string;
  eventDate?: string;
  merchantAccountCode?: string;
  merchantReference?: string;
  originalReference?: string;
  pspReference?: string;
  reason?: string;
  success?: string;
};

class AdyenHttpError extends Error {
  constructor(
    readonly status: number | null,
    readonly uncertain: boolean,
    message: string,
  ) {
    super(message);
  }
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function field(value: JsonObject | null, key: string): unknown {
  return value?.[key];
}

function stringField(value: JsonObject | null, key: string): string | null {
  const candidate = field(value, key);
  return typeof candidate === 'string' ? candidate : null;
}

function parseAdditionalResponse(raw: string | null): URLSearchParams {
  return new URLSearchParams(raw ?? '');
}

function serviceId(seed?: string): string {
  const source = seed ?? randomBytes(12).toString('hex');
  return createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
}

function validateAmount(amount: string): number {
  const normalized = amount.trim();
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(normalized);
  if (!match) throw new Error('Adyen Terminal amount must be a positive decimal');
  const whole = BigInt(match[1]);
  const fraction4 = (match[2] ?? '').padEnd(4, '0');
  if (fraction4.slice(2) !== '00') {
    throw new Error('Adyen Terminal payments support at most 2 decimal places');
  }
  const minor = whole * 100n + BigInt(fraction4.slice(0, 2) || '0');
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Adyen Terminal amount is outside the supported range');
  }
  return Number(minor) / 100;
}

function encodePaymentReference(reference: AdyenPaymentReference): string {
  return `adyen:v1:${Buffer.from(JSON.stringify(reference), 'utf8').toString('base64url')}`;
}

export function decodeAdyenPaymentReference(value: string): AdyenPaymentReference {
  const prefix = 'adyen:v1:';
  if (!value.startsWith(prefix)) {
    throw new Error('Invalid Adyen payment reference');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value.slice(prefix.length), 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid Adyen payment reference');
  }
  const candidate = object(decoded);
  if (
    candidate?.v !== 1 ||
    typeof candidate.poiId !== 'string' ||
    typeof candidate.saleId !== 'string' ||
    typeof candidate.paymentServiceId !== 'string'
  ) {
    throw new Error('Invalid Adyen payment reference');
  }
  return candidate as AdyenPaymentReference;
}

function transactionIdentity(paymentResponse: JsonObject | null): {
  transactionId: string | null;
  transactionTime: string | null;
  pspReference: string | null;
} {
  const poiData = object(field(paymentResponse, 'POIData'));
  const poiTransactionId = object(field(poiData, 'POITransactionID'));
  const response = object(field(paymentResponse, 'Response'));
  const transactionId = stringField(poiTransactionId, 'TransactionID');
  const transactionTime = stringField(poiTransactionId, 'TimeStamp');
  const additional = parseAdditionalResponse(stringField(response, 'AdditionalResponse'));
  const pspReference =
    additional.get('pspReference') ||
    (transactionId ? transactionId.split('.').filter(Boolean).at(-1) ?? null : null);
  return { transactionId, transactionTime, pspReference };
}

function paymentResultFromResponse(
  paymentResponse: JsonObject | null,
  reference: AdyenPaymentReference,
): ConnectorPaymentResult {
  if (!paymentResponse) {
    return {
      providerPaymentId: encodePaymentReference(reference),
      state: 'UNKNOWN',
      errorCode: 'ADYEN_MALFORMED_RESPONSE',
      errorMessage: 'Adyen did not return a PaymentResponse',
    };
  }
  const response = object(field(paymentResponse, 'Response'));
  const result = stringField(response, 'Result');
  const errorCondition = stringField(response, 'ErrorCondition');
  const additionalResponse = stringField(response, 'AdditionalResponse');
  const additional = parseAdditionalResponse(additionalResponse);
  const identity = transactionIdentity(paymentResponse);
  const updatedReference: AdyenPaymentReference = {
    ...reference,
    ...(identity.transactionId ? { transactionId: identity.transactionId } : {}),
    ...(identity.transactionTime ? { transactionTime: identity.transactionTime } : {}),
    ...(identity.pspReference ? { pspReference: identity.pspReference } : {}),
  };

  let state: ConnectorPaymentResult['state'];
  if (result === 'Success') state = 'CAPTURED';
  else if (errorCondition === 'InProgress' || errorCondition === 'Busy') state = 'PROCESSING';
  else if (errorCondition === 'Aborted' || errorCondition === 'Cancel') state = 'CANCELED';
  else if (result === 'Failure') state = 'FAILED';
  else state = 'UNKNOWN';

  return {
    providerPaymentId: encodePaymentReference(updatedReference),
    state,
    providerPayload: {
      result: result ?? null,
      errorCondition: errorCondition ?? null,
      pspReference: identity.pspReference,
      transactionId: identity.transactionId,
      transactionTime: identity.transactionTime,
      refusalReason: additional.get('refusalReason') ?? additional.get('message') ?? null,
    },
    errorCode: state === 'FAILED' ? errorCondition ?? 'ADYEN_PAYMENT_FAILED' : null,
    errorMessage:
      state === 'FAILED'
        ? additional.get('refusalReason') ?? additional.get('message') ?? 'Adyen payment failed'
        : null,
  };
}

@Injectable()
export class AdyenTerminalConnector implements PaymentConnector, OnModuleInit {
  readonly provider = 'adyen';
  private http: typeof fetch = fetch;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: PaymentConnectorRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  capabilities(): PaymentConnectorCapabilities {
    return {
      payments: true,
      cancel: true,
      refunds: true,
      terminal: true,
      inPersonTerminal: true,
      offlineCollection: false,
      webhookReconciliation: true,
    };
  }

  private enabled(): boolean {
    return this.config.get<string>('ADYEN_TERMINAL_ENABLED')?.trim().toLowerCase() === 'true';
  }

  private required(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new Error(`Adyen Terminal is not configured: ${name} is missing`);
    return value;
  }

  private merchantAccount(): string {
    return this.required('ADYEN_MERCHANT_ACCOUNT');
  }

  configuredMerchantMatches(value: string): boolean {
    if (!this.enabled()) return false;
    try {
      return this.merchantAccount() === value;
    } catch {
      return false;
    }
  }

  private saleId(): string {
    const configured = this.config.get<string>('ADYEN_TERMINAL_SALE_ID')?.trim();
    const value = configured || 'GoSpots';
    if (!/^[A-Za-z0-9]{1,10}$/.test(value)) {
      throw new Error('ADYEN_TERMINAL_SALE_ID must be 1-10 alphanumeric characters');
    }
    return value;
  }

  private baseUrl(): string {
    const override = this.config.get<string>('ADYEN_TERMINAL_BASE_URL')?.trim();
    if (override) return override.replace(/\/+$/, '');
    const environment = this.config.get<string>('ADYEN_ENVIRONMENT')?.trim().toLowerCase() || 'test';
    if (environment === 'test') return 'https://device-api-test.adyen.com/v1';
    if (environment === 'live') return 'https://device-api-live.adyen.com/v1';
    throw new Error('ADYEN_ENVIRONMENT must be test or live');
  }

  private timeoutMs(): number {
    const raw = this.config.get<string>('ADYEN_TERMINAL_TIMEOUT_MS')?.trim();
    if (!raw) return 160_000;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 151_000 || value > 300_000) {
      throw new Error('ADYEN_TERMINAL_TIMEOUT_MS must be an integer from 151000 to 300000');
    }
    return value;
  }

  private syncUrl(poiId: string): string {
    return `${this.baseUrl()}/merchants/${encodeURIComponent(this.merchantAccount())}/devices/${encodeURIComponent(poiId)}/sync`;
  }

  private async requestJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    if (!this.enabled()) {
      throw new AdyenHttpError(null, false, 'Adyen Terminal is disabled by ADYEN_TERMINAL_ENABLED');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.http(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-Key': this.required('ADYEN_API_KEY'),
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      if (!response.ok) {
        const uncertain = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new AdyenHttpError(
          response.status,
          uncertain,
          `Adyen request failed with HTTP ${response.status}`,
        );
      }
      if (!text.trim()) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new AdyenHttpError(response.status, true, 'Adyen returned malformed JSON');
      }
    } catch (error) {
      if (error instanceof AdyenHttpError) throw error;
      throw new AdyenHttpError(
        null,
        true,
        error instanceof Error ? error.message : 'Adyen request failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async terminalRequest(poiId: string, payload: JsonObject): Promise<unknown> {
    return this.requestJson(
      this.syncUrl(poiId),
      { method: 'POST', body: JSON.stringify(payload) },
      this.timeoutMs(),
    );
  }

  private header(
    category: 'Payment' | 'TransactionStatus' | 'Abort' | 'Reversal',
    poiId: string,
    requestServiceId: string,
  ): JsonObject {
    return {
      ProtocolVersion: '3.0',
      MessageClass: 'Service',
      MessageCategory: category,
      MessageType: 'Request',
      SaleID: this.saleId(),
      ServiceID: requestServiceId,
      POIID: poiId,
    };
  }

  async createPayment(request: CreateConnectorPaymentRequest): Promise<ConnectorPaymentResult> {
    if (!request.terminalExternalId) {
      return {
        providerPaymentId: `adyen-unassigned:${request.operationId}`,
        state: 'FAILED',
        errorCode: 'TERMINAL_NOT_ASSIGNED',
        errorMessage: 'Adyen payment terminal is not assigned',
      };
    }
    let requestedAmount: number;
    try {
      requestedAmount = validateAmount(request.amount);
    } catch (error) {
      return {
        providerPaymentId: `adyen-validation:${request.operationId}`,
        state: 'FAILED',
        errorCode: 'INVALID_TERMINAL_AMOUNT',
        errorMessage: error instanceof Error ? error.message : 'Invalid terminal amount',
      };
    }
    const currency = String(request.currency ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return {
        providerPaymentId: `adyen-validation:${request.operationId}`,
        state: 'FAILED',
        errorCode: 'INVALID_TERMINAL_CURRENCY',
        errorMessage: 'Adyen Terminal currency must be a three-letter ISO code',
      };
    }

    const paymentServiceId = serviceId(`payment:${request.operationId}:${request.idempotencyKey}`);
    const reference: AdyenPaymentReference = {
      v: 1,
      poiId: request.terminalExternalId,
      saleId: this.saleId(),
      paymentServiceId,
    };
    const payload: JsonObject = {
      SaleToPOIRequest: {
        MessageHeader: this.header('Payment', reference.poiId, paymentServiceId),
        PaymentRequest: {
          SaleData: {
            SaleTransactionID: {
              TransactionID: request.operationId,
              TimeStamp: new Date().toISOString(),
            },
          },
          PaymentTransaction: {
            AmountsReq: { Currency: currency, RequestedAmount: requestedAmount },
          },
        },
      },
    };

    try {
      const body = object(await this.terminalRequest(reference.poiId, payload));
      const root = object(field(body, 'SaleToPOIResponse'));
      return paymentResultFromResponse(object(field(root, 'PaymentResponse')), reference);
    } catch (error) {
      const uncertain = error instanceof AdyenHttpError ? error.uncertain : true;
      return {
        providerPaymentId: encodePaymentReference(reference),
        state: uncertain ? 'UNKNOWN' : 'FAILED',
        errorCode:
          error instanceof AdyenHttpError && error.status
            ? `ADYEN_HTTP_${error.status}`
            : 'ADYEN_TERMINAL_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Adyen Terminal request failed',
      };
    }
  }

  async getPayment(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult> {
    let reference: AdyenPaymentReference;
    try {
      reference = decodeAdyenPaymentReference(request.providerPaymentId);
    } catch (error) {
      return {
        providerPaymentId: request.providerPaymentId,
        state: 'UNKNOWN',
        errorCode: 'ADYEN_REFERENCE_INVALID',
        errorMessage: error instanceof Error ? error.message : 'Invalid Adyen payment reference',
      };
    }
    const statusServiceId = serviceId();
    const payload: JsonObject = {
      SaleToPOIRequest: {
        MessageHeader: this.header('TransactionStatus', reference.poiId, statusServiceId),
        TransactionStatusRequest: {
          MessageReference: {
            MessageCategory: 'Payment',
            SaleID: reference.saleId,
            ServiceID: reference.paymentServiceId,
          },
        },
      },
    };
    try {
      const body = object(await this.terminalRequest(reference.poiId, payload));
      const root = object(field(body, 'SaleToPOIResponse'));
      const statusResponse = object(field(root, 'TransactionStatusResponse'));
      const response = object(field(statusResponse, 'Response'));
      const result = stringField(response, 'Result');
      const condition = stringField(response, 'ErrorCondition');
      if (result !== 'Success') {
        return {
          providerPaymentId: request.providerPaymentId,
          state: condition === 'InProgress' || condition === 'Busy' ? 'PROCESSING' : 'UNKNOWN',
          providerPayload: { statusResult: result ?? null, errorCondition: condition ?? null },
          errorCode: condition ?? 'ADYEN_STATUS_UNRESOLVED',
          errorMessage:
            condition === 'NotFound'
              ? 'Adyen could not find the referenced payment; do not blindly retry'
              : 'Adyen payment status is not final',
        };
      }
      const repeated = object(field(statusResponse, 'RepeatedMessageResponse'));
      const repeatedBody = object(field(repeated, 'RepeatedResponseMessageBody'));
      return paymentResultFromResponse(object(field(repeatedBody, 'PaymentResponse')), reference);
    } catch (error) {
      return {
        providerPaymentId: request.providerPaymentId,
        state: 'UNKNOWN',
        errorCode: 'ADYEN_STATUS_UNCERTAIN',
        errorMessage: error instanceof Error ? error.message : 'Adyen payment status request failed',
      };
    }
  }

  async cancelPayment(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult> {
    let reference: AdyenPaymentReference;
    try {
      reference = decodeAdyenPaymentReference(request.providerPaymentId);
    } catch (error) {
      return {
        providerPaymentId: request.providerPaymentId,
        state: 'UNKNOWN',
        errorCode: 'ADYEN_REFERENCE_INVALID',
        errorMessage: error instanceof Error ? error.message : 'Invalid Adyen payment reference',
      };
    }
    const payload: JsonObject = {
      SaleToPOIRequest: {
        MessageHeader: this.header('Abort', reference.poiId, serviceId()),
        AbortRequest: {
          AbortReason: 'MerchantAbort',
          MessageReference: {
            MessageCategory: 'Payment',
            SaleID: reference.saleId,
            ServiceID: reference.paymentServiceId,
          },
        },
      },
    };
    try {
      await this.terminalRequest(reference.poiId, payload);
      return this.getPayment(request);
    } catch (error) {
      return {
        providerPaymentId: request.providerPaymentId,
        state: 'UNKNOWN',
        errorCode: 'ADYEN_ABORT_UNCERTAIN',
        errorMessage: error instanceof Error ? error.message : 'Adyen abort outcome is unknown',
      };
    }
  }

  async refundPayment(request: ConnectorRefundRequest): Promise<ConnectorRefundResult> {
    let reference: AdyenPaymentReference;
    try {
      reference = decodeAdyenPaymentReference(request.paymentProviderId);
    } catch (error) {
      return {
        providerRefundId: `adyen-refund-validation:${request.refundId}`,
        state: 'FAILED',
        errorCode: 'ADYEN_REFERENCE_INVALID',
        errorMessage: error instanceof Error ? error.message : 'Invalid Adyen payment reference',
      };
    }
    if (!reference.transactionId || !reference.transactionTime) {
      return {
        providerRefundId: `adyen-refund-validation:${request.refundId}`,
        state: 'FAILED',
        errorCode: 'ADYEN_PAYMENT_REFERENCE_INCOMPLETE',
        errorMessage: 'Reconcile the Adyen payment before refunding so its terminal transaction identity is known',
      };
    }
    let reversedAmount: number;
    try {
      reversedAmount = validateAmount(request.amount);
    } catch (error) {
      return {
        providerRefundId: `adyen-refund-validation:${request.refundId}`,
        state: 'FAILED',
        errorCode: 'INVALID_TERMINAL_AMOUNT',
        errorMessage: error instanceof Error ? error.message : 'Invalid refund amount',
      };
    }
    const currency = String(request.currency ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return {
        providerRefundId: `adyen-refund-validation:${request.refundId}`,
        state: 'FAILED',
        errorCode: 'INVALID_TERMINAL_CURRENCY',
        errorMessage: 'Adyen Terminal currency must be a three-letter ISO code',
      };
    }
    const refundServiceId = serviceId(`refund:${request.refundId}:${request.idempotencyKey}`);
    const payload: JsonObject = {
      SaleToPOIRequest: {
        MessageHeader: this.header('Reversal', reference.poiId, refundServiceId),
        ReversalRequest: {
          OriginalPOITransaction: {
            POITransactionID: {
              TransactionID: reference.transactionId,
              TimeStamp: reference.transactionTime,
            },
            ReversalReason: 'MerchantCancel',
          },
          ReversedAmount: reversedAmount,
          SaleData: {
            SaleTransactionID: {
              TransactionID: request.refundId,
              TimeStamp: new Date().toISOString(),
            },
            SaleToAcquirerData: `currency=${encodeURIComponent(currency)}`,
          },
        },
      },
    };
    try {
      const body = object(await this.terminalRequest(reference.poiId, payload));
      const root = object(field(body, 'SaleToPOIResponse'));
      const reversal = object(field(root, 'ReversalResponse'));
      const response = object(field(reversal, 'Response'));
      const result = stringField(response, 'Result');
      const condition = stringField(response, 'ErrorCondition');
      const identity = transactionIdentity(reversal);
      const providerRefundId = identity.pspReference || `adyen:pending:${request.refundId}`;
      if (result === 'Success') {
        return {
          providerRefundId,
          state: 'PROCESSING',
          providerPayload: {
            result,
            pspReference: identity.pspReference,
            transactionId: identity.transactionId,
            transactionTime: identity.transactionTime,
            awaitingWebhook: 'CANCEL_OR_REFUND',
          },
        };
      }
      return {
        providerRefundId,
        state: result === 'Failure' ? 'FAILED' : 'UNKNOWN',
        providerPayload: { result: result ?? null, errorCondition: condition ?? null },
        errorCode: condition ?? 'ADYEN_REVERSAL_FAILED',
        errorMessage: 'Adyen did not accept the referenced refund',
      };
    } catch (error) {
      return {
        providerRefundId: `adyen:unknown:${request.refundId}`,
        state: 'UNKNOWN',
        errorCode: 'ADYEN_REFUND_UNCERTAIN',
        errorMessage: error instanceof Error ? error.message : 'Adyen refund outcome is unknown',
      };
    }
  }

  verifyStandardWebhook(item: AdyenStandardWebhookItem): boolean {
    if (!this.enabled()) return false;
    const signature = item.additionalData?.hmacSignature;
    if (typeof signature !== 'string' || !signature) return false;
    let key: Buffer;
    try {
      const hex = this.required('ADYEN_STANDARD_WEBHOOK_HMAC_KEY');
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return false;
      key = Buffer.from(hex, 'hex');
    } catch {
      return false;
    }
    const payload = [
      item.pspReference ?? '',
      item.originalReference ?? '',
      item.merchantAccountCode ?? '',
      item.merchantReference ?? '',
      item.amount?.value ?? '',
      item.amount?.currency ?? '',
      item.eventCode ?? '',
      item.success ?? '',
    ].join(':');
    const expected = Buffer.from(createHmac('sha256', key).update(payload, 'utf8').digest('base64'));
    const actual = Buffer.from(signature);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async health(): Promise<ConnectorHealth> {
    try {
      const url = `${this.baseUrl()}/merchants/${encodeURIComponent(this.merchantAccount())}/connectedDevices`;
      await this.requestJson(url, { method: 'GET' }, 10_000);
      return { ok: true, message: 'Adyen Cloud Device API reachable' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Adyen Cloud Device API unavailable',
      };
    }
  }

  async readiness(): Promise<ConnectorReadiness> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled()) {
      return { ok: false, ready: false, checkedAt, message: 'Adyen Terminal connector is disabled' };
    }
    try {
      this.required('ADYEN_API_KEY');
      this.merchantAccount();
      this.required('ADYEN_STANDARD_WEBHOOK_HMAC_KEY');
      this.saleId();
      this.timeoutMs();
    } catch (error) {
      return {
        ok: false,
        ready: false,
        checkedAt,
        message: error instanceof Error ? error.message : 'Adyen Terminal configuration is incomplete',
      };
    }
    const health = await this.health();
    return { ...health, ready: health.ok, checkedAt };
  }
}
