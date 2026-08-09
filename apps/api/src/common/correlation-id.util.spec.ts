import { resolveCorrelationId } from './correlation-id.util';

describe('resolveCorrelationId', () => {
  it('reuses a safe x-correlation-id', () => {
    expect(
      resolveCorrelationId(
        { 'x-correlation-id': 'corr_12345678' },
        () => 'generated-id',
      ),
    ).toBe('corr_12345678');
  });

  it('falls back to the legacy x-request-id', () => {
    expect(
      resolveCorrelationId(
        { 'x-request-id': 'legacy_12345678' },
        () => 'generated-id',
      ),
    ).toBe('legacy_12345678');
  });

  it('rejects unsafe caller values and generates a new id', () => {
    expect(
      resolveCorrelationId(
        { 'x-correlation-id': 'bad id\nheader' },
        () => 'generated-safe-id',
      ),
    ).toBe('generated-safe-id');
  });
});
