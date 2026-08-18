import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashIdempotencyRequest } from '../../common/idempotency.util';
import { hmacOpaque } from '../../common/platform-security.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { Phase9CustomerValueService } from '../growth/phase9-customer-value.service';
import type {
  AccessScanDto,
  AssignLockerDto,
  BindAccessCredentialDto,
  ConfigureAccessScannerDto,
  CreateAccessRuleDto,
  CreateAccessZoneDto,
  CreateLockerDto,
  CreateTicketProductDto,
  IssueTicketOrderDto,
  LockerEventDto,
  OccupancyCorrectionDto,
  ReleaseLockerDto,
  StoredValueCredentialDto,
  TicketMutationDto,
} from './dto/ticketing.dto';

type Tx = Prisma.TransactionClient;

type AccessContext = {
  ticket: { id: string; productId: string; status: string; scansUsed: number; maxScans: number; version: number } | null;
  membershipTierId: string | null;
};

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002',
  );
}

@Injectable()
export class TicketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly customerValue: Phase9CustomerValueService,
  ) {}

  private shopId(actor: JwtAccessPayload): string {
    if (!actor.shopId) throw new BadRequestException('Venue context is required.');
    return actor.shopId;
  }

  private secret(): string {
    const secret =
      this.config.get<string>('OPAQUE_IDENTIFIER_SECRET')?.trim() ||
      this.config.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException('Opaque identifier hashing is not configured.');
    }
    return secret;
  }

  private opaque(value: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException('Credential token is required.');
    return hmacOpaque(normalized, this.secret());
  }

  private rawTicketToken(): string {
    return `gst_${randomBytes(24).toString('base64url')}`;
  }

  private async eventOutbox(
    tx: Tx,
    shopId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    correlationId: string | null,
    payload: Record<string, unknown>,
  ) {
    await tx.domainEventOutbox.create({
      data: {
        shopId,
        aggregateType,
        aggregateId,
        eventType,
        correlationId,
        payload: { schemaVersion: 1, ...payload } as Prisma.InputJsonValue,
      },
    });
  }

  private async occupancyTx(tx: Tx, shopId: string, zoneId: string): Promise<number> {
    const result = await tx.accessEvent.aggregate({
      where: { shopId, zoneId, decision: 'ALLOWED' },
      _sum: { occupancyDelta: true },
    });
    return result._sum.occupancyDelta ?? 0;
  }

  async overview(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [products, zones, activeCredentials, scanners, lockers, legacyWalletRows, events] =
      await Promise.all([
        this.prisma.ticketProduct.findMany({ where: { shopId }, orderBy: { updatedAt: 'desc' }, take: 100 }),
        this.prisma.accessZone.findMany({ where: { shopId }, orderBy: { name: 'asc' } }),
        this.prisma.accessCredential.count({ where: { shopId, status: 'ACTIVE' } }),
        this.prisma.accessScannerConfiguration.count({ where: { shopId } }),
        this.prisma.locker.findMany({ where: { shopId }, orderBy: { code: 'asc' } }),
        this.prisma.rfidWallet.count({ where: { shopId } }),
        this.prisma.accessEvent.count({ where: { shopId } }),
      ]);
    const occupancy = await Promise.all(
      zones.map(async (zone) => ({ zoneId: zone.id, count: await this.occupancy(zone.id, actor) })),
    );
    return {
      products,
      zones,
      occupancy,
      activeCredentials,
      configuredScanners: scanners,
      lockers,
      accessEvents: events,
      legacyWalletRows,
      financialAuthority: 'STORED_VALUE_LEDGER',
    };
  }

  async createProduct(actor: JwtAccessPayload, dto: CreateTicketProductDto) {
    const shopId = this.shopId(actor);
    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: dto.menuItemId, shopId },
    });
    if (!menuItem) throw new NotFoundException('Canonical menu item not found for this venue.');
    const priceMinor = menuItem.price.mul(100).toDecimalPlaces(0).toNumber();
    const row = await this.prisma.ticketProduct.create({
      data: {
        shopId,
        name: dto.name.trim(),
        sku: dto.sku?.trim() || null,
        menuItemId: menuItem.id,
        priceMinor,
        currency: 'EUR',
        validityMinutes: dto.validityMinutes ?? null,
        maxScans: dto.maxScans ?? 1,
        active: dto.active ?? true,
      },
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'access.ticket-product.create',
      summary: 'Created access ticket product linked to canonical commerce',
      meta: { productId: row.id, menuItemId: menuItem.id },
    });
    return row;
  }

  async issueOrder(actor: JwtAccessPayload, dto: IssueTicketOrderDto) {
    const shopId = this.shopId(actor);
    const requestHash = hashIdempotencyRequest(dto);
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: dto.settlementId, shopId, state: { in: ['PAID', 'CLOSED'] } },
      include: { snapshots: true },
    });
    if (!settlement) {
      throw new ConflictException('Tickets can only be fulfilled from a paid canonical settlement in this venue.');
    }

    const references = settlement.snapshots
      .filter((snapshot) => snapshot.sourceType === 'SHOP_ORDER' && snapshot.lineReference)
      .map((snapshot) => snapshot.lineReference as string);
    if (!references.length) throw new ConflictException('Paid settlement contains no ticket-eligible commercial lines.');

    const commercialLines = await this.prisma.shopOrderLine.findMany({
      where: { id: { in: references }, shopOrder: { shopId } },
      select: { id: true, menuItemId: true },
    });
    const menuItemByLine = new Map(commercialLines.map((line) => [line.id, line.menuItemId]));
    const menuItemIds = [...new Set(commercialLines.map((line) => line.menuItemId).filter((id): id is string => Boolean(id)))];
    const products = await this.prisma.ticketProduct.findMany({
      where: { shopId, active: true, menuItemId: { in: menuItemIds } },
    });
    const productByMenuItem = new Map(products.map((product) => [product.menuItemId as string, product]));
    const eligible = settlement.snapshots.flatMap((snapshot) => {
      if (snapshot.sourceType !== 'SHOP_ORDER' || !snapshot.lineReference) return [];
      const menuItemId = menuItemByLine.get(snapshot.lineReference);
      const product = menuItemId ? productByMenuItem.get(menuItemId) : undefined;
      return product ? [{ snapshot, product }] : [];
    });
    if (!eligible.length) throw new ConflictException('Paid settlement has no active ticket products to fulfill.');

    let rawTokens: string[] = [];
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ticket-fulfillment:${shopId}:${settlement.id}`}))`;
        const existing = await tx.ticketOrder.findFirst({ where: { shopId, settlementId: settlement.id } });
        if (existing) {
          if (existing.requestHash && existing.requestHash !== requestHash) {
            throw new ConflictException('Settlement was already fulfilled by a different ticket request.');
          }
          return {
            order: existing,
            tickets: await tx.ticket.findMany({ where: { shopId, orderId: existing.id }, orderBy: { issuedAt: 'asc' } }),
            replayed: true,
          };
        }

        const order = await tx.ticketOrder.create({
          data: {
            shopId,
            idempotencyKey: dto.idempotencyKey,
            status: 'FULFILLED',
            totalMinor: null,
            currency: settlement.currency,
            settlementId: settlement.id,
            guestCheckId: settlement.guestCheckId,
            requestHash,
            fulfilledAt: new Date(),
          },
        });

        const tickets = [];
        for (const { snapshot, product } of eligible) {
          for (let index = 0; index < snapshot.quantity; index += 1) {
            const raw = this.rawTicketToken();
            const tokenHash = this.opaque(raw);
            const expiresAt = product.validityMinutes
              ? new Date(Date.now() + product.validityMinutes * 60_000)
              : null;
            const ticket = await tx.ticket.create({
              data: {
                shopId,
                orderId: order.id,
                productId: product.id,
                tokenHash,
                status: 'ISSUED',
                maxScans: product.maxScans,
                expiresAt,
                sourceSnapshotId: snapshot.id,
                sourceOrderLineId: snapshot.lineReference,
              },
            });
            await tx.accessCredential.create({
              data: {
                shopId,
                type: 'QR_TICKET',
                tokenHash,
                ticketId: ticket.id,
                visitLimit: product.maxScans,
                expiresAt,
              },
            });
            rawTokens.push(raw);
            tickets.push(ticket);
          }
        }
        await this.eventOutbox(tx, shopId, 'TicketOrder', order.id, 'ticket.fulfilled.v1', dto.idempotencyKey, {
          settlementId: settlement.id,
          guestCheckId: settlement.guestCheckId,
          ticketCount: tickets.length,
        });
        return { order, tickets, replayed: false };
      });
      await this.audit.record(actor, {
        section: 'operations',
        action: 'access.ticket.fulfill',
        summary: 'Fulfilled admission tickets from a paid canonical settlement',
        correlationId: dto.idempotencyKey,
        meta: { settlementId: settlement.id, orderId: result.order.id, ticketCount: result.tickets.length },
      });
      return { ...result, rawTokens: result.replayed ? [] : rawTokens };
    } catch (error) {
      rawTokens = [];
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.ticketOrder.findFirst({ where: { shopId, settlementId: settlement.id } });
        if (existing) {
          return {
            order: existing,
            tickets: await this.prisma.ticket.findMany({ where: { shopId, orderId: existing.id } }),
            replayed: true,
            rawTokens: [],
          };
        }
      }
      throw error;
    }
  }

  async cancelTicket(actor: JwtAccessPayload, ticketId: string, dto: TicketMutationDto) {
    const shopId = this.shopId(actor);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ticket:${shopId}:${ticketId}`}))`;
      const ticket = await tx.ticket.findFirst({ where: { id: ticketId, shopId } });
      if (!ticket) throw new NotFoundException('Ticket not found.');
      if (dto.expectedVersion && dto.expectedVersion !== ticket.version) throw new ConflictException('Ticket version conflict.');
      if (ticket.status === 'REDEEMED') throw new ConflictException('Redeemed ticket cannot be cancelled; use the financial correction workflow if required.');
      if (ticket.status === 'VOIDED') return ticket;
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: 'VOIDED', voidedAt: new Date(), cancelReason: dto.reason.trim(), version: { increment: 1 } },
      });
      await tx.accessCredential.updateMany({
        where: { shopId, ticketId: ticket.id },
        data: { status: 'REVOKED', version: { increment: 1 } },
      });
      await this.eventOutbox(tx, shopId, 'Ticket', ticket.id, 'ticket.cancelled.v1', dto.idempotencyKey, { reason: dto.reason });
      return updated;
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'access.ticket.cancel',
      summary: 'Cancelled access ticket',
      correlationId: dto.idempotencyKey,
      reason: dto.reason,
      meta: { ticketId },
    });
    return result;
  }

  async reissueTicket(actor: JwtAccessPayload, ticketId: string, dto: TicketMutationDto) {
    const shopId = this.shopId(actor);
    let rawToken: string | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ticket:${shopId}:${ticketId}`}))`;
      const original = await tx.ticket.findFirst({ where: { id: ticketId, shopId } });
      if (!original) throw new NotFoundException('Ticket not found.');
      if (dto.expectedVersion && dto.expectedVersion !== original.version) throw new ConflictException('Ticket version conflict.');
      if (original.status === 'REDEEMED') throw new ConflictException('Redeemed ticket cannot be reissued.');
      const existing = await tx.ticket.findFirst({ where: { shopId, reissuedFromId: original.id }, orderBy: { issuedAt: 'desc' } });
      if (original.status === 'VOIDED' && existing) return { original, ticket: existing, replayed: true };

      rawToken = this.rawTicketToken();
      const tokenHash = this.opaque(rawToken);
      await tx.ticket.update({
        where: { id: original.id },
        data: { status: 'VOIDED', voidedAt: new Date(), cancelReason: `REISSUED: ${dto.reason.trim()}`, version: { increment: 1 } },
      });
      await tx.accessCredential.updateMany({ where: { shopId, ticketId: original.id }, data: { status: 'REVOKED', version: { increment: 1 } } });
      const ticket = await tx.ticket.create({
        data: {
          shopId,
          orderId: original.orderId,
          productId: original.productId,
          tokenHash,
          status: 'ISSUED',
          maxScans: original.maxScans,
          expiresAt: original.expiresAt,
          sourceSnapshotId: original.sourceSnapshotId,
          sourceOrderLineId: original.sourceOrderLineId,
          reissuedFromId: original.id,
        },
      });
      await tx.accessCredential.create({
        data: { shopId, type: 'QR_TICKET', tokenHash, ticketId: ticket.id, visitLimit: ticket.maxScans, expiresAt: ticket.expiresAt },
      });
      await this.eventOutbox(tx, shopId, 'Ticket', ticket.id, 'ticket.reissued.v1', dto.idempotencyKey, { originalTicketId: original.id, reason: dto.reason });
      return { original, ticket, replayed: false };
    });
    await this.audit.record(actor, {
      section: 'operations',
      action: 'access.ticket.reissue',
      summary: 'Reissued access ticket and revoked previous credential',
      correlationId: dto.idempotencyKey,
      reason: dto.reason,
      meta: { originalTicketId: ticketId, replacementTicketId: result.ticket.id },
    });
    return { ...result, rawToken: result.replayed ? null : rawToken };
  }

  async createZone(actor: JwtAccessPayload, dto: CreateAccessZoneDto) {
    const shopId = this.shopId(actor);
    const row = await this.prisma.accessZone.create({
      data: { shopId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), zoneType: dto.zoneType?.trim() || null, capacity: dto.capacity ?? null },
    });
    await this.audit.record(actor, {
      section: 'operations', action: 'access.zone.create', summary: 'Created access zone', meta: { zoneId: row.id, capacity: row.capacity },
    });
    return row;
  }

  async createRule(actor: JwtAccessPayload, zoneId: string, dto: CreateAccessRuleDto) {
    const shopId = this.shopId(actor);
    const zone = await this.prisma.accessZone.findFirst({ where: { id: zoneId, shopId, active: true } });
    if (!zone) throw new NotFoundException('Access zone not found.');
    if (dto.ticketProductId) {
      const product = await this.prisma.ticketProduct.findFirst({ where: { id: dto.ticketProductId, shopId } });
      if (!product) throw new NotFoundException('Ticket product not found in this venue.');
    }
    if (dto.membershipTierId) {
      const tier = await this.prisma.membershipTier.findFirst({ where: { id: dto.membershipTierId, shopId, active: true } });
      if (!tier) throw new NotFoundException('Membership tier not found in this venue.');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) throw new BadRequestException('Invalid access-rule date.');
    if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('Access-rule end must be after start.');
    const rule = await this.prisma.accessRule.create({
      data: {
        shopId, zoneId, name: dto.name.trim(), priority: dto.priority ?? 100, effect: dto.effect ?? 'ALLOW',
        ticketProductId: dto.ticketProductId ?? null, membershipTierId: dto.membershipTierId ?? null,
        startsAt, endsAt, maxVisits: dto.maxVisits ?? null,
      },
    });
    await this.audit.record(actor, {
      section: 'operations', action: 'access.rule.create', summary: 'Created access rule', meta: { ruleId: rule.id, zoneId },
    });
    return rule;
  }

  async configureScanner(actor: JwtAccessPayload, deviceId: string, dto: ConfigureAccessScannerDto) {
    const shopId = this.shopId(actor);
    const [device, zone, existing] = await Promise.all([
      this.prisma.device.findFirst({ where: { id: deviceId, shopId, type: 'ACCESS_SCANNER', status: 'ACTIVE' } }),
      this.prisma.accessZone.findFirst({ where: { id: dto.zoneId, shopId, active: true } }),
      this.prisma.accessScannerConfiguration.findFirst({ where: { shopId, deviceId } }),
    ]);
    if (!device) throw new NotFoundException('Active ACCESS_SCANNER device not found in this venue.');
    if (!zone) throw new NotFoundException('Access zone not found in this venue.');
    if (existing && dto.expectedVersion && dto.expectedVersion !== existing.version) throw new ConflictException('Scanner configuration version conflict.');
    const config = await this.prisma.accessScannerConfiguration.upsert({
      where: { shopId_deviceId: { shopId, deviceId } },
      create: {
        shopId, deviceId, zoneId: zone.id, allowOfflineCache: dto.allowOfflineCache ?? false,
        offlineCacheTtlSeconds: dto.offlineCacheTtlSeconds ?? null, enforceSequence: dto.enforceSequence ?? true,
      },
      update: {
        zoneId: zone.id, allowOfflineCache: dto.allowOfflineCache, offlineCacheTtlSeconds: dto.offlineCacheTtlSeconds,
        enforceSequence: dto.enforceSequence, version: { increment: 1 },
      },
    });
    await this.audit.record(actor, {
      section: 'operations', action: 'access.scanner.configure', summary: 'Configured access scanner', sourceDevice: deviceId,
      meta: { deviceId, zoneId: zone.id, allowOfflineCache: config.allowOfflineCache, enforceSequence: config.enforceSequence },
    });
    return config;
  }

  async bindCredential(actor: JwtAccessPayload, dto: BindAccessCredentialDto) {
    const shopId = this.shopId(actor);
    if (!dto.customerId && !dto.membershipId && !dto.storedValueAccountId) {
      throw new BadRequestException('Credential must be traceable to a customer, membership, or canonical stored-value account.');
    }
    if (dto.customerId) {
      const customer = await this.prisma.customerProfile.findFirst({ where: { id: dto.customerId, shopId } });
      if (!customer) throw new NotFoundException('Customer not found in this venue.');
    }
    let membership: { id: string; customerId: string; expiresAt: Date | null; status: string } | null = null;
    if (dto.membershipId) {
      membership = await this.prisma.customerMembership.findFirst({ where: { id: dto.membershipId, shopId } });
      if (!membership) throw new NotFoundException('Membership not found in this venue.');
      if (membership.status !== 'ACTIVE' || (membership.expiresAt && membership.expiresAt <= new Date())) throw new ConflictException('Membership is not active.');
    }
    if (dto.storedValueAccountId) {
      const account = await this.prisma.storedValueAccount.findFirst({ where: { id: dto.storedValueAccountId, shopId, status: 'ACTIVE' } });
      if (!account) throw new NotFoundException('Canonical stored-value account not found in this venue.');
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : membership?.expiresAt ?? null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) throw new BadRequestException('Credential expiry must be a valid future time.');
    const tokenHash = this.opaque(dto.token);
    const credential = await this.prisma.accessCredential.create({
      data: {
        shopId, type: dto.type, tokenHash, label: dto.label?.trim() || null,
        customerId: dto.customerId ?? membership?.customerId ?? null, membershipId: dto.membershipId ?? null,
        storedValueAccountId: dto.storedValueAccountId ?? null, visitLimit: dto.visitLimit ?? null, expiresAt,
      },
    });
    await this.audit.record(actor, {
      section: 'operations', action: 'access.credential.bind', summary: 'Bound access credential to canonical entitlement',
      meta: { credentialId: credential.id, type: credential.type, customerId: credential.customerId, membershipId: credential.membershipId, storedValueAccountId: credential.storedValueAccountId },
    });
    return credential;
  }

  async storedValueCredential(actor: JwtAccessPayload, dto: StoredValueCredentialDto) {
    const shopId = this.shopId(actor);
    const credential = await this.prisma.accessCredential.findFirst({
      where: { shopId, tokenHash: this.opaque(dto.token), status: 'ACTIVE' },
    });
    if (!credential?.storedValueAccountId) throw new NotFoundException('Credential has no canonical stored-value account.');
    const account = await this.prisma.storedValueAccount.findFirst({ where: { id: credential.storedValueAccountId, shopId, status: 'ACTIVE' } });
    if (!account) throw new NotFoundException('Canonical stored-value account is unavailable.');
    if (dto.action === 'BALANCE') {
      const aggregate = await this.prisma.storedValueLedgerEntry.aggregate({
        where: { shopId, accountId: account.id }, _sum: { amountMinor: true },
      });
      return { credentialId: credential.id, accountId: account.id, currency: account.currency, balanceMinor: aggregate._sum.amountMinor ?? 0 };
    }
    if (!dto.amountMinor) throw new BadRequestException('amountMinor is required for stored-value mutation.');
    if (dto.action === 'LOAD' && !dto.paymentId) throw new ConflictException('Stored-value load requires a successful canonical payment.');
    return this.customerValue.storedValue(actor, account.id, {
      type: dto.action === 'LOAD' ? 'LOAD' : 'REDEEM',
      amountMinor: dto.amountMinor,
      correlationId: dto.idempotencyKey,
      sourceType: 'ACCESS_CREDENTIAL',
      sourceId: credential.id,
      paymentId: dto.paymentId,
      note: dto.note,
    });
  }

  private async accessContextTx(tx: Tx, shopId: string, credential: { ticketId: string | null; membershipId: string | null }): Promise<AccessContext> {
    const ticket = credential.ticketId
      ? await tx.ticket.findFirst({ where: { id: credential.ticketId, shopId }, select: { id: true, productId: true, status: true, scansUsed: true, maxScans: true, version: true } })
      : null;
    const membership = credential.membershipId
      ? await tx.customerMembership.findFirst({ where: { id: credential.membershipId, shopId }, select: { tierId: true, status: true, expiresAt: true } })
      : null;
    const membershipTierId = membership && membership.status === 'ACTIVE' && (!membership.expiresAt || membership.expiresAt > new Date()) ? membership.tierId : null;
    return { ticket, membershipTierId };
  }

  private async ruleDecisionTx(
    tx: Tx,
    shopId: string,
    zoneId: string,
    credential: { visitsUsed: number },
    context: AccessContext,
    now: Date,
  ): Promise<{ allowed: boolean; reason: string }> {
    const rules = await tx.accessRule.findMany({ where: { shopId, zoneId, active: true }, orderBy: { priority: 'asc' } });
    if (!rules.length) return { allowed: true, reason: 'NO_RULE_RESTRICTION' };
    for (const rule of rules) {
      if (rule.startsAt && now < rule.startsAt) continue;
      if (rule.endsAt && now >= rule.endsAt) continue;
      if (rule.ticketProductId && context.ticket?.productId !== rule.ticketProductId) continue;
      if (rule.membershipTierId && context.membershipTierId !== rule.membershipTierId) continue;
      if (rule.maxVisits && credential.visitsUsed >= rule.maxVisits) return { allowed: false, reason: 'RULE_VISIT_LIMIT' };
      return { allowed: rule.effect === 'ALLOW', reason: rule.effect === 'ALLOW' ? 'RULE_ALLOW' : 'RULE_DENY' };
    }
    return { allowed: false, reason: 'NO_MATCHING_RULE' };
  }

  async scanAccess(actor: JwtAccessPayload, dto: AccessScanDto) {
    const shopId = this.shopId(actor);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('Invalid occurredAt.');
    const tokenHash = this.opaque(dto.token);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-zone:${shopId}:${dto.zoneId}`}))`;
      const zone = await tx.accessZone.findFirst({ where: { id: dto.zoneId, shopId, active: true } });
      if (!zone) throw new NotFoundException('Access zone not found.');

      let scanner: Awaited<ReturnType<typeof tx.accessScannerConfiguration.findFirst>> = null;
      if (dto.scannerDeviceId) {
        const device = await tx.device.findFirst({ where: { id: dto.scannerDeviceId, shopId, type: 'ACCESS_SCANNER', status: 'ACTIVE' } });
        if (!device) throw new NotFoundException('Active access scanner not found in this venue.');
        scanner = await tx.accessScannerConfiguration.findFirst({ where: { shopId, deviceId: dto.scannerDeviceId } });
        if (!scanner || scanner.zoneId !== zone.id) throw new ConflictException('Scanner is not assigned to this access zone.');
        if (dto.offlineReplay && !scanner.allowOfflineCache) throw new ConflictException('Offline credential replay is disabled for this scanner.');
        if (scanner.enforceSequence) {
          if (dto.deviceSequence == null) throw new BadRequestException('deviceSequence is required for this scanner.');
          const used = await tx.accessEvent.findFirst({ where: { shopId, deviceId: dto.scannerDeviceId, deviceSequence: dto.deviceSequence } });
          if (used) {
            if (used.idempotencyKey === dto.idempotencyKey) return { event: used, replayed: true };
            throw new ConflictException('Scanner sequence has already been consumed.');
          }
          if (scanner.lastSequence != null && dto.deviceSequence <= scanner.lastSequence) throw new ConflictException('Stale scanner sequence.');
        }
      }

      const credential = await tx.accessCredential.findFirst({ where: { shopId, tokenHash } });
      if (credential) {
        await tx.$queryRaw`SELECT "id" FROM "AccessCredential" WHERE "id" = ${credential.id} FOR UPDATE`;
      }
      const refreshed = credential ? await tx.accessCredential.findUnique({ where: { id: credential.id } }) : null;
      const currentOccupancy = await this.occupancyTx(tx, shopId, zone.id);
      let decision: 'ALLOWED' | 'DENIED' | 'DUPLICATE' = 'DENIED';
      let reasonCode = 'UNKNOWN_CREDENTIAL';
      let occupancyDelta = 0;
      let context: AccessContext = { ticket: null, membershipTierId: null };

      if (refreshed) {
        context = await this.accessContextTx(tx, shopId, refreshed);
        const expired = refreshed.expiresAt && refreshed.expiresAt <= occurredAt;
        const ticketBlocked = context.ticket && dto.direction !== 'EXIT' && !['ISSUED', 'ACTIVE'].includes(context.ticket.status);
        if (refreshed.status !== 'ACTIVE') reasonCode = `CREDENTIAL_${refreshed.status}`;
        else if (expired) reasonCode = 'CREDENTIAL_EXPIRED';
        else if (ticketBlocked) reasonCode = `TICKET_${context.ticket?.status ?? 'INVALID'}`;
        else if (context.ticket && dto.direction !== 'EXIT' && context.ticket.scansUsed >= context.ticket.maxScans) reasonCode = 'TICKET_VISIT_LIMIT';
        else {
          const rule = await this.ruleDecisionTx(tx, shopId, zone.id, refreshed, context, occurredAt);
          if (!rule.allowed) reasonCode = rule.reason;
          else {
            const presence = await tx.accessEvent.aggregate({
              where: { shopId, zoneId: zone.id, credentialId: refreshed.id, decision: 'ALLOWED' },
              _sum: { occupancyDelta: true },
            });
            const inside = (presence._sum.occupancyDelta ?? 0) > 0;
            if (dto.direction === 'ENTER' && inside) {
              decision = 'DUPLICATE'; reasonCode = 'ALREADY_INSIDE';
            } else if (dto.direction === 'EXIT' && !inside) {
              decision = 'DUPLICATE'; reasonCode = 'NOT_INSIDE';
            } else if (dto.direction === 'ENTER' && zone.capacity != null && currentOccupancy >= zone.capacity) {
              decision = 'DENIED'; reasonCode = 'CAPACITY_EXCEEDED';
            } else {
              decision = 'ALLOWED'; reasonCode = rule.reason;
              occupancyDelta = dto.direction === 'ENTER' ? 1 : dto.direction === 'EXIT' ? -1 : 0;
            }
          }
        }
      }

      const event = await tx.accessEvent.create({
        data: {
          shopId, zoneId: zone.id, credentialId: refreshed?.id ?? null, ticketId: context.ticket?.id ?? null,
          deviceId: dto.scannerDeviceId ?? null, direction: dto.direction, decision, reasonCode, occupancyDelta,
          deviceSequence: dto.deviceSequence ?? null, offlineReplay: dto.offlineReplay ?? false,
          idempotencyKey: dto.idempotencyKey, actorUserId: actor.sub, occurredAt,
        },
      });

      if (decision === 'ALLOWED' && refreshed) {
        await tx.accessCredential.update({
          where: { id: refreshed.id },
          data: {
            lastSeenAt: occurredAt,
            visitsUsed: dto.direction === 'ENTER' ? { increment: 1 } : undefined,
            version: { increment: 1 },
          },
        });
        if (context.ticket && dto.direction === 'ENTER') {
          const nextScans = context.ticket.scansUsed + 1;
          await tx.ticket.update({
            where: { id: context.ticket.id },
            data: {
              scansUsed: nextScans,
              lastScannedAt: occurredAt,
              redeemedAt: nextScans >= context.ticket.maxScans ? occurredAt : null,
              status: nextScans >= context.ticket.maxScans ? 'REDEEMED' : 'ACTIVE',
              version: { increment: 1 },
            },
          });
        }
      }
      if (scanner && dto.scannerDeviceId) {
        await tx.accessScannerConfiguration.update({
          where: { id: scanner.id },
          data: { lastSequence: dto.deviceSequence ?? scanner.lastSequence, version: { increment: 1 } },
        });
        await tx.device.update({ where: { id: dto.scannerDeviceId }, data: { lastSeenAt: new Date() } });
      }
      await this.eventOutbox(tx, shopId, 'AccessEvent', event.id, `access.${decision.toLowerCase()}.v1`, dto.idempotencyKey, {
        zoneId: zone.id, credentialId: refreshed?.id ?? null, ticketId: context.ticket?.id ?? null,
        direction: dto.direction, reasonCode, occupancyDelta, offlineReplay: dto.offlineReplay ?? false,
      });
      return { event, replayed: false, occupancy: currentOccupancy + occupancyDelta };
    });
  }

  async occupancy(zoneId: string, actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const zone = await this.prisma.accessZone.findFirst({ where: { id: zoneId, shopId } });
    if (!zone) throw new NotFoundException('Access zone not found.');
    const result = await this.prisma.accessEvent.aggregate({ where: { shopId, zoneId, decision: 'ALLOWED' }, _sum: { occupancyDelta: true } });
    return result._sum.occupancyDelta ?? 0;
  }

  async correctOccupancy(actor: JwtAccessPayload, zoneId: string, dto: OccupancyCorrectionDto) {
    const shopId = this.shopId(actor);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-zone:${shopId}:${zoneId}`}))`;
      const zone = await tx.accessZone.findFirst({ where: { id: zoneId, shopId } });
      if (!zone) throw new NotFoundException('Access zone not found.');
      if (zone.capacity != null && dto.targetOccupancy > zone.capacity) throw new ConflictException('Corrected occupancy cannot exceed configured zone capacity.');
      const current = await this.occupancyTx(tx, shopId, zoneId);
      const delta = dto.targetOccupancy - current;
      const event = await tx.accessEvent.create({
        data: {
          shopId, zoneId, direction: 'CORRECTION', decision: 'ALLOWED', reasonCode: 'MANUAL_CORRECTION', occupancyDelta: delta,
          idempotencyKey: dto.idempotencyKey, actorUserId: actor.sub, metadataJson: JSON.stringify({ reason: dto.reason, previousOccupancy: current, targetOccupancy: dto.targetOccupancy }),
        },
      });
      await this.eventOutbox(tx, shopId, 'AccessEvent', event.id, 'access.occupancy-corrected.v1', dto.idempotencyKey, { zoneId, previousOccupancy: current, targetOccupancy: dto.targetOccupancy, reason: dto.reason });
      return { event, previousOccupancy: current, occupancy: dto.targetOccupancy };
    });
    await this.audit.record(actor, {
      section: 'operations', action: 'access.occupancy.correct', summary: 'Corrected derived zone occupancy', correlationId: dto.idempotencyKey,
      reason: dto.reason, previousState: { occupancy: result.previousOccupancy }, newState: { occupancy: result.occupancy }, meta: { zoneId },
    });
    return result;
  }

  async createLocker(actor: JwtAccessPayload, dto: CreateLockerDto) {
    const shopId = this.shopId(actor);
    const requiredItems = [dto.rentalMenuItemId, dto.depositMenuItemId].filter((id): id is string => Boolean(id));
    if (requiredItems.length) {
      const count = await this.prisma.menuItem.count({ where: { shopId, id: { in: requiredItems } } });
      if (count !== new Set(requiredItems).size) throw new NotFoundException('Locker rental/deposit menu item not found in this venue.');
    }
    const locker = await this.prisma.locker.create({
      data: { shopId, code: dto.code.trim().toUpperCase(), sizeType: dto.sizeType?.trim() || null, rentalMenuItemId: dto.rentalMenuItemId ?? null, depositMenuItemId: dto.depositMenuItemId ?? null },
    });
    await this.audit.record(actor, { section: 'operations', action: 'access.locker.create', summary: 'Created locker', meta: { lockerId: locker.id, code: locker.code } });
    return locker;
  }

  private async settlementContainsItems(shopId: string, settlementId: string, requiredMenuItems: string[]) {
    const settlement = await this.prisma.checkSettlement.findFirst({
      where: { id: settlementId, shopId, state: { in: ['PAID', 'CLOSED'] } }, include: { snapshots: true },
    });
    if (!settlement) return false;
    const refs = settlement.snapshots.filter((s) => s.sourceType === 'SHOP_ORDER' && s.lineReference).map((s) => s.lineReference as string);
    const lines = await this.prisma.shopOrderLine.findMany({ where: { id: { in: refs }, shopOrder: { shopId } }, select: { menuItemId: true } });
    const present = new Set(lines.map((line) => line.menuItemId).filter((id): id is string => Boolean(id)));
    return requiredMenuItems.every((id) => present.has(id));
  }

  async assignLocker(actor: JwtAccessPayload, lockerId: string, dto: AssignLockerDto) {
    const shopId = this.shopId(actor);
    const locker = await this.prisma.locker.findFirst({ where: { id: lockerId, shopId } });
    if (!locker) throw new NotFoundException('Locker not found.');
    if (locker.availability !== 'AVAILABLE') throw new ConflictException('Locker is not available for assignment.');
    const credential = await this.prisma.accessCredential.findFirst({ where: { id: dto.credentialId, shopId, status: 'ACTIVE' } });
    if (!credential) throw new NotFoundException('Active access credential not found in this venue.');
    const requiredItems = [locker.rentalMenuItemId, locker.depositMenuItemId].filter((id): id is string => Boolean(id));
    if (requiredItems.length) {
      if (!dto.settlementId) throw new ConflictException('Paid canonical settlement is required for configured locker rental/deposit products.');
      if (!(await this.settlementContainsItems(shopId, dto.settlementId, requiredItems))) throw new ConflictException('Paid settlement does not contain all configured locker rental/deposit products.');
    }
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`locker:${shopId}:${lockerId}`}))`;
        const active = await tx.lockerAssignment.findFirst({ where: { shopId, lockerId, status: 'ACTIVE' } });
        if (active) throw new ConflictException('Locker is already assigned.');
        const assignment = await tx.lockerAssignment.create({
          data: {
            shopId, lockerId, credentialId: credential.id, customerId: dto.customerId ?? credential.customerId,
            ticketId: dto.ticketId ?? credential.ticketId, settlementId: dto.settlementId ?? null,
          },
        });
        const event = await tx.lockerEvent.create({
          data: { shopId, lockerId, assignmentId: assignment.id, credentialId: credential.id, type: 'ASSIGNED', idempotencyKey: dto.idempotencyKey, actorUserId: actor.sub },
        });
        await this.eventOutbox(tx, shopId, 'LockerAssignment', assignment.id, 'locker.assigned.v1', dto.idempotencyKey, { lockerId, credentialId: credential.id, settlementId: dto.settlementId ?? null });
        return { assignment, event };
      });
      await this.audit.record(actor, { section: 'operations', action: 'access.locker.assign', summary: 'Assigned locker', correlationId: dto.idempotencyKey, meta: { lockerId, assignmentId: result.assignment.id, credentialId: credential.id } });
      return result;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException('Locker or credential already has an active assignment.');
      throw error;
    }
  }

  async recordLockerEvent(actor: JwtAccessPayload, lockerId: string, dto: LockerEventDto) {
    const shopId = this.shopId(actor);
    if (dto.type === 'MANUAL_OVERRIDE' && !dto.reason?.trim()) throw new BadRequestException('Manual locker override requires a reason.');
    const locker = await this.prisma.locker.findFirst({ where: { id: lockerId, shopId } });
    if (!locker) throw new NotFoundException('Locker not found.');
    if (dto.deviceId) {
      const device = await this.prisma.device.findFirst({ where: { id: dto.deviceId, shopId, status: 'ACTIVE' } });
      if (!device) throw new NotFoundException('Locker device not found in this venue.');
    }
    const assignment = await this.prisma.lockerAssignment.findFirst({ where: { shopId, lockerId, status: 'ACTIVE' } });
    if (!assignment && dto.type !== 'MANUAL_OVERRIDE') throw new ConflictException('Locker has no active assignment.');
    const event = await this.prisma.lockerEvent.create({
      data: {
        shopId, lockerId, assignmentId: assignment?.id ?? null, credentialId: assignment?.credentialId ?? null,
        type: dto.type, deviceId: dto.deviceId ?? null, idempotencyKey: dto.idempotencyKey,
        reason: dto.reason?.trim() || null, actorUserId: actor.sub,
      },
    });
    if (dto.type === 'MANUAL_OVERRIDE') {
      await this.audit.record(actor, { section: 'operations', action: 'access.locker.override', summary: 'Manually overrode locker', correlationId: dto.idempotencyKey, reason: dto.reason, meta: { lockerId, assignmentId: assignment?.id ?? null } });
    }
    return event;
  }

  async releaseLocker(actor: JwtAccessPayload, lockerId: string, dto: ReleaseLockerDto) {
    const shopId = this.shopId(actor);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`locker:${shopId}:${lockerId}`}))`;
      const assignment = await tx.lockerAssignment.findFirst({ where: { shopId, lockerId, status: 'ACTIVE' } });
      if (!assignment) throw new NotFoundException('Active locker assignment not found.');
      if (dto.expectedVersion && dto.expectedVersion !== assignment.version) throw new ConflictException('Locker assignment version conflict.');
      const released = await tx.lockerAssignment.update({
        where: { id: assignment.id }, data: { status: 'RELEASED', releasedAt: new Date(), version: { increment: 1 } },
      });
      const event = await tx.lockerEvent.create({
        data: { shopId, lockerId, assignmentId: assignment.id, credentialId: assignment.credentialId, type: 'RELEASED', idempotencyKey: dto.idempotencyKey, reason: dto.reason?.trim() || null, actorUserId: actor.sub },
      });
      await this.eventOutbox(tx, shopId, 'LockerAssignment', assignment.id, 'locker.released.v1', dto.idempotencyKey, { lockerId, reason: dto.reason ?? null });
      return { assignment: released, event };
    });
    await this.audit.record(actor, { section: 'operations', action: 'access.locker.release', summary: 'Released locker assignment', correlationId: dto.idempotencyKey, reason: dto.reason, meta: { lockerId, assignmentId: result.assignment.id } });
    return result;
  }

  async readiness(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [ticketProducts, zones, configuredScanners, accessCredentials, lockers, accessEvents, storedCredentials] = await Promise.all([
      this.prisma.ticketProduct.count({ where: { shopId, active: true, menuItemId: { not: null } } }),
      this.prisma.accessZone.count({ where: { shopId, active: true } }),
      this.prisma.accessScannerConfiguration.count({ where: { shopId } }),
      this.prisma.accessCredential.count({ where: { shopId, status: 'ACTIVE' } }),
      this.prisma.locker.count({ where: { shopId } }),
      this.prisma.accessEvent.count({ where: { shopId } }),
      this.prisma.accessCredential.count({ where: { shopId, status: 'ACTIVE', storedValueAccountId: { not: null } } }),
    ]);
    return {
      ok: ticketProducts > 0 && zones > 0,
      ticketProducts,
      zones,
      configuredScanners,
      accessCredentials,
      lockers,
      accessEvents,
      storedValueCredentials: storedCredentials,
      financialAuthority: 'GuestCheck/Settlement + StoredValueLedgerEntry',
      offlinePolicy: 'SCANNER_CACHE_ONLY_PHASE11',
    };
  }
}
