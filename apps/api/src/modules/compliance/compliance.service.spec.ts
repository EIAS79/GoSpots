import { ConflictException } from '@nestjs/common';
import { ComplianceRequestState, Prisma } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ComplianceService } from './compliance.service';

const actor = { sub: 'owner-1', shopId: 'shop-1', shopRole: 'OWNER', perms: '*' } as JwtAccessPayload;

function baseDocument() {
  return {
    id: 'doc-1',
    shopId: 'shop-1',
    kind: 'INVOICE',
    state: 'DRAFT',
    payloadHash: 'payload-hash',
    payloadXml: '<Faktura/>',
  };
}

function makeService(existingOperation: any = null) {
  const remote = { submitOnlineInvoice: jest.fn(), getInvoiceStatus: jest.fn(), getInvoiceUpo: jest.fn(), isEnabled: jest.fn().mockReturnValue(true) };
  const tx: any = {
    complianceRequest: { update: jest.fn(async ({ data }: any) => ({ id: 'req-1', documentId: 'doc-1', ...data })) },
    complianceDocument: { update: jest.fn() },
    complianceProof: { create: jest.fn(), upsert: jest.fn() },
    complianceEvent: { create: jest.fn() },
  };
  const prisma: any = {
    shop: { findUnique: jest.fn().mockResolvedValue({ country: 'PL' }) },
    complianceDocument: {
      findFirst: jest.fn().mockResolvedValue(baseDocument()),
      update: jest.fn(),
    },
    complianceRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.documentId_adapter_operation) return existingOperation;
        return null;
      }),
      create: jest.fn().mockResolvedValue({ id: 'req-1', documentId: 'doc-1' }),
      update: jest.fn(),
    },
    complianceProof: { upsert: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
  const crypto: any = { hashText: jest.fn((value: string) => value) };
  return { service: new ComplianceService(prisma, flags, remote as any, crypto), prisma, remote, tx };
}

describe('ComplianceService KSeF safety', () => {
  test('an UNKNOWN submission can only be reconciled and never resubmitted', async () => {
    const existing = {
      id: 'req-existing',
      documentId: 'doc-1',
      adapter: 'PL_KSEF',
      operation: 'SUBMIT_INVOICE',
      state: ComplianceRequestState.UNKNOWN,
      idempotencyKey: 'first-key',
      requestHash: 'hash',
    };
    const { service, remote } = makeService(existing);
    await expect(service.submitKsef(actor, 'doc-1', 'another-key')).rejects.toBeInstanceOf(ConflictException);
    expect(remote.submitOnlineInvoice).not.toHaveBeenCalled();
  });

  test('a second idempotency key replays the existing submission operation without another provider call', async () => {
    const existing = {
      id: 'req-existing',
      documentId: 'doc-1',
      adapter: 'PL_KSEF',
      operation: 'SUBMIT_INVOICE',
      state: ComplianceRequestState.SUBMITTED,
      idempotencyKey: 'first-key',
      requestHash: 'hash',
    };
    const { service, remote, prisma } = makeService(existing);
    await expect(service.submitKsef(actor, 'doc-1', 'another-key')).resolves.toBe(existing);
    expect(remote.submitOnlineInvoice).not.toHaveBeenCalled();
    expect(prisma.complianceRequest.create).not.toHaveBeenCalled();
  });

  test('an ambiguous first provider call is persisted UNKNOWN with reconciliation required', async () => {
    const { service, remote, tx } = makeService(null);
    remote.submitOnlineInvoice.mockResolvedValue({
      state: 'UNKNOWN',
      sessionReference: 'session-1',
      invoiceReference: 'invoice-1',
      errorCode: 'KSEF_OUTCOME_UNKNOWN',
      errorMessage: 'timeout after submission',
    });

    const result: any = await service.submitKsef(actor, 'doc-1', 'first-key');
    expect(result.state).toBe(ComplianceRequestState.UNKNOWN);
    expect(result.reconciliationRequired).toBe(true);
    expect(remote.submitOnlineInvoice).toHaveBeenCalledTimes(1);
    expect(tx.complianceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { state: 'UNKNOWN' } }),
    );
  });
});
