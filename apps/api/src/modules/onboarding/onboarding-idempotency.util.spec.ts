import { deriveApplyTemplateIdempotencyKey } from './onboarding-idempotency.util';

describe('deriveApplyTemplateIdempotencyKey', () => {
  it('prefers explicit Idempotency-Key header', () => {
    expect(
      deriveApplyTemplateIdempotencyKey(
        { templateId: 'pc_cafe' },
        '  custom-key  ',
      ),
    ).toBe('custom-key');
  });

  it('derives stable key from templateId for initial apply', () => {
    expect(
      deriveApplyTemplateIdempotencyKey({ templateId: 'billiard_hall' }),
    ).toBe('onboarding:billiard_hall');
  });

  it('derives replace key from sorted previous category ids', () => {
    const a = deriveApplyTemplateIdempotencyKey({
      templateId: 'pc_cafe',
      replace: true,
      previousCategoryIds: ['b-id', 'a-id'],
    });
    const b = deriveApplyTemplateIdempotencyKey({
      templateId: 'pc_cafe',
      replace: true,
      previousCategoryIds: ['a-id', 'b-id'],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^onboarding:pc_cafe:replace:[0-9a-f]{16}$/);
  });
});
