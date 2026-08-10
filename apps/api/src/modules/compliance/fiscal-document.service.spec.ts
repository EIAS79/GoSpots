import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FiscalDocumentService } from './fiscal-document.service';
import { Fa3BuilderService } from './ksef/fa3-builder.service';

const d = (value: string | number) => new Prisma.Decimal(value);
const actor = { sub: 'owner-1', shopId: 'shop-1', shopRole: 'OWNER', perms: '*' } as JwtAccessPayload;

function paidSettlement(metadata: unknown = { taxCategoryCode: 'VAT23' }) {
  return {
    id: 'settlement-1',
    shopId: 'shop-1',
    guestCheckId: 'check-1',
    state: 'PAID',
    checkVersion: 7,
    amountDue: d(0),
    total: d('123.0000'),
    currency: 'PLN',
    snapshots: [
      {
        id: 'snapshot-1',
        position: 1,
        sourceType: 'SHOP_ORDER',
        sourceId: 'order-1',
        lineReference: 'line-1',
        description: 'Dinner',
        quantity: 1,
        finalAmount: d('123.0000'),
        currency: 'PLN',
        pricingMetadata: metadata,
      },
    ],
  };
}

function makeService(settlement = paidSettlement(), categories: any[] = [{ code: 'VAT23', ratePercent: d(23), active: true }]) {
  const created: any[] = [];
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'profile-1' }]),
    complianceProfile: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        shopId: 'shop-1', legalName: 'OUR-CS', taxId: '7011320812', streetAddress: 'Street 1',
        postalCode: '02-001', city: 'Warszawa', nextInvoiceSequence: 1, nextReceiptSequence: 1,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    complianceDocument: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: 'doc-1', ...data, lines: data.lines.create, requests: [], proofs: [] };
        created.push(row);
        return row;
      }),
    },
  };
  const prisma: any = {
    shop: { findUnique: jest.fn().mockResolvedValue({ country: 'PL' }) },
    checkSettlement: { findFirst: jest.fn().mockResolvedValue(settlement) },
    complianceDocument: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
    taxCategory: { findMany: jest.fn().mockResolvedValue(categories) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const flags: any = { isFeatureEnabled: jest.fn().mockResolvedValue(true) };
  const profiles: any = {
    getKsefContext: jest.fn().mockResolvedValue({ profile: { defaultTaxCategoryCode: null } }),
  };
  return { service: new FiscalDocumentService(prisma, flags, profiles, new Fa3BuilderService()), prisma, tx, created, profiles };
}

describe('FiscalDocumentService', () => {
  test('generates an immutable paid-settlement invoice with exact net+tax=gross conservation', async () => {
    const { service, tx } = makeService();
    const result: any = await service.generateFromSettlement(actor, 'settlement-1', {
      kind: 'INVOICE', buyerName: 'Buyer Sp. z o.o.', buyerTaxId: '1234563218',
    });
    expect(result.documentNumber).toMatch(/^GS\/FV\/\d{4}\/000001$/);
    expect(result.netAmount.add(result.taxAmount).toFixed(4)).toBe('123.0000');
    expect(result.grossAmount.toFixed(4)).toBe('123.0000');
    expect(result.lines[0].taxCategoryCode).toBe('VAT23');
    expect(result.lines[0].taxRatePercent.toFixed(4)).toBe('23.0000');
    expect(result.payloadXml).toContain('FA (3)');
    expect(tx.complianceProfile.update).toHaveBeenCalledTimes(1);
  });

  test('refuses to guess VAT when neither snapshot nor profile maps a tax category', async () => {
    const { service } = makeService(paidSettlement(null));
    await expect(
      service.generateFromSettlement(actor, 'settlement-1', { kind: 'RECEIPT' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('rejects an unpaid settlement before any fiscal document is created', async () => {
    const settlement = { ...paidSettlement(), state: 'PARTIALLY_PAID', amountDue: d(20) };
    const { service, prisma } = makeService(settlement);
    await expect(
      service.generateFromSettlement(actor, 'settlement-1', { kind: 'RECEIPT' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('replays the same source/version without creating a second fiscal document', async () => {
    const { service, prisma } = makeService();
    const existing = { id: 'doc-existing', payloadHash: 'same', lines: [], requests: [], proofs: [] };
    prisma.complianceDocument.findFirst.mockResolvedValue(existing);
    await expect(service.generateFromSettlement(actor, 'settlement-1', { kind: 'RECEIPT' })).resolves.toBe(existing);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
