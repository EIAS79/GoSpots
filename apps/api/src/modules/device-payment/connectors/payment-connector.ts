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

/**
 * Provider capabilities are deliberately capability-based rather than inferred
 * from a provider name. The legacy fields remain required for backwards
 * compatibility; Phase 5 fields are additive so existing connectors can adopt
 * them without creating a second payment abstraction.
 */
export type PaymentConnectorCapabilities = {
  payments: boolean;
  cancel: boolean;
  refunds: boolean;
  terminal: boolean;
  requiresAction?: boolean;
  inPersonTerminal?: boolean;
  onlineCard?: boolean;
  preauthorization?: boolean;
  offlineCollection?: boolean;
  tips?: boolean;
  webhookReconciliation?: boolean;
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

export type ConnectorReadiness = ConnectorHealth & {
  ready: boolean;
  checkedAt: string;
};

export type ConnectorWebhookEnvelope = {
  eventId: string;
  eventType?: string | null;
  payloadHash: string;
  rawBody: string | Buffer;
  signature?: string | null;
};

/**
 * Provider-neutral payment boundary. Checkout and domain services consume this
 * contract only; provider-specific SDKs stay behind connector implementations.
 *
 * UNKNOWN is an explicit terminal outcome of an API attempt, not an alias for
 * failure. A caller must query/reconcile before allowing a blind retry.
 */
export interface PaymentConnector {
  readonly provider: string;
  capabilities(): PaymentConnectorCapabilities | Promise<PaymentConnectorCapabilities>;
  createPayment(request: CreateConnectorPaymentRequest): Promise<ConnectorPaymentResult>;
  /** Optional collection step for providers that separate create from collect. */
  collectPayment?(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult>;
  /** Optional confirmation/process step for providers that require it. */
  confirmPayment?(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult>;
  getPayment(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult>;
  /** Semantic alias for provider query/reconciliation when implemented. */
  queryPayment?(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult>;
  cancelPayment(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult>;
  refundPayment(request: ConnectorRefundRequest): Promise<ConnectorRefundResult>;
  /** Connectors may normalize provider webhooks at their boundary. */
  handleWebhook?(request: ConnectorWebhookEnvelope): Promise<Record<string, unknown>>;
  health(): Promise<ConnectorHealth>;
  readiness?(): Promise<ConnectorReadiness>;
}
