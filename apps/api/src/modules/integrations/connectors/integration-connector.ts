export type IntegrationConnectorContext = {
  shopId: string;
  installationId: string;
  config: Record<string, unknown>;
  secrets: Record<string, unknown> | null;
};

export type IntegrationJobCommand = {
  id: string;
  jobType: string;
  idempotencyKey: string;
  payload: unknown;
  correlationId?: string | null;
};

export type IntegrationConnectorResult = {
  externalId?: string;
  metadata?: Record<string, unknown>;
};

export interface IntegrationConnector {
  readonly provider: string;
  capabilities(): Record<string, unknown>;
  health(context: IntegrationConnectorContext): Promise<{ ok: boolean; detail?: string }>;
  execute(
    context: IntegrationConnectorContext,
    command: IntegrationJobCommand,
  ): Promise<IntegrationConnectorResult>;
}
