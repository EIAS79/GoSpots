export type ComplianceApplicability = {
  applicable: boolean;
  reason?: string;
};

export interface ComplianceAdapter {
  readonly jurisdiction: string;
  applicability(input: { country?: string | null }): ComplianceApplicability;
  supports(kind: 'RECEIPT' | 'INVOICE' | 'CORRECTION' | 'REFUND'): boolean;
}
