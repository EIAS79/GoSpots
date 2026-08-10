export type FiscalSubmitInput = {
  documentId: string;
  documentNumber: string;
  externalDeviceId: string;
  currency: string;
  grossAmount: string;
  lines: Array<{
    position: number;
    description: string;
    quantity: string;
    taxCategoryCode: string;
    taxRatePercent: string;
    grossAmount: string;
  }>;
  idempotencyKey: string;
};

export type FiscalConnectorResult =
  | {
      state: 'ACCEPTED';
      externalReference: string;
      fiscalNumber: string;
      proof: string;
      payload?: Record<string, unknown>;
    }
  | {
      state: 'PENDING';
      externalReference: string;
      payload?: Record<string, unknown>;
    }
  | {
      state: 'REJECTED';
      externalReference?: string;
      errorCode: string;
      errorMessage: string;
      payload?: Record<string, unknown>;
    }
  | {
      state: 'UNKNOWN';
      externalReference?: string;
      errorCode: string;
      errorMessage: string;
      payload?: Record<string, unknown>;
    };

export interface FiscalConnector {
  readonly provider: string;
  submit(input: FiscalSubmitInput): Promise<FiscalConnectorResult>;
  status(externalReference: string): Promise<FiscalConnectorResult>;
  health(): Promise<{ ok: boolean; message: string }>;
}
