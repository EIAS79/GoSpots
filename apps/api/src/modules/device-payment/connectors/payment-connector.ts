export type ConnectorPaymentState =
  | 'CREATED'
  | 'PROCESSING'
  | 'REQUIRES_ACTION'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'CANCELED'
  | 'UNKNOWN'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type ConnectorRefundState =
  | 'CREATED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'UNKNOWN';

export type PaymentConnectorCapabilities = {
  payments: boolean;
  cancel: boolean;
  refunds: boolean;
  terminal: boolean;
  requiresAction?: boolean;
};

export type CreateConnectorPaymentRequest = {
  operationId: string;
  idempotencyKey: string;
  amount: string;
  currency: string;
  terminalExternalId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ConnectorPaymentResult = {
  providerPaymentId: string;
  state: ConnectorPaymentState;
  providerPayload?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type ConnectorPaymentLookup = {
  providerPaymentId: string;
  operationId?: string;
  terminalExternalId?: string | null;
};

export type ConnectorRefundRequest = {
  refundId: string;
  paymentProviderId: string;
  idempotencyKey: string;
  amount: string;
  currency: string;
  reason?: string | null;
};

export type ConnectorRefundResult = {
  providerRefundId: string;
  state: ConnectorRefundState;
  providerPayload?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type ConnectorHealth = {
  ok: boolean;
  message?: string;
};

/**
 * Provider-neutral payment boundary. Checkout and domain services consume this
 * contract only; provider-specific SDKs stay behind connector implementations.
 */
export interface PaymentConnector {
  readonly provider: string;
  capabilities(): PaymentConnectorCapabilities | Promise<PaymentConnectorCapabilities>;
  createPayment(request: CreateConnectorPaymentRequest): Promise<ConnectorPaymentResult>;
  getPayment(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult>;
  cancelPayment(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult>;
  refundPayment(request: ConnectorRefundRequest): Promise<ConnectorRefundResult>;
  health(): Promise<ConnectorHealth>;
}
