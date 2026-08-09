import { ConflictException } from '@nestjs/common';
import { assertExpectedVersion } from './optimistic-concurrency.util';

describe('assertExpectedVersion', () => {
  it('accepts the current aggregate version', () => {
    expect(() => assertExpectedVersion(4, 4)).not.toThrow();
  });

  it('rejects a stale version with a stable machine code', () => {
    try {
      assertExpectedVersion(5, 4, {
        aggregateType: 'guest_check',
        aggregateId: 'check_1',
      });
      throw new Error('expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('VERSION_CONFLICT');
      expect(response.details).toMatchObject({
        expectedVersion: 4,
        actualVersion: 5,
        aggregateId: 'check_1',
      });
    }
  });
});
