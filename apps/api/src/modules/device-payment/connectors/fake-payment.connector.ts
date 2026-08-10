import type {
  ConnectorHealth,
  ConnectorPaymentLookup,
  ConnectorPaymentResult,
  ConnectorRefundRequest,
  ConnectorRefundResult,
  CreateConnectorPaymentRequest,
  PaymentConnector,
  PaymentConnectorCapabilities,
} from './payment-connector';

type FakeScenario =
  | 'success'
  | 'decline'
  | 'requires_action'
  | 'timeout'
  | 'timeout_captured';

type FakeStoredPayment = ConnectorPaymentResult & {
  scenario: FakeScenario;
};

/** Deterministic in-memory connector used only by tests/simulations. */
export class FakePaymentConnector implements PaymentConnector {
  readonly provider = 'fake';
  private readonly payments = new Map<string, FakeStoredPayment>();
  private counter = 0;
  private refundCounter = 0;

  capabilities(): PaymentConnectorCapabilities {
    return {
      payments: true,
      cancel: true,
      refunds: true,
      terminal: true,
      requiresAction: true,
    };
  }

  async createPayment(
    request: CreateConnectorPaymentRequest,
  ): Promise<ConnectorPaymentResult> {
    this.counter += 1;
    const providerPaymentId = `fake-pay-${this.counter}`;
    const scenario = String(request.metadata?.scenario ?? 'success') as FakeScenario;
    const result: FakeStoredPayment = {
      providerPaymentId,
      scenario,
      state:
        scenario === 'decline'
          ? 'FAILED'
          : scenario === 'requires_action'
            ? 'REQUIRES_ACTION'
            : scenario === 'timeout' || scenario === 'timeout_captured'
              ? 'UNKNOWN'
              : 'CAPTURED',
      errorCode: scenario === 'decline' ? 'DECLINED' : null,
      errorMessage: scenario === 'decline' ? 'Fake payment declined' : null,
      providerPayload: { scenario, operationId: request.operationId },
    };
    this.payments.set(providerPaymentId, result);
    return { ...result };
  }

  async getPayment(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult> {
    const stored = this.requirePayment(request.providerPaymentId);
    if (stored.scenario === 'timeout_captured' && stored.state === 'UNKNOWN') {
      stored.state = 'CAPTURED';
    }
    return { ...stored };
  }

  async cancelPayment(request: ConnectorPaymentLookup): Promise<ConnectorPaymentResult> {
    const stored = this.requirePayment(request.providerPaymentId);
    stored.state = 'CANCELED';
    return { ...stored };
  }

  async refundPayment(request: ConnectorRefundRequest): Promise<ConnectorRefundResult> {
    this.requirePayment(request.paymentProviderId);
    this.refundCounter += 1;
    return {
      providerRefundId: `fake-refund-${this.refundCounter}`,
      state: 'SUCCEEDED',
      providerPayload: { refundId: request.refundId },
    };
  }

  async health(): Promise<ConnectorHealth> {
    return { ok: true, message: 'fake connector healthy' };
  }

  private requirePayment(providerPaymentId: string): FakeStoredPayment {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error(`Unknown fake payment ${providerPaymentId}`);
    return payment;
  }
}
