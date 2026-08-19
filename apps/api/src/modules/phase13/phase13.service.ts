import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CatalogItemKind,
  DataImportKind,
  DataImportStatus,
  OrganizationInventoryTransferStatus,
  OrganizationRole,
  Prisma,
  ResourceConfigurationState,
  ResourceType,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import {
  hashIdempotencyRequest,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { applyTenantRlsSession, getTenantRlsStore } from '../../common/tenant-rls.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FEATURE_KEYS, FeatureFlagService } from '../foundation/feature-flag.service';
import { IntegrationSecretBoxService } from '../integrations/integration-secret-box.service';
import {
  CreateCentralPurchaseOrderDto,
  CreateOrganizationInventoryTransferDto,
  ImportPreviewDto,
  ReceiveOrganizationInventoryTransferDto,
  SystemFeatureFlagUpdateDto,
  SystemSubscriptionUpdateDto,
} from './dto/phase13.dto';

const ORG_ADMIN_ROLES = new Set<OrganizationRole>([OrganizationRole.OWNER, OrganizationRole.ADMIN]);
const MAX_IMPORT_ROWS = 5000;
const IDEM_TRANSFER_CREATE = 'phase13.organization-inventory-transfer.create';
const IDEM_TRANSFER_RECEIVE = 'phase13.organization-inventory-transfer.receive';
const IDEM_CENTRAL_PURCHASE = 'phase13.organization-purchase-order.create';
const IDEM_IMPORT_COMMIT = 'phase13.data-import.commit';
type CsvRow = Record<string, string>;

export function parseCsv(csv: string): CsvRow[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field.trim()); field = ''; }
    else if (ch === '\n') { row.push(field.trim()); records.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (quoted) throw new BadRequestException('CSV contains an unterminated quoted field');
  if (field.length || row.length) { row.push(field.trim()); records.push(row); }
  while (records.length && records[records.length - 1].every((value) => !value)) records.pop();
  if (records.length < 2) throw new BadRequestException('CSV must contain a header and at least one data row');
  const headers = records[0].map((value) => value.trim());
  if (headers.some((value) => !value) || new Set(headers).size !== headers.length) throw new BadRequestException('CSV headers must be unique and non-empty');
  if (records.length - 1 > MAX_IMPORT_ROWS) throw new BadRequestException(`CSV import is limited to ${MAX_IMPORT_ROWS} rows`);
  return records.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw new BadRequestException(`CSV row ${index + 2} has ${cells.length} fields; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? '']));
  });
}

function requiredHeaders(kind: DataImportKind): string[] {
  if (kind === DataImportKind.PRODUCTS) return ['name', 'price'];
  if (kind === DataImportKind.CUSTOMERS) return ['name'];
  if (kind === DataImportKind.OPENING_STOCK) return ['sku', 'location', 'quantityMilli'];
  if (kind === DataImportKind.RESOURCES) return ['name', 'code'];
  return ['customerEmail', 'tierCode'];
}

function csvEscape(value: unknown) {
  let text = '';
  if (value == null) text = '';
  else if (typeof value === 'string') text = value;
  else if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) text = String(value);
  else if (value instanceof Date) text = value.toISOString();
  else if (value instanceof Prisma.Decimal) text = value.toString();
  else text = JSON.stringify(value) ?? '';
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

@Injectable()
export class Phase13Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagService,
    private readonly secretBox: IntegrationSecretBoxService,
  ) {}

  private assertSystemAdmin(actor: JwtAccessPayload) {
    if (actor.sysRole !== 'SUPER_ADMIN') throw new ForbiddenException('Super admin required');
  }

  private async requireOrgAdmin(actor: JwtAccessPayload, organizationId: string) {
    const activeShopId = requireShopId(actor);
    if (!(await this.flags.isFeatureEnabled(activeShopId, 'organizations_v1'))) throw new ForbiddenException('Organizations are not enabled for this venue');
    const membership = await this.prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: actor.sub } } });
    if (!membership || !ORG_ADMIN_ROLES.has(membership.role)) throw new ForbiddenException('Organization administrator access required');
  }

  private async withOrgBypass<T>(actor: JwtAccessPayload, organizationId: string, fn: () => Promise<T>) {
    await this.requireOrgAdmin(actor, organizationId);
    const store = getTenantRlsStore();
    if (!store?.tx) return fn();
    const activeShopId = requireShopId(actor);
    await applyTenantRlsSession(store.tx, { shopId: activeShopId, mode: 'bypass' });
    try { return await fn(); }
    finally { await applyTenantRlsSession(store.tx, { shopId: activeShopId, mode: 'tenant' }); }
  }

  async organizationOverview(actor: JwtAccessPayload, organizationId: string) {
    return this.withOrgBypass(actor, organizationId, async () => {
      const links = await this.prisma.organizationShop.findMany({ where: { organizationId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
      if (!links.length) throw new NotFoundException('Organization has no venues');
      const shopIds = links.map((row) => row.shopId);
      const [shops, devices, transferCounts, purchaseCounts] = await Promise.all([
        this.prisma.shop.findMany({ where: { id: { in: shopIds } }, select: {
          id: true, name: true, slug: true, currency: true, timezone: true,
          subscription: { select: { tier: true, status: true, packId: true, trialEndsAt: true, currentPeriodEnd: true, staffSeatQuantity: true, billingSubscription: { select: { provider: true, planId: true, canonicalStatus: true, gracePeriodEndsAt: true, currentPeriodEnd: true } } } },
        } }),
        this.prisma.device.findMany({ where: { shopId: { in: shopIds } }, select: { id: true, shopId: true, label: true, type: true, status: true, claimState: true, lastSeenAt: true, softwareVersion: true } }),
        this.prisma.organizationInventoryTransfer.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
        this.prisma.purchaseOrder.groupBy({ by: ['shopId', 'status'], where: { shopId: { in: shopIds } }, _count: { _all: true } }),
      ]);
      const shopById = new Map(shops.map((shop) => [shop.id, shop]));
      return {
        organizationId,
        venues: links.map((link) => {
          const shop = shopById.get(link.shopId);
          const venueDevices = devices.filter((device) => device.shopId === link.shopId);
          return {
            shopId: link.shopId, branchCode: link.branchCode, displayName: link.displayName ?? shop?.name ?? 'Venue', slug: shop?.slug ?? null,
            currency: shop?.currency ?? null, timezone: shop?.timezone ?? null, sharedCatalogEnabled: link.sharedCatalogEnabled,
            inheritance: { inherited: link.inheritedSettings, override: link.overrideSettings }, subscription: shop?.subscription ?? null,
            devices: { total: venueDevices.length, active: venueDevices.filter((d) => String(d.status) === 'ACTIVE').length, disabled: venueDevices.filter((d) => String(d.status) === 'DISABLED').length, items: venueDevices },
            purchasing: Object.fromEntries(purchaseCounts.filter((r) => r.shopId === link.shopId).map((r) => [r.status, r._count._all])),
          };
        }),
        inventoryTransfers: Object.fromEntries(transferCounts.map((row) => [row.status, row._count._all])),
      };
    });
  }

  async listTransfers(actor: JwtAccessPayload, organizationId: string) {
    return this.withOrgBypass(actor, organizationId, () => this.prisma.organizationInventoryTransfer.findMany({ where: { organizationId }, orderBy: { transferredAt: 'desc' }, take: 200 }));
  }

  async createTransfer(actor: JwtAccessPayload, organizationId: string, dto: CreateOrganizationInventoryTransferDto) {
    if (dto.sourceShopId === dto.destinationShopId) throw new BadRequestException('Cross-location transfer requires distinct venues');
    const requestHash = hashIdempotencyRequest({ ...dto, idempotencyKey: undefined });
    return this.withOrgBypass(actor, organizationId, async () => {
      const linked = await this.prisma.organizationShop.count({ where: { organizationId, shopId: { in: [dto.sourceShopId, dto.destinationShopId] } } });
      if (linked !== 2) throw new ForbiddenException('Both venues must belong to the same organization');
      return withClientIdempotency(this.prisma, { shopId: dto.sourceShopId, scope: IDEM_TRANSFER_CREATE, key: dto.idempotencyKey, requestHash, requireKey: true }, async () => {
        const [sourceItem, destinationItem, sourceLocation, destinationLocation] = await Promise.all([
          this.prisma.stockItem.findFirst({ where: { id: dto.sourceStockItemId, shopId: dto.sourceShopId, active: true } }),
          this.prisma.stockItem.findFirst({ where: { id: dto.destinationStockItemId, shopId: dto.destinationShopId, active: true } }),
          this.prisma.inventoryLocation.findFirst({ where: { id: dto.sourceLocationId, shopId: dto.sourceShopId, active: true } }),
          this.prisma.inventoryLocation.findFirst({ where: { id: dto.destinationLocationId, shopId: dto.destinationShopId, active: true } }),
        ]);
        if (!sourceItem || !destinationItem || !sourceLocation || !destinationLocation) throw new BadRequestException('Transfer item/location does not belong to its declared venue');
        if (sourceItem.sku && destinationItem.sku && sourceItem.sku !== destinationItem.sku) throw new BadRequestException('Source and destination stock items must represent the same SKU');
        const created = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`org-transfer-idem:${organizationId}:${dto.idempotencyKey}`}))`;
          const existing = await tx.organizationInventoryTransfer.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: dto.idempotencyKey } } });
          if (existing) {
            if (existing.requestHash !== requestHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
            return existing;
          }
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`org-transfer-stock:${dto.sourceShopId}:${dto.sourceStockItemId}:${dto.sourceLocationId}`}))`;
          const balance = await tx.stockMovement.aggregate({ where: { shopId: dto.sourceShopId, stockItemId: dto.sourceStockItemId, locationId: dto.sourceLocationId }, _sum: { quantityMilli: true } });
          const available = balance._sum.quantityMilli ?? 0;
          if (available < dto.quantityMilli) throw new ConflictException(`Insufficient source stock: ${available} milli-units available`);
          const transfer = await tx.organizationInventoryTransfer.create({ data: {
            organizationId, sourceShopId: dto.sourceShopId, destinationShopId: dto.destinationShopId, sourceStockItemId: dto.sourceStockItemId, destinationStockItemId: dto.destinationStockItemId,
            sourceLocationId: dto.sourceLocationId, destinationLocationId: dto.destinationLocationId, quantityMilli: dto.quantityMilli, unitCostMinor: sourceItem.weightedAverageCostMinor,
            idempotencyKey: dto.idempotencyKey, requestHash, requestedById: actor.sub, note: dto.note?.trim() || null,
          } });
          await tx.stockMovement.create({ data: {
            shopId: dto.sourceShopId, stockItemId: dto.sourceStockItemId, locationId: dto.sourceLocationId, kind: 'TRANSFER_OUT_ORGANIZATION', quantityMilli: -dto.quantityMilli,
            unitCostMinor: sourceItem.weightedAverageCostMinor, totalCostMinor: -Math.trunc((dto.quantityMilli * sourceItem.weightedAverageCostMinor) / 1000),
            referenceType: 'ORGANIZATION_TRANSFER', referenceId: transfer.id, movementKey: `org-transfer:${transfer.id}:out`, note: dto.note?.trim() || null, actorUserId: actor.sub,
          } });
          return transfer;
        });
        await Promise.all([
          this.audit.recordForShop(dto.sourceShopId, { section: 'operations', action: 'organization.inventory_transfer.dispatched', summary: 'Dispatched cross-location inventory transfer', actorName: actor.email, meta: { organizationId, transferId: created.id, destinationShopId: dto.destinationShopId, quantityMilli: dto.quantityMilli } }),
          this.audit.recordForShop(dto.destinationShopId, { section: 'operations', action: 'organization.inventory_transfer.incoming', summary: 'Incoming cross-location inventory transfer', actorName: actor.email, meta: { organizationId, transferId: created.id, sourceShopId: dto.sourceShopId, quantityMilli: dto.quantityMilli } }),
        ]);
        return created;
      });
    });
  }

  async receiveTransfer(actor: JwtAccessPayload, organizationId: string, transferId: string, dto: ReceiveOrganizationInventoryTransferDto) {
    return this.withOrgBypass(actor, organizationId, async () => {
      const transfer = await this.prisma.organizationInventoryTransfer.findFirst({ where: { id: transferId, organizationId } });
      if (!transfer) throw new NotFoundException('Transfer not found');
      if (dto.receivedMilli + dto.damagedMilli + dto.missingMilli !== transfer.quantityMilli) throw new BadRequestException('received + damaged + missing must equal dispatched quantity');
      return withClientIdempotency(this.prisma, { shopId: transfer.destinationShopId, scope: IDEM_TRANSFER_RECEIVE, key: `receive:${transfer.id}`, requestHash: hashIdempotencyRequest(dto) }, async () => {
        const updated = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`org-transfer-receive:${transfer.id}`}))`;
          const current = await tx.organizationInventoryTransfer.findUnique({ where: { id: transfer.id } });
          if (!current) throw new NotFoundException('Transfer not found');
          if (current.status === OrganizationInventoryTransferStatus.RECEIVED) {
            if (current.receivedMilli !== dto.receivedMilli || current.damagedMilli !== dto.damagedMilli || current.missingMilli !== dto.missingMilli) throw new ConflictException('IDEMPOTENCY_CONFLICT');
            return current;
          }
          if (current.status !== OrganizationInventoryTransferStatus.IN_TRANSIT) throw new ConflictException('Transfer cannot be received in its current state');
          if (dto.receivedMilli > 0) await tx.stockMovement.create({ data: {
            shopId: current.destinationShopId, stockItemId: current.destinationStockItemId, locationId: current.destinationLocationId, kind: 'TRANSFER_IN_ORGANIZATION', quantityMilli: dto.receivedMilli,
            unitCostMinor: current.unitCostMinor, totalCostMinor: Math.trunc((dto.receivedMilli * current.unitCostMinor) / 1000), referenceType: 'ORGANIZATION_TRANSFER', referenceId: current.id,
            movementKey: `org-transfer:${current.id}:in`, note: dto.note?.trim() || current.note, actorUserId: actor.sub,
          } });
          return tx.organizationInventoryTransfer.update({ where: { id: current.id }, data: {
            receivedMilli: dto.receivedMilli, damagedMilli: dto.damagedMilli, missingMilli: dto.missingMilli, status: OrganizationInventoryTransferStatus.RECEIVED,
            receivedById: actor.sub, receivedAt: new Date(), note: dto.note?.trim() || current.note,
          } });
        });
        await this.audit.recordForShop(transfer.destinationShopId, { section: 'operations', action: 'organization.inventory_transfer.received', summary: 'Received cross-location inventory transfer', actorName: actor.email, meta: { organizationId, transferId, receivedMilli: dto.receivedMilli, damagedMilli: dto.damagedMilli, missingMilli: dto.missingMilli } });
        return updated;
      });
    });
  }

  async createCentralPurchaseOrder(actor: JwtAccessPayload, organizationId: string, dto: CreateCentralPurchaseOrderDto) {
    if (!dto.lines.length) throw new BadRequestException('At least one purchase line is required');
    return this.withOrgBypass(actor, organizationId, async () => {
      const link = await this.prisma.organizationShop.findUnique({ where: { organizationId_shopId: { organizationId, shopId: dto.destinationShopId } } });
      if (!link) throw new ForbiddenException('Destination venue is not part of this organization');
      return withClientIdempotency(this.prisma, { shopId: dto.destinationShopId, scope: IDEM_CENTRAL_PURCHASE, key: dto.idempotencyKey, requestHash: hashIdempotencyRequest({ ...dto, idempotencyKey: undefined }), requireKey: true }, async () => {
        const [supplier, location, items] = await Promise.all([
          this.prisma.supplier.findFirst({ where: { id: dto.supplierId, shopId: dto.destinationShopId, active: true } }),
          this.prisma.inventoryLocation.findFirst({ where: { id: dto.locationId, shopId: dto.destinationShopId, active: true } }),
          this.prisma.stockItem.findMany({ where: { shopId: dto.destinationShopId, id: { in: dto.lines.map((line) => line.stockItemId) }, active: true } }),
        ]);
        if (!supplier || !location || items.length !== new Set(dto.lines.map((line) => line.stockItemId)).size) throw new BadRequestException('Supplier, location or item is not valid for destination venue');
        const order = await this.prisma.$transaction(async (tx) => {
          const created = await tx.purchaseOrder.create({ data: { shopId: dto.destinationShopId, supplierId: dto.supplierId, locationId: dto.locationId, status: 'DRAFT', documentRef: dto.documentRef?.trim() || null, createdById: actor.sub } });
          await tx.purchaseOrderLine.createMany({ data: dto.lines.map((line) => ({ shopId: dto.destinationShopId, purchaseOrderId: created.id, stockItemId: line.stockItemId, orderedMilli: line.orderedMilli, unitCostMinor: line.unitCostMinor })) });
          return created;
        });
        await this.audit.recordForShop(dto.destinationShopId, { section: 'operations', action: 'organization.central_purchase.created', summary: 'Created purchase order from organization control plane', actorName: actor.email, meta: { organizationId, purchaseOrderId: order.id, lineCount: dto.lines.length } });
        return order;
      });
    });
  }

  private validateRows(kind: DataImportKind, rows: CsvRow[]) {
    const headers = new Set(Object.keys(rows[0] ?? {}));
    const missing = requiredHeaders(kind).filter((header) => !headers.has(header));
    if (missing.length) throw new BadRequestException(`CSV is missing required columns: ${missing.join(', ')}`);
    const errors: Array<{ row: number; message: string }> = [];
    rows.forEach((row, index) => {
      const n = index + 2;
      if (kind === DataImportKind.PRODUCTS) {
        if (!row.name?.trim()) errors.push({ row: n, message: 'name is required' });
        if (!Number.isFinite(Number(row.price)) || Number(row.price) < 0) errors.push({ row: n, message: 'price must be non-negative' });
      } else if (kind === DataImportKind.CUSTOMERS && !row.name?.trim()) errors.push({ row: n, message: 'name is required' });
      else if (kind === DataImportKind.OPENING_STOCK) {
        if (!row.sku?.trim() || !row.location?.trim()) errors.push({ row: n, message: 'sku and location are required' });
        if (!Number.isInteger(Number(row.quantityMilli))) errors.push({ row: n, message: 'quantityMilli must be an integer' });
      } else if (kind === DataImportKind.RESOURCES) {
        if (!row.name?.trim() || !row.code?.trim()) errors.push({ row: n, message: 'name and code are required' });
        if (row.type && !Object.values(ResourceType).includes(row.type as ResourceType)) errors.push({ row: n, message: `unsupported resource type ${row.type}` });
      } else if (kind === DataImportKind.MEMBERS && (!row.customerEmail?.trim() || !row.tierCode?.trim())) errors.push({ row: n, message: 'customerEmail and tierCode are required' });
    });
    return errors;
  }

  async previewImport(actor: JwtAccessPayload, dto: ImportPreviewDto) {
    const shopId = requireShopId(actor);
    const rows = parseCsv(dto.csv);
    const errors = this.validateRows(dto.kind, rows);
    const sourceHash = createHash('sha256').update(dto.csv).digest('hex');
    const existing = await this.prisma.dataImportJob.findUnique({ where: { shopId_kind_sourceHash: { shopId, kind: dto.kind, sourceHash } } });
    if (existing) return existing;
    const job = await this.prisma.dataImportJob.create({ data: { shopId, kind: dto.kind, status: errors.length ? DataImportStatus.REJECTED : DataImportStatus.PREVIEW_READY, sourceHash, rowCount: rows.length, rows: rows as Prisma.InputJsonValue, preview: { valid: errors.length === 0, errors: errors.slice(0, 100), rowCount: rows.length, requiredHeaders: requiredHeaders(dto.kind) }, createdById: actor.sub } });
    await this.audit.record(actor, { section: 'system', action: 'data_import.previewed', summary: `Previewed ${dto.kind} import`, meta: { importJobId: job.id, rowCount: rows.length, valid: errors.length === 0, sourceHash } });
    return job;
  }

  async commitImport(actor: JwtAccessPayload, jobId: string) {
    const shopId = requireShopId(actor);
    const initial = await this.prisma.dataImportJob.findFirst({ where: { id: jobId, shopId } });
    if (!initial) throw new NotFoundException('Import job not found');
    return withClientIdempotency(this.prisma, { shopId, scope: IDEM_IMPORT_COMMIT, key: `commit:${jobId}`, requestHash: hashIdempotencyRequest({ jobId, sourceHash: initial.sourceHash }) }, async () => {
      if (initial.status === DataImportStatus.REJECTED) throw new ConflictException('Only a valid preview can be committed');
      const rows = initial.rows as unknown as CsvRow[];
      const committed = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`phase13-import:${jobId}`}))`;
        const job = await tx.dataImportJob.findFirst({ where: { id: jobId, shopId } });
        if (!job) throw new NotFoundException('Import job not found');
        if (job.status === DataImportStatus.COMMITTED) return job;
        if (job.status !== DataImportStatus.PREVIEW_READY) throw new ConflictException('Only a valid preview can be committed');
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          if (job.kind === DataImportKind.PRODUCTS) {
            await tx.menuItem.create({ data: { shopId, name: row.name.trim(), price: new Prisma.Decimal(row.price), sku: row.sku?.trim() || null, barcode: row.barcode?.trim() || null, kind: Object.values(CatalogItemKind).includes(row.kind as CatalogItemKind) ? row.kind as CatalogItemKind : CatalogItemKind.PRODUCT, unit: row.unit?.trim() || 'UNIT', taxCategoryKey: row.taxCategoryKey?.trim() || null } });
          } else if (job.kind === DataImportKind.CUSTOMERS) {
            await tx.customerProfile.create({ data: { shopId, name: row.name.trim(), email: row.email?.trim().toLowerCase() || null, phone: row.phone?.trim() || null, notes: row.notes?.trim() || null } });
          } else if (job.kind === DataImportKind.RESOURCES) {
            await tx.resource.create({ data: { shopId, name: row.name.trim(), code: row.code.trim(), type: Object.values(ResourceType).includes(row.type as ResourceType) ? row.type as ResourceType : ResourceType.OTHER, hourlyRate: new Prisma.Decimal(row.hourlyRate || '0'), configurationState: Object.values(ResourceConfigurationState).includes(row.configurationState as ResourceConfigurationState) ? row.configurationState as ResourceConfigurationState : ResourceConfigurationState.ENABLED } });
          } else if (job.kind === DataImportKind.OPENING_STOCK) {
            const [item, location] = await Promise.all([tx.stockItem.findFirst({ where: { shopId, sku: row.sku.trim() } }), tx.inventoryLocation.findFirst({ where: { shopId, name: row.location.trim(), active: true } })]);
            if (!item || !location) throw new BadRequestException(`Opening stock row ${index + 2} references unknown sku/location`);
            const quantityMilli = Number(row.quantityMilli);
            await tx.stockMovement.create({ data: { shopId, stockItemId: item.id, locationId: location.id, kind: 'OPENING_BALANCE', quantityMilli, unitCostMinor: item.weightedAverageCostMinor, totalCostMinor: Math.trunc((quantityMilli * item.weightedAverageCostMinor) / 1000), referenceType: 'DATA_IMPORT', referenceId: job.id, movementKey: `import:${job.id}:${index}`, note: 'Phase 13 opening stock import', actorUserId: actor.sub } });
          } else {
            const customer = await tx.customerProfile.findFirst({ where: { shopId, email: row.customerEmail.trim().toLowerCase() } });
            const tier = await tx.membershipTier.findFirst({ where: { shopId, code: row.tierCode.trim() } });
            if (!customer || !tier) throw new BadRequestException(`Member row ${index + 2} references unknown customer/tier`);
            await tx.customerMembership.upsert({ where: { shopId_customerId: { shopId, customerId: customer.id } }, create: { shopId, customerId: customer.id, tierId: tier.id, status: row.status?.trim() || 'ACTIVE', expiresAt: row.expiresAt ? new Date(row.expiresAt) : null }, update: { tierId: tier.id, status: row.status?.trim() || 'ACTIVE', expiresAt: row.expiresAt ? new Date(row.expiresAt) : null } });
          }
        }
        return tx.dataImportJob.update({ where: { id: job.id }, data: { status: DataImportStatus.COMMITTED, result: { createdOrApplied: rows.length }, committedById: actor.sub, committedAt: new Date() } });
      });
      await this.audit.record(actor, { section: 'system', action: 'data_import.committed', summary: `Committed ${initial.kind} import`, meta: { importJobId: initial.id, rowCount: rows.length, sourceHash: initial.sourceHash } });
      return committed;
    });
  }

  async exportCsv(actor: JwtAccessPayload, kind: DataImportKind) {
    if (!Object.values(DataImportKind).includes(kind)) throw new BadRequestException('Unsupported export kind');
    const shopId = requireShopId(actor);
    let headers: string[] = [];
    let rows: unknown[][] = [];
    if (kind === DataImportKind.PRODUCTS) {
      headers = ['name', 'price', 'sku', 'barcode', 'kind', 'unit', 'taxCategoryKey'];
      const items = await this.prisma.menuItem.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
      rows = items.map((r) => [r.name, r.price, r.sku, r.barcode, r.kind, r.unit, r.taxCategoryKey]);
    } else if (kind === DataImportKind.CUSTOMERS) {
      headers = ['name', 'email', 'phone', 'notes'];
      const items = await this.prisma.customerProfile.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
      rows = items.map((r) => [r.name, r.email, r.phone, r.notes]);
    } else if (kind === DataImportKind.RESOURCES) {
      headers = ['name', 'code', 'type', 'hourlyRate', 'configurationState'];
      const items = await this.prisma.resource.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
      rows = items.map((r) => [r.name, r.code, r.type, r.hourlyRate, r.configurationState]);
    } else if (kind === DataImportKind.MEMBERS) {
      headers = ['customerEmail', 'tierCode', 'status', 'expiresAt'];
      const [memberships, customers, tiers] = await Promise.all([this.prisma.customerMembership.findMany({ where: { shopId } }), this.prisma.customerProfile.findMany({ where: { shopId } }), this.prisma.membershipTier.findMany({ where: { shopId } })]);
      const customerById = new Map(customers.map((r) => [r.id, r])); const tierById = new Map(tiers.map((r) => [r.id, r]));
      rows = memberships.map((r) => [customerById.get(r.customerId)?.email, tierById.get(r.tierId)?.code, r.status, r.expiresAt?.toISOString()]);
    } else {
      headers = ['sku', 'location', 'quantityMilli'];
      const [movements, items, locations] = await Promise.all([this.prisma.stockMovement.findMany({ where: { shopId, kind: 'OPENING_BALANCE' }, orderBy: { occurredAt: 'asc' } }), this.prisma.stockItem.findMany({ where: { shopId } }), this.prisma.inventoryLocation.findMany({ where: { shopId } })]);
      const itemById = new Map(items.map((r) => [r.id, r])); const locationById = new Map(locations.map((r) => [r.id, r]));
      rows = movements.map((r) => [itemById.get(r.stockItemId)?.sku, locationById.get(r.locationId)?.name, r.quantityMilli]);
    }
    return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  }

  async systemTenants(actor: JwtAccessPayload, query?: string) {
    this.assertSystemAdmin(actor);
    const q = query?.trim();
    const shops = await this.prisma.shop.findMany({ where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : undefined, select: { id: true, name: true, slug: true, createdAt: true, subscription: { select: { tier: true, status: true, packId: true, trialEndsAt: true, currentPeriodEnd: true, staffSeatQuantity: true, billingSubscriptionId: true } }, featureFlags: { select: { feature: true, enabled: true }, orderBy: { feature: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { tenants: shops, supportAccess: { invisibleImpersonation: false, mode: 'diagnostics-only', mutationAuditRequired: true } };
  }

  async systemDiagnostics(actor: JwtAccessPayload, shopId: string) {
    this.assertSystemAdmin(actor);
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true, slug: true, updatedAt: true } });
    if (!shop) throw new NotFoundException('Tenant not found');
    const [memberships, devices, deadJobs, deadWebhooks, importJobs] = await Promise.all([this.prisma.membership.count({ where: { shopId } }), this.prisma.device.count({ where: { shopId } }), this.prisma.integrationJob.count({ where: { shopId, status: 'DEAD' } }), this.prisma.webhookDelivery.count({ where: { shopId, status: 'DEAD' } }), this.prisma.dataImportJob.count({ where: { shopId } })]);
    return { shop, health: deadJobs || deadWebhooks ? 'ATTENTION' : 'HEALTHY', counts: { memberships, devices, deadIntegrationJobs: deadJobs, deadWebhookDeliveries: deadWebhooks, importJobs }, checkedAt: new Date().toISOString() };
  }

  async updateSystemSubscription(actor: JwtAccessPayload, shopId: string, dto: SystemSubscriptionUpdateDto) {
    this.assertSystemAdmin(actor);
    const current = await this.prisma.subscription.findUnique({ where: { shopId } });
    if (!current) throw new NotFoundException('Tenant subscription not found');
    if (current.billingSubscriptionId) throw new ConflictException('Provider-managed subscription changes must use the canonical billing workflow');
    const parseDate = (value: string | null | undefined, label: string) => { if (value === undefined) return undefined; if (value === null || value === '') return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} must be an ISO date`); return date; };
    const updated = await this.prisma.subscription.update({ where: { shopId }, data: { tier: dto.tier, status: dto.status, packId: dto.packId?.trim(), staffSeatQuantity: dto.staffSeatQuantity, trialEndsAt: parseDate(dto.trialEndsAt, 'trialEndsAt'), currentPeriodEnd: parseDate(dto.currentPeriodEnd, 'currentPeriodEnd') } });
    await this.audit.recordForShop(shopId, { section: 'subscription', action: 'system_admin.subscription.updated', summary: 'System admin updated manual subscription entitlement', actorName: actor.email, previousState: { tier: current.tier, status: current.status, packId: current.packId, staffSeatQuantity: current.staffSeatQuantity }, newState: { tier: updated.tier, status: updated.status, packId: updated.packId, staffSeatQuantity: updated.staffSeatQuantity }, reason: 'System admin plan/subscription management' });
    return updated;
  }

  async updateSystemFeatureFlag(actor: JwtAccessPayload, shopId: string, dto: SystemFeatureFlagUpdateDto) {
    this.assertSystemAdmin(actor);
    if (!(FEATURE_KEYS as readonly string[]).includes(dto.key)) throw new BadRequestException('Unknown feature key');
    if (!(await this.prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } }))) throw new NotFoundException('Tenant not found');
    const previous = await this.prisma.shopFeatureFlag.findUnique({ where: { shopId_feature: { shopId, feature: dto.key } } });
    const row = await this.prisma.shopFeatureFlag.upsert({ where: { shopId_feature: { shopId, feature: dto.key } }, create: { shopId, feature: dto.key, enabled: dto.enabled }, update: { enabled: dto.enabled } });
    await this.audit.recordForShop(shopId, { section: 'subscription', action: 'system_admin.feature_flag.updated', summary: `System admin set ${dto.key}=${dto.enabled}`, actorName: actor.email, previousState: { enabled: previous?.enabled ?? null }, newState: { enabled: row.enabled }, reason: 'System admin feature entitlement management' });
    return row;
  }

  async listWebhookDeliveries(actor: JwtAccessPayload, endpointId?: string) {
    const shopId = requireShopId(actor);
    return this.prisma.webhookDelivery.findMany({ where: { shopId, ...(endpointId ? { endpointId } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async rotateWebhookSecret(actor: JwtAccessPayload, endpointId: string, reason?: string) {
    const shopId = requireShopId(actor);
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id: endpointId, shopId } });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');
    const secret = `gsp_whsec_${randomBytes(32).toString('base64url')}`;
    const encrypted = this.secretBox.encrypt({ secret });
    await this.prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { secretCiphertext: encrypted.ciphertext, secretIv: encrypted.iv, secretTag: encrypted.tag, secretKeyVersion: encrypted.keyVersion } });
    await this.audit.record(actor, { section: 'system', action: 'integration.webhook.secret_rotated', summary: `Rotated webhook secret for ${endpoint.name}`, reason: reason?.trim() || 'Credential rotation', meta: { endpointId: endpoint.id } });
    return { endpointId: endpoint.id, secret };
  }

  async replayWebhookDelivery(actor: JwtAccessPayload, deliveryId: string) {
    const shopId = requireShopId(actor);
    const delivery = await this.prisma.webhookDelivery.findFirst({ where: { id: deliveryId, shopId } });
    if (!delivery) throw new NotFoundException('Webhook delivery not found');
    if (delivery.status === 'SUCCEEDED') throw new ConflictException('Successful delivery cannot be replayed');
    const updated = await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'PENDING', attemptCount: 0, nextAttemptAt: new Date(), lastError: null, lastStatusCode: null, deliveredAt: null } });
    await this.audit.record(actor, { section: 'system', action: 'integration.webhook.delivery_replayed', summary: `Replayed webhook delivery ${delivery.id}`, meta: { endpointId: delivery.endpointId, eventId: delivery.eventId, eventType: delivery.eventType } });
    return updated;
  }
}
