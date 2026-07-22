import { BadRequestException } from '@nestjs/common';
import type { ConsentPurpose, PrismaClient } from '@prisma/client';
import { hashToken } from './security/token';

/** Product privacy-policy version stamped on ConsentRecord rows. */
export const GDPR_CONSENT_POLICY_VERSION = '2026-07-21';

export function assertPrivacyConsentAccepted(accepted: unknown): void {
  if (accepted !== true) {
    throw new BadRequestException(
      'Please accept the privacy notice to continue.',
    );
  }
}

export function hashConsentEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  return hashToken(normalized);
}

export type RecordConsentInput = {
  shopId: string;
  purpose: ConsentPurpose;
  guestEmail?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  ipAddress?: string | null;
  policyVersion?: string;
};

/** Persist a consent receipt after a successful public create. Fail-open never. */
export async function recordConsent(
  prisma: PrismaClient,
  input: RecordConsentInput,
): Promise<void> {
  await prisma.consentRecord.create({
    data: {
      shopId: input.shopId,
      purpose: input.purpose,
      policyVersion: input.policyVersion ?? GDPR_CONSENT_POLICY_VERSION,
      subjectEmailHash: hashConsentEmail(input.guestEmail),
      sourceEntityType: input.sourceEntityType ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
      ipAddress: input.ipAddress?.trim().slice(0, 64) || null,
    },
  });
}
