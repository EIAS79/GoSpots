import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type Fa3Seller = {
  legalName: string;
  nip: string;
  streetAddress: string;
  postalCode: string;
  city: string;
};

export type Fa3Line = {
  position: number;
  description: string;
  quantity: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  taxRatePercent: Prisma.Decimal;
};

export type Fa3InvoiceInput = {
  documentNumber: string;
  issueDate: Date;
  currency: string;
  seller: Fa3Seller;
  buyerName: string;
  buyerNip: string;
  lines: Fa3Line[];
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function money(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

function quantity(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4).replace(/\.?0+$/, '');
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function taxRateCode(rate: Prisma.Decimal): string {
  if (rate.equals(23)) return '23';
  if (rate.equals(8)) return '8';
  if (rate.equals(5)) return '5';
  if (rate.equals(0)) return '0';
  throw new BadRequestException(
    `FA(3) pilot currently supports standard domestic VAT rates 23, 8, 5 and 0 only; got ${rate.toString()}%.`,
  );
}

function aggregate(lines: Fa3Line[], rate: number) {
  const matching = lines.filter((line) => line.taxRatePercent.equals(rate));
  return matching.reduce(
    (acc, line) => ({ net: acc.net.add(line.netAmount), tax: acc.tax.add(line.taxAmount) }),
    { net: new Prisma.Decimal(0), tax: new Prisma.Decimal(0) },
  );
}

@Injectable()
export class Fa3BuilderService {
  buildStandardDomesticInvoice(input: Fa3InvoiceInput): string {
    if (input.currency.trim().toUpperCase() !== 'PLN') {
      throw new BadRequestException('The Poland KSeF pilot supports PLN invoices only.');
    }
    if (!/^\d{10}$/.test(input.seller.nip) || !/^\d{10}$/.test(input.buyerNip)) {
      throw new BadRequestException('Seller and buyer NIP must contain exactly 10 digits.');
    }
    if (!input.lines.length) throw new BadRequestException('Invoice must contain at least one line.');
    for (const line of input.lines) taxRateCode(line.taxRatePercent);

    const totalNet = input.lines.reduce((sum, line) => sum.add(line.netAmount), new Prisma.Decimal(0));
    const totalTax = input.lines.reduce((sum, line) => sum.add(line.taxAmount), new Prisma.Decimal(0));
    const totalGross = input.lines.reduce((sum, line) => sum.add(line.grossAmount), new Prisma.Decimal(0));
    const vat23 = aggregate(input.lines, 23);
    const vat8 = aggregate(input.lines, 8);
    const vat5 = aggregate(input.lines, 5);
    const vat0 = aggregate(input.lines, 0);

    const totals = [
      vat23.net.gt(0) ? `<P_13_1>${money(vat23.net)}</P_13_1><P_14_1>${money(vat23.tax)}</P_14_1>` : '',
      vat8.net.gt(0) ? `<P_13_2>${money(vat8.net)}</P_13_2><P_14_2>${money(vat8.tax)}</P_14_2>` : '',
      vat5.net.gt(0) ? `<P_13_3>${money(vat5.net)}</P_13_3><P_14_3>${money(vat5.tax)}</P_14_3>` : '',
      vat0.net.gt(0) ? `<P_13_6_1>${money(vat0.net)}</P_13_6_1>` : '',
    ].join('');

    const rows = input.lines
      .map((line) => {
        const unitNet = line.quantity.gt(0)
          ? line.netAmount.div(line.quantity)
          : line.netAmount;
        return `<FaWiersz><NrWierszaFa>${line.position}</NrWierszaFa><P_7>${escapeXml(line.description)}</P_7><P_8A>szt.</P_8A><P_8B>${quantity(line.quantity)}</P_8B><P_9A>${money(unitNet)}</P_9A><P_11>${money(line.netAmount)}</P_11><P_12>${taxRateCode(line.taxRatePercent)}</P_12></FaWiersz>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?><Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza><DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa><SystemInfo>GoSpots</SystemInfo></Naglowek><Podmiot1><DaneIdentyfikacyjne><NIP>${escapeXml(input.seller.nip)}</NIP><Nazwa>${escapeXml(input.seller.legalName)}</Nazwa></DaneIdentyfikacyjne><Adres><KodKraju>PL</KodKraju><AdresL1>${escapeXml(input.seller.streetAddress)}</AdresL1><AdresL2>${escapeXml(`${input.seller.postalCode} ${input.seller.city}`)}</AdresL2></Adres></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>${escapeXml(input.buyerNip)}</NIP><Nazwa>${escapeXml(input.buyerName)}</Nazwa></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>${day(input.issueDate)}</P_1><P_2>${escapeXml(input.documentNumber)}</P_2>${totals}<P_15>${money(totalGross)}</P_15><Adnotacje><P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A><Zwolnienie><P_19N>1</P_19N></Zwolnienie><NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu><P_23>2</P_23><PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy></Adnotacje><RodzajFaktury>VAT</RodzajFaktury>${rows}</Fa></Faktura>`;
  }
}

export const fa3TestHelpers = { escapeXml, money, taxRateCode };
