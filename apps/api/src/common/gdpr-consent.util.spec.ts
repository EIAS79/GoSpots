import { BadRequestException } from '@nestjs/common';
import {
  assertPrivacyConsentAccepted,
  GDPR_CONSENT_POLICY_VERSION,
  hashConsentEmail,
  recordConsent,
} from './gdpr-consent.util';

describe('gdpr-consent.util', () => {
  it('asserts privacyConsentAccepted === true', () => {
    expect(() => assertPrivacyConsentAccepted(true)).not.toThrow();
    expect(() => assertPrivacyConsentAccepted(false)).toThrow(
      BadRequestException,
    );
    expect(() => assertPrivacyConsentAccepted(undefined)).toThrow(
      BadRequestException,
    );
  });

  it('hashes normalized email and nulls empty', () => {
    const a = hashConsentEmail('  Guest@Example.COM ');
    const b = hashConsentEmail('guest@example.com');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(hashConsentEmail(null)).toBeNull();
    expect(hashConsentEmail('  ')).toBeNull();
  });

  it('records ConsentRecord with policy version', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'c1' });
    const prisma = { consentRecord: { create } } as never;

    await recordConsent(prisma, {
      shopId: 'shop_a',
      purpose: 'BOOKING',
      guestEmail: 'g@example.com',
      sourceEntityType: 'reservation',
      sourceEntityId: 'r1',
      ipAddress: '1.2.3.4',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: 'shop_a',
        purpose: 'BOOKING',
        policyVersion: GDPR_CONSENT_POLICY_VERSION,
        subjectEmailHash: hashConsentEmail('g@example.com'),
        sourceEntityType: 'reservation',
        sourceEntityId: 'r1',
        ipAddress: '1.2.3.4',
      }),
    });
  });
});
