import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Fa3BuilderService } from './fa3-builder.service';

describe('Fa3BuilderService', () => {
  const service = new Fa3BuilderService();
  const base = {
    documentNumber: 'GS/FV/2026/000001',
    issueDate: new Date('2026-08-10T12:00:00.000Z'),
    currency: 'PLN',
    seller: {
      legalName: 'OUR-CS & Partners <PL>',
      nip: '7011320812',
      streetAddress: 'Aleje Jerozolimskie 81 & 7.10',
      postalCode: '02-001',
      city: 'Warszawa',
    },
    buyerName: 'Buyer & Co',
    buyerNip: '1234563218',
  };

  test('builds FA(3) XML with escaped identity and exact standard VAT line totals', () => {
    const xml = service.buildStandardDomesticInvoice({
      ...base,
      lines: [
        {
          position: 1,
          description: 'Billiard <60 min> & drink',
          quantity: new Prisma.Decimal(1),
          netAmount: new Prisma.Decimal('100.00'),
          taxAmount: new Prisma.Decimal('23.00'),
          grossAmount: new Prisma.Decimal('123.00'),
          taxRatePercent: new Prisma.Decimal('23'),
        },
      ],
    });

    expect(xml).toContain('xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"');
    expect(xml).toContain('kodSystemowy="FA (3)"');
    expect(xml).toContain('<WariantFormularza>3</WariantFormularza>');
    expect(xml).toContain('<P_13_1>100.00</P_13_1>');
    expect(xml).toContain('<P_14_1>23.00</P_14_1>');
    expect(xml).toContain('<P_15>123.00</P_15>');
    expect(xml).toContain('OUR-CS &amp; Partners &lt;PL&gt;');
    expect(xml).toContain('Billiard &lt;60 min&gt; &amp; drink');
  });

  test('rejects unsupported tax rates instead of guessing a legal mapping', () => {
    expect(() =>
      service.buildStandardDomesticInvoice({
        ...base,
        lines: [
          {
            position: 1,
            description: 'Unsupported rate',
            quantity: new Prisma.Decimal(1),
            netAmount: new Prisma.Decimal('100'),
            taxAmount: new Prisma.Decimal('7'),
            grossAmount: new Prisma.Decimal('107'),
            taxRatePercent: new Prisma.Decimal('7'),
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  test('rejects non-PLN pilot invoices', () => {
    expect(() =>
      service.buildStandardDomesticInvoice({
        ...base,
        currency: 'EUR',
        lines: [
          {
            position: 1,
            description: 'EUR line',
            quantity: new Prisma.Decimal(1),
            netAmount: new Prisma.Decimal('100'),
            taxAmount: new Prisma.Decimal('23'),
            grossAmount: new Prisma.Decimal('123'),
            taxRatePercent: new Prisma.Decimal('23'),
          },
        ],
      }),
    ).toThrow('PLN');
  });
});
