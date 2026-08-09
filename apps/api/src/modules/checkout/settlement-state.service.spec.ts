import { ConflictException } from '@nestjs/common';
import { SettlementStateService } from './settlement-state.service';

describe('SettlementStateService', () => {
  const service = new SettlementStateService();

  it('starts a newly frozen settlement at CALCULATED', () => {
    expect(service.initialCalculatedState()).toBe('CALCULATED');
  });

  it('allows only an open GuestCheck to calculate settlement', () => {
    expect(() => service.assertGuestCheckCanCalculate('OPEN')).not.toThrow();
    expect(() => service.assertGuestCheckCanCalculate('SETTLED')).toThrow(
      ConflictException,
    );
  });

  it('rejects unsupported payment-state jumps in Chunk 02', () => {
    expect(() => service.assertTransition('CALCULATED', 'PAID')).not.toThrow();
    expect(() => service.assertTransition('CALCULATED', 'CLOSED')).toThrow(
      'Unsupported settlement transition',
    );
    expect(() => service.assertTransition('CLOSED', 'PAID')).toThrow(
      ConflictException,
    );
  });
});
