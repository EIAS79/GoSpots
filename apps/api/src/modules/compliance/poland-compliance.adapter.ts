import { Injectable } from '@nestjs/common';
import type { ComplianceAdapter, ComplianceApplicability } from './compliance-adapter';

@Injectable()
export class PolandComplianceAdapter implements ComplianceAdapter {
  readonly jurisdiction = 'PL';

  applicability(input: { country?: string | null }): ComplianceApplicability {
    const country = input.country?.trim().toUpperCase();
    const applicable = country === 'PL' || country === 'POLAND' || country === 'POLSKA';
    return applicable
      ? { applicable: true }
      : { applicable: false, reason: 'Venue is outside Poland' };
  }

  supports(kind: 'RECEIPT' | 'INVOICE' | 'CORRECTION' | 'REFUND'): boolean {
    return ['RECEIPT', 'INVOICE', 'CORRECTION', 'REFUND'].includes(kind);
  }
}
