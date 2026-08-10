import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ComplianceDocumentKind,
  ComplianceDocumentState,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import { ComplianceProfileService } from './compliance-profile.service';
import type { GenerateSettlementComplianceDocumentDto } from './dto/compliance.dto';
import { Fa3BuilderService, type Fa3Line } from './ksef/fa3-builder.service';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function pricingTaxCode(value: Prisma.JsonValue | null, fallback: string | null): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const raw = (value as Record<string, unknown>).taxCategoryCode;
    if (typeof raw === 'string' && raw.trim()) return raw.trim().toUpperCase();
  }
  return fallback?.trim().toUpperCase() || null;
}

function fiscalState(state: ComplianceDocumentState | null) {
  if (!state) return 'PAID' as const;
  if (state === 'ACCEPTED') return 'ISSUED' as const;
  if (state === 'PENDING' || state === 'SUBMITTED') return 'FISCALIZING' as const;
  if (state === 'REJECTED' || state === 'UNKNOWN' || state === 'DISABLED') {
    return 'ACTION_REQUIRED' as const;
  }
  return 'PAID' as const;
}

@Injectable()
export class FiscalDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly profiles: ComplianceProfileService,
    private readonly fa3: Fa3BuilderService,
  ) {}

  private assertRead(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.TRANSACTION_READ)) return;
    throw new ForbiddenException('Missing transaction.read permission');
  }

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.TRANSACTION_WRITE)) return;
    throw new ForbiddenException('Missing transaction.write permission');
  }

  private async requirePoland(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { country: true },
    });
    const country = shop?.country?.trim().toUpperCase();
    if (!['PL', 'POLAND', 'POLSKA'].includes(country ?? '')) {
      throw new ForbiddenException('Poland compliance is not applicable to this venue');
    }
    if (!(await this.flags.isFeatureEnabled(shopId, 'fiscal_pl'))) {
      throw new ForbiddenException('Poland fiscal compliance is not enabled for this venue');
    }
  }

  private async loadPaidSettlement(shopId: string, settlementId: string) {
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId },
      include: { snapshots: { orderBy: { position: 'asc' } } },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (settlement.state !== 'PAID' && settlement.state !== 'CLOSED') {
      throw new ConflictException('Fiscal document can only be created from a fully paid settlement');
    }
    if (!settlement.amountDue.equals(0)) {
      throw new ConflictException('Settlement still has an amount due');
    }
    if (!settlement.snapshots.length) {
      throw new BadRequestException('Paid settlement has no immutable charge snapshots');
    }
    return settlement;
  }

  async generateFromSettlement(
    actor: JwtAccessPayload,
    settlementId: string,
    dto: GenerateSettlementComplianceDocumentDto,
  ) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await this.requirePoland(shopId);
    const settlement = await this.loadPaidSettlement(shopId, settlementId);
    const { profile } = await this.profiles.getKsefContext(shopId);

    if (dto.kind === 'INVOICE' && (!dto.buyerName?.trim() || !dto.buyerTaxId?.trim())) {
      throw new BadRequestException('Poland B2B invoice requires buyerName and buyerTaxId');
    }

    const existing = await this.prisma.complianceDocument.findFirst({
      where: {
        shopId,
        jurisdiction: 'PL',
        kind: dto.kind as ComplianceDocumentKind,
        sourceType: 'CHECK_SETTLEMENT',
        sourceId: settlement.id,
        sourceVersion: settlement.checkVersion,
      },
      include: { lines: { orderBy: { position: 'asc' } }, requests: true, proofs: true },
    });
    if (existing) return existing;

    const categories = await this.prisma.taxCategory.findMany({
      where: { shopId, active: true },
    });
    const categoryMap = new Map(categories.map((category) => [category.code.toUpperCase(), category]));
    const lines = settlement.snapshots.map((snapshot) => {
      const code = pricingTaxCode(snapshot.pricingMetadata, profile.defaultTaxCategoryCode);
      if (!code) {
        throw new BadRequestException(
          `Tax category is not configured for charge '${snapshot.description}'.`,
        );
      }
      const category = categoryMap.get(code);
      if (!category) {
        throw new BadRequestException(`Tax category '${code}' is missing or inactive.`);
      }
      const gross = snapshot.finalAmount.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const divisor = new Prisma.Decimal(1).add(category.ratePercent.div(100));
      const net = gross.div(divisor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const tax = gross.sub(net).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      return {
        position: snapshot.position,
        snapshotId: snapshot.id,
        sourceType: snapshot.sourceType,
        sourceId: snapshot.sourceId,
        lineReference: snapshot.lineReference,
        description: snapshot.description,
        quantity: new Prisma.Decimal(snapshot.quantity),
        taxCategoryCode: category.code,
        taxRatePercent: category.ratePercent,
        netAmount: net,
        taxAmount: tax,
        grossAmount: gross,
        currency: snapshot.currency,
      };
    });

    const netTotal = lines.reduce((sum, line) => sum.add(line.netAmount), new Prisma.Decimal(0));
    const taxTotal = lines.reduce((sum, line) => sum.add(line.taxAmount), new Prisma.Decimal(0));
    const grossTotal = lines.reduce((sum, line) => sum.add(line.grossAmount), new Prisma.Decimal(0));
    if (!grossTotal.equals(settlement.total)) {
      throw new ConflictException(
        'Settlement total cannot be reconciled exactly to immutable charge snapshots; fiscalization requires review.',
      );
    }
    if (!netTotal.add(taxTotal).equals(grossTotal)) {
      throw new ConflictException('Tax line calculation does not conserve the settlement total');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ComplianceProfile" WHERE "shopId" = ${shopId} FOR UPDATE`;
      const locked = await tx.complianceProfile.findUniqueOrThrow({ where: { shopId } });
      const year = new Date().getUTCFullYear();
      const sequence = dto.kind === 'INVOICE' ? locked.nextInvoiceSequence : locked.nextReceiptSequence;
      const prefix = dto.kind === 'INVOICE' ? 'FV' : 'PAR';
      const documentNumber = `GS/${prefix}/${year}/${String(sequence).padStart(6, '0')}`;

      let payloadXml: string | null = null;
      if (dto.kind === 'INVOICE') {
        payloadXml = this.fa3.buildStandardDomesticInvoice({
          documentNumber,
          issueDate: new Date(),
          currency: settlement.currency,
          seller: {
            legalName: locked.legalName,
            nip: locked.taxId,
            streetAddress: locked.streetAddress,
            postalCode: locked.postalCode,
            city: locked.city,
          },
          buyerName: dto.buyerName!.trim(),
          buyerNip: dto.buyerTaxId!.trim(),
          lines: lines.map((line): Fa3Line => ({
            position: line.position,
            description: line.description,
            quantity: line.quantity,
            netAmount: line.netAmount,
            taxAmount: line.taxAmount,
            grossAmount: line.grossAmount,
            taxRatePercent: line.taxRatePercent,
          })),
        });
      }

      const canonical = JSON.stringify({
        documentNumber,
        sourceId: settlement.id,
        sourceVersion: settlement.checkVersion,
        kind: dto.kind,
        currency: settlement.currency,
        buyerName: dto.buyerName?.trim() || null,
        buyerTaxId: dto.buyerTaxId?.trim() || null,
        lines: lines.map((line) => ({
          position: line.position,
          snapshotId: line.snapshotId,
          taxCategoryCode: line.taxCategoryCode,
          taxRatePercent: line.taxRatePercent.toString(),
          netAmount: line.netAmount.toString(),
          taxAmount: line.taxAmount.toString(),
          grossAmount: line.grossAmount.toString(),
        })),
      });
      const payloadHash = sha256(payloadXml ?? canonical);
      const taxSummary = [...categoryMap.values()]
        .map((category) => {
          const matching = lines.filter((line) => line.taxCategoryCode === category.code);
          if (!matching.length) return null;
          return {
            code: category.code,
            ratePercent: category.ratePercent.toString(),
            netAmount: matching.reduce((sum, line) => sum.add(line.netAmount), new Prisma.Decimal(0)).toString(),
            taxAmount: matching.reduce((sum, line) => sum.add(line.taxAmount), new Prisma.Decimal(0)).toString(),
            grossAmount: matching.reduce((sum, line) => sum.add(line.grossAmount), new Prisma.Decimal(0)).toString(),
          };
        })
        .filter(Boolean);

      const document = await tx.complianceDocument.create({
        data: {
          shopId,
          jurisdiction: 'PL',
          kind: dto.kind as ComplianceDocumentKind,
          state: ComplianceDocumentState.DRAFT,
          sourceType: 'CHECK_SETTLEMENT',
          sourceId: settlement.id,
          sourceVersion: settlement.checkVersion,
          documentNumber,
          issueDate: new Date(),
          currency: settlement.currency,
          buyerName: dto.buyerName?.trim() || null,
          buyerTaxId: dto.buyerTaxId?.trim() || null,
          netAmount: netTotal,
          taxAmount: taxTotal,
          grossAmount: grossTotal,
          taxSummary: taxSummary as Prisma.InputJsonValue,
          payloadHash,
          payloadXml,
          createdById: actor.sub,
          lines: {
            create: lines.map((line) => ({
              shopId,
              position: line.position,
              snapshotId: line.snapshotId,
              sourceType: line.sourceType,
              sourceId: line.sourceId,
              lineReference: line.lineReference,
              description: line.description,
              quantity: line.quantity,
              taxCategoryCode: line.taxCategoryCode,
              taxRatePercent: line.taxRatePercent,
              netAmount: line.netAmount,
              taxAmount: line.taxAmount,
              grossAmount: line.grossAmount,
              currency: line.currency,
            })),
          },
          events: {
            create: {
              shopId,
              eventType: 'compliance.document.generated_from_settlement',
              payloadHash,
              payload: { settlementId, kind: dto.kind, documentNumber },
            },
          },
        },
        include: { lines: { orderBy: { position: 'asc' } }, requests: true, proofs: true },
      });

      await tx.complianceProfile.update({
        where: { shopId },
        data: dto.kind === 'INVOICE'
          ? { nextInvoiceSequence: { increment: 1 } }
          : { nextReceiptSequence: { increment: 1 } },
      });
      return document;
    });
  }

  async settlementStatus(actor: JwtAccessPayload, settlementId: string) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId },
      select: { id: true, state: true, amountDue: true, total: true, currency: true },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    const document = await this.prisma.complianceDocument.findFirst({
      where: { shopId, sourceType: 'CHECK_SETTLEMENT', sourceId: settlementId },
      orderBy: { createdAt: 'desc' },
      include: { requests: { orderBy: { createdAt: 'desc' }, take: 1 }, proofs: true },
    });
    const paid = (settlement.state === 'PAID' || settlement.state === 'CLOSED') && settlement.amountDue.equals(0);
    return {
      settlementId,
      paid,
      state: paid ? fiscalState(document?.state ?? null) : 'UNPAID',
      document: document
        ? {
            id: document.id,
            kind: document.kind,
            state: document.state,
            documentNumber: document.documentNumber,
            ksefNumber: document.ksefNumber,
            lastRequest: document.requests[0] ?? null,
          }
        : null,
    };
  }

  async reconciliation(actor: JwtAccessPayload) {
    this.assertRead(actor);
    const shopId = requireShopId(actor);
    await this.requirePoland(shopId);
    const paid = await this.prisma.checkSettlement.findMany({
      where: { shopId, state: { in: ['PAID', 'CLOSED'] }, amountDue: 0 },
      select: { id: true, guestCheckId: true, total: true, currency: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const documents = await this.prisma.complianceDocument.findMany({
      where: { shopId, sourceType: 'CHECK_SETTLEMENT', sourceId: { in: paid.map((row) => row.id) } },
      include: { requests: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const bySettlement = new Map(documents.map((doc) => [doc.sourceId, doc]));
    const rows = paid.map((settlement) => {
      const doc = bySettlement.get(settlement.id) ?? null;
      return {
        settlementId: settlement.id,
        guestCheckId: settlement.guestCheckId,
        amount: settlement.total.toString(),
        currency: settlement.currency,
        paidAt: settlement.updatedAt.toISOString(),
        complianceState: fiscalState(doc?.state ?? null),
        documentId: doc?.id ?? null,
        documentNumber: doc?.documentNumber ?? null,
        ksefNumber: doc?.ksefNumber ?? null,
        actionRequired: Boolean(doc && ['REJECTED', 'UNKNOWN', 'DISABLED'].includes(doc.state)),
        lastError: doc?.requests[0]?.errorMessage ?? null,
      };
    });
    return {
      totalPaidSettlements: rows.length,
      missingDocument: rows.filter((row) => !row.documentId).length,
      actionRequired: rows.filter((row) => row.actionRequired).length,
      rows,
    };
  }
}
