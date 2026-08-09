import { ConflictException, Injectable } from '@nestjs/common';
import type { CheckSettlementState } from '@prisma/client';

const TRANSITIONS: Record<CheckSettlementState, readonly CheckSettlementState[]> = {
  OPEN: ['CALCULATED', 'VOID'],
  CALCULATED: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'VOID'],
  PAID: ['CLOSED'],
  CLOSED: [],
  VOID: [],
};

@Injectable()
export class SettlementStateService {
  initialCalculatedState(): CheckSettlementState {
    return 'CALCULATED';
  }

  assertGuestCheckCanCalculate(status: string): void {
    if (status !== 'OPEN') {
      throw new ConflictException(
        'Checkout settlement can only be calculated for an open GuestCheck',
      );
    }
  }

  assertTransition(
    from: CheckSettlementState,
    to: CheckSettlementState,
  ): void {
    if (!TRANSITIONS[from].includes(to)) {
      throw new ConflictException(
        `Unsupported settlement transition: ${from} -> ${to}`,
      );
    }
  }
}
