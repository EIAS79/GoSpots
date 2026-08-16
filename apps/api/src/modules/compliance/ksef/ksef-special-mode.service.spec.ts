import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ComplianceDocumentKind,
  KsefSpecialMode,
  KsefSpecialModeStatus,
} from '@prisma/client';
import type { JwtAccessPayload } from '../../auth/auth.service';
import { KsefSpecialModeService } from './ksef-special-mode.service';

function owner(): JwtAccessPayload {
  return { sub: 'owner-1', shopId: 'shop-1', shopRole: 'OWNER', perms: '*' } as JwtAccessPayload;
}

function harness() {
  const record = {
    id: 'special-1',
    shopId: 'shop-1',
    documentId: 'doc-1',
    mode: KsefSpecialMode.OFFLINE24,
    status: KsefSpecialModeStatus.AWAITING_SUBMISSION,
  };
  const tx: any = {
    ksefSpecialModeRecord: { create: jest.fn().mockResolvedValue(record) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    complianceDocument: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'doc-1',
        kind: ComplianceDocumentKind.INVOICE,
        state: 'DRAFT',
        payloadXml: '<Faktura />',
        ksefNumber: null,
      }),
    },
    ksefSpecialModeRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(record),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    complianceRequest: { findFirst: jest.fn() },
    $transaction: jest.fn(async (cb: (client: any) => unknown) => cb(tx)),
  };
  return { service: new KsefSpecialModeService(prisma), prisma, tx };
}

describe('KsefSpecialModeService', () => {
  it('requires a statutory deadline for deferred modes', async () => {
    const h = harness();
    await expect(h.service.register(owner(), 'doc-1', {
      mode: KsefSpecialMode.OFFLINE24,
      issuedAt: '2026-08-16T10:00:00.000Z',
      submissionDeadlineAt: null,
      qrRequiredBeforeSubmit: false,
      legalBasisNote: 'offline24 selected under verified venue procedure',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires QR evidence hashes when the invoice is delivered before KSeF submission', async () => {
    const h = harness();
    await expect(h.service.register(owner(), 'doc-1', {
      mode: KsefSpecialMode.ANNOUNCED_FAILURE,
      issuedAt: '2026-08-16T10:00:00.000Z',
      submissionDeadlineAt: '2026-08-25T10:00:00.000Z',
      qrRequiredBeforeSubmit: true,
      legalBasisNote: 'announced KSeF failure',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records complete outage as no-submission-required and forbids a deadline', async () => {
    const h = harness();
    await expect(h.service.register(owner(), 'doc-1', {
      mode: KsefSpecialMode.TOTAL_FAILURE,
      issuedAt: '2026-08-16T10:00:00.000Z',
      submissionDeadlineAt: '2026-08-20T10:00:00.000Z',
      qrRequiredBeforeSubmit: false,
      legalBasisNote: 'total failure announced through official channel',
    })).rejects.toBeInstanceOf(BadRequestException);

    await h.service.register(owner(), 'doc-1', {
      mode: KsefSpecialMode.TOTAL_FAILURE,
      issuedAt: '2026-08-16T10:00:00.000Z',
      submissionDeadlineAt: null,
      qrRequiredBeforeSubmit: false,
      legalBasisNote: 'total failure announced through official channel',
    });
    expect(h.tx.ksefSpecialModeRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: KsefSpecialModeStatus.NO_SUBMISSION_REQUIRED }),
    }));
  });

  it('does not allow deferred submission linking for total-failure records', async () => {
    const h = harness();
    h.prisma.ksefSpecialModeRecord.findFirst.mockResolvedValue({
      id: 'special-total',
      shopId: 'shop-1',
      documentId: 'doc-1',
      mode: KsefSpecialMode.TOTAL_FAILURE,
      status: KsefSpecialModeStatus.NO_SUBMISSION_REQUIRED,
    });
    await expect(h.service.linkSubmission(owner(), 'doc-1', { complianceRequestId: 'req-1' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
