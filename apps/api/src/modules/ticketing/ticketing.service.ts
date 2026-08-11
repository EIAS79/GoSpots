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
import type { JwtAccessPayload } from '../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { hmacOpaque, sha256 } from '../../common/platform-security.util';
import type {
  BindRfidCredentialDto,
  CreateRfidWalletDto,
  CreateTicketProductDto,
  IssueTicketOrderDto,
  ReverseRfidEntryDto,
  RfidTapDto,
  RfidWalletMutationDto,
  ScanTicketDto,
} from './dto/ticketing.dto';

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
      throw new ServiceUnavailableException(
        'Opaque identifier hashing is not configured.',
      );
    }
    return secret;
  }

  private opaque(value: string): string {
    return hmacOpaque(value.trim(), this.secret());
  }

  private async audit(
    shopId: string,
    actor: JwtAccessPayload,
    action: string,
    summary: string,
    meta?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        shopId,
        userId: actor.sub,
        section: 'system',
        action,
        summary,
        meta: meta ? JSON.stringify(meta) : null,
        actorRole: actor.shopRole ?? null,
        actorEmail: actor.email ?? null,
      },
    });
  }

  async overview(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [products, wallets, credentials, scans, taps] = await Promise.all([
      this.prisma.ticketProduct.findMany({
        where: { shopId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      this.prisma.rfidWallet.findMany({
        where: { shopId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      this.prisma.rfidCredential.count({ where: { shopId, status: 'ACTIVE' } }),
      this.prisma.ticketScan.count({ where: { shopId } }),
      this.prisma.rfidTap.count({ where: { shopId } }),
    ]);
    return { products, wallets, activeCredentials: credentials, scans, taps };
  }

  async createProduct(actor: JwtAccessPayload, dto: CreateTicketProductDto) {
    const shopId = this.shopId(actor);
    const row = await this.prisma.ticketProduct.create({
      data: {
        shopId,
        name: dto.name.trim(),
        sku: dto.sku?.trim() || null,
        priceMinor: dto.priceMinor,
        currency: (dto.currency ?? 'EUR').toUpperCase(),
        validityMinutes: dto.validityMinutes ?? null,
        maxScans: dto.maxScans ?? 1,
        active: dto.active ?? true,
      },
    });
    await this.audit(shopId, actor, 'ticketing.product.create', `Created ticket product ${row.name}`, {
      productId: row.id,
    });
    return row;
  }

  async issueOrder(actor: JwtAccessPayload, dto: IssueTicketOrderDto) {
    const shopId = this.shopId(actor);
    if (!dto.lines.length) throw new BadRequestException('At least one ticket line is required.');
    const ticketCount = dto.lines.reduce((sum, line) => sum + line.quantity, 0);
    if (ticketCount > 1000) throw new BadRequestException('One order cannot issue more than 1000 tickets.');

    const existing = await this.prisma.ticketOrder.findUnique({
      where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
    });
    if (existing) {
      const tickets = await this.prisma.ticket.findMany({ where: { shopId, orderId: existing.id } });
      return { order: existing, tickets, replayed: true, rawTokens: [] as string[] };
    }

    const ids = [...new Set(dto.lines.map((line) => line.productId))];
    const products = await this.prisma.ticketProduct.findMany({
      where: { shopId, id: { in: ids }, active: true },
    });
    if (products.length !== ids.length) throw new BadRequestException('One or more ticket products are unavailable.');
    const byId = new Map(products.map((p) => [p.id, p]));
    const currencies = new Set(products.map((p) => p.currency));
    if (currencies.size !== 1) throw new BadRequestException('One order cannot mix currencies.');

    const totalMinor = dto.lines.reduce((sum, line) => {
      const product = byId.get(line.productId)!;
      return sum + product.priceMinor * line.quantity;
    }, 0);
    const customerRefHash = dto.customerRef ? this.opaque(dto.customerRef) : null;
    const issued: { token: string; tokenHash: string; productId: string; maxScans: number; expiresAt: Date | null }[] = [];
    const now = new Date();
    for (const line of dto.lines) {
      const product = byId.get(line.productId)!;
      for (let i = 0; i < line.quantity; i += 1) {
        const token = `gst_${randomBytes(24).toString('base64url')}`;
        issued.push({
          token,
          tokenHash: this.opaque(token),
          productId: product.id,
          maxScans: product.maxScans,
          expiresAt: product.validityMinutes
            ? new Date(now.getTime() + product.validityMinutes * 60_000)
            : null,
        });
      }
    }

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const order = await tx.ticketOrder.create({
          data: {
            shopId,
            idempotencyKey: dto.idempotencyKey,
            status: 'PAID',
            totalMinor,
            currency: products[0].currency,
            customerRefHash,
          },
        });
        const tickets = [];
        for (const item of issued) {
          tickets.push(
            await tx.ticket.create({
              data: {
                shopId,
                orderId: order.id,
                productId: item.productId,
                tokenHash: item.tokenHash,
                status: 'ACTIVE',
                maxScans: item.maxScans,
                expiresAt: item.expiresAt,
              },
            }),
          );
        }
        return { order, tickets };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replayOrder = await this.prisma.ticketOrder.findUnique({
          where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
        });
        if (replayOrder) {
          const tickets = await this.prisma.ticket.findMany({ where: { shopId, orderId: replayOrder.id } });
          return { order: replayOrder, tickets, replayed: true, rawTokens: [] as string[] };
        }
      }
      throw error;
    }

    await this.audit(shopId, actor, 'ticketing.order.issue', `Issued ${result.tickets.length} ticket(s)`, {
      orderId: result.order.id,
      totalMinor,
      currency: result.order.currency,
    });
    return {
      ...result,
      replayed: false,
      rawTokens: issued.map((item) => item.token),
    };
  }

  async scan(actor: JwtAccessPayload, dto: ScanTicketDto) {
    const shopId = this.shopId(actor);
    const presentedHash = this.opaque(dto.token);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.ticketScan.findUnique({
          where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
        });
        if (replay) return { scan: replay, replayed: true };

        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Ticket" WHERE "shopId" = ${shopId} AND "tokenHash" = ${presentedHash} FOR UPDATE`);
        const ticket = await tx.ticket.findFirst({ where: { shopId, tokenHash: presentedHash } });
        let scanResult: 'ACCEPTED' | 'DUPLICATE' | 'EXPIRED' | 'VOIDED' | 'REJECTED' = 'REJECTED';
        let reasonCode: string | null = 'NOT_FOUND';
        if (ticket) {
          if (ticket.status === 'VOIDED') {
            scanResult = 'VOIDED';
            reasonCode = 'TICKET_VOIDED';
          } else if (ticket.expiresAt && ticket.expiresAt.getTime() <= Date.now()) {
            scanResult = 'EXPIRED';
            reasonCode = 'TICKET_EXPIRED';
            await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'EXPIRED' } });
          } else if (ticket.status === 'REDEEMED' || ticket.scansUsed >= ticket.maxScans) {
            scanResult = 'DUPLICATE';
            reasonCode = 'SCAN_LIMIT_REACHED';
          } else {
            scanResult = 'ACCEPTED';
            reasonCode = null;
            const next = ticket.scansUsed + 1;
            await tx.ticket.update({
              where: { id: ticket.id },
              data: {
                scansUsed: next,
                lastScannedAt: new Date(),
                status: next >= ticket.maxScans ? 'REDEEMED' : 'ACTIVE',
                redeemedAt: next >= ticket.maxScans ? new Date() : null,
              },
            });
          }
        }
        const scan = await tx.ticketScan.create({
          data: {
            shopId,
            ticketId: ticket?.id ?? null,
            presentedHash,
            result: scanResult,
            scannerDeviceId: dto.scannerDeviceId ?? null,
            idempotencyKey: dto.idempotencyKey,
            reasonCode,
          },
        });
        return { scan, replayed: false };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.prisma.ticketScan.findUnique({
          where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
        });
        if (replay) return { scan: replay, replayed: true };
      }
      throw error;
    }
  }

  async createWallet(actor: JwtAccessPayload, dto: CreateRfidWalletDto) {
    const shopId = this.shopId(actor);
    const wallet = await this.prisma.rfidWallet.create({
      data: {
        shopId,
        label: dto.label?.trim() || null,
        customerRefHash: dto.customerRef ? this.opaque(dto.customerRef) : null,
        currency: (dto.currency ?? 'EUR').toUpperCase(),
      },
    });
    await this.audit(shopId, actor, 'ticketing.rfid.wallet.create', 'Created RFID wallet', { walletId: wallet.id });
    return wallet;
  }

  async bindCredential(actor: JwtAccessPayload, dto: BindRfidCredentialDto) {
    const shopId = this.shopId(actor);
    const wallet = await this.prisma.rfidWallet.findFirst({ where: { id: dto.walletId, shopId, active: true } });
    if (!wallet) throw new NotFoundException('RFID wallet not found.');
    const uidHash = this.opaque(dto.uid);
    const credential = await this.prisma.rfidCredential.upsert({
      where: { shopId_uidHash: { shopId, uidHash } },
      create: { shopId, uidHash, walletId: wallet.id, label: dto.label?.trim() || null },
      update: { walletId: wallet.id, label: dto.label?.trim() || null, status: 'ACTIVE' },
    });
    await this.audit(shopId, actor, 'ticketing.rfid.bind', 'Bound RFID credential', {
      credentialId: credential.id,
      walletId: wallet.id,
      uidFingerprint: uidHash.slice(0, 12),
    });
    return credential;
  }

  private async mutateWalletInTx(
    tx: Prisma.TransactionClient,
    actor: JwtAccessPayload,
    walletId: string,
    dto: RfidWalletMutationDto,
    kind: 'LOAD' | 'SPEND' | 'REFUND' | 'ADJUSTMENT',
  ) {
    const shopId = this.shopId(actor);
    const signed = kind === 'SPEND' ? -dto.amountMinor : dto.amountMinor;
    const replay = await tx.rfidWalletEntry.findUnique({
      where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
    });
    if (replay) {
      const wallet = await tx.rfidWallet.findFirst({ where: { id: replay.walletId, shopId } });
      return { wallet, entry: replay, replayed: true };
    }
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RfidWallet" WHERE "id" = ${walletId} AND "shopId" = ${shopId} FOR UPDATE`);
    const wallet = await tx.rfidWallet.findFirst({ where: { id: walletId, shopId, active: true } });
    if (!wallet) throw new NotFoundException('RFID wallet not found.');
    const next = wallet.balanceMinor + signed;
    if (next < 0) throw new ConflictException('RFID wallet balance cannot become negative.');
    const updated = await tx.rfidWallet.update({
      where: { id: wallet.id },
      data: { balanceMinor: next, version: { increment: 1 } },
    });
    const entry = await tx.rfidWalletEntry.create({
      data: {
        shopId,
        walletId: wallet.id,
        type: kind,
        amountMinor: signed,
        balanceAfterMinor: next,
        idempotencyKey: dto.idempotencyKey,
        referenceType: dto.referenceType ?? null,
        referenceId: dto.referenceId ?? null,
        actorUserId: actor.sub,
        note: dto.note ?? null,
      },
    });
    return { wallet: updated, entry, replayed: false };
  }

  private async mutateWallet(
    actor: JwtAccessPayload,
    walletId: string,
    dto: RfidWalletMutationDto,
    kind: 'LOAD' | 'SPEND' | 'REFUND' | 'ADJUSTMENT',
  ) {
    const shopId = this.shopId(actor);
    try {
      return await this.prisma.$transaction((tx) => this.mutateWalletInTx(tx, actor, walletId, dto, kind));
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.prisma.rfidWalletEntry.findUnique({
          where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
        });
        if (replay) {
          const wallet = await this.prisma.rfidWallet.findFirst({ where: { id: replay.walletId, shopId } });
          return { wallet, entry: replay, replayed: true };
        }
      }
      throw error;
    }
  }

  load(actor: JwtAccessPayload, walletId: string, dto: RfidWalletMutationDto) {
    return this.mutateWallet(actor, walletId, dto, 'LOAD');
  }

  spend(actor: JwtAccessPayload, walletId: string, dto: RfidWalletMutationDto) {
    return this.mutateWallet(actor, walletId, dto, 'SPEND');
  }

  refund(actor: JwtAccessPayload, walletId: string, dto: RfidWalletMutationDto) {
    return this.mutateWallet(actor, walletId, dto, 'REFUND');
  }

  async reverse(actor: JwtAccessPayload, walletId: string, dto: ReverseRfidEntryDto) {
    const shopId = this.shopId(actor);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.rfidWalletEntry.findUnique({
          where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
        });
        if (replay) return { entry: replay, replayed: true };
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "RfidWallet" WHERE "id" = ${walletId} AND "shopId" = ${shopId} FOR UPDATE`);
        const [wallet, original, priorReversal] = await Promise.all([
          tx.rfidWallet.findFirst({ where: { id: walletId, shopId, active: true } }),
          tx.rfidWalletEntry.findFirst({ where: { id: dto.entryId, walletId, shopId } }),
          tx.rfidWalletEntry.findFirst({ where: { shopId, reversalOfId: dto.entryId } }),
        ]);
        if (!wallet || !original) throw new NotFoundException('Wallet entry not found.');
        if (original.type === 'REVERSAL') throw new ConflictException('A reversal cannot be reversed directly.');
        if (priorReversal) throw new ConflictException('Wallet entry was already reversed.');
        const amountMinor = -original.amountMinor;
        const next = wallet.balanceMinor + amountMinor;
        if (next < 0) throw new ConflictException('Reversal would make wallet balance negative.');
        const updated = await tx.rfidWallet.update({
          where: { id: wallet.id },
          data: { balanceMinor: next, version: { increment: 1 } },
        });
        const entry = await tx.rfidWalletEntry.create({
          data: {
            shopId,
            walletId,
            type: 'REVERSAL',
            amountMinor,
            balanceAfterMinor: next,
            idempotencyKey: dto.idempotencyKey,
            reversalOfId: original.id,
            referenceType: original.referenceType,
            referenceId: original.referenceId,
            actorUserId: actor.sub,
            note: dto.note ?? `Reversal of ${original.id}`,
          },
        });
        return { wallet: updated, entry, replayed: false };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.prisma.rfidWalletEntry.findUnique({
          where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
        });
        if (replay) return { entry: replay, replayed: true };
        const priorReversal = await this.prisma.rfidWalletEntry.findFirst({
          where: { shopId, reversalOfId: dto.entryId },
        });
        if (priorReversal) throw new ConflictException('Wallet entry was already reversed.');
      }
      throw error;
    }
  }

  async tap(actor: JwtAccessPayload, dto: RfidTapDto) {
    const shopId = this.shopId(actor);
    const uidHash = this.opaque(dto.uid);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.rfidTap.findUnique({
          where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
        });
        if (replay) return { tap: replay, replayed: true };

        const credential = await tx.rfidCredential.findUnique({
          where: { shopId_uidHash: { shopId, uidHash } },
        });
        if (!credential || credential.status !== 'ACTIVE') {
          const tap = await tx.rfidTap.create({
            data: {
              shopId,
              uidHash,
              action: dto.action,
              amountMinor: dto.amountMinor ?? null,
              result: 'CREDENTIAL_REJECTED',
              idempotencyKey: dto.idempotencyKey,
              deviceId: dto.deviceId ?? null,
            },
          });
          return { tap, replayed: false, wallet: null };
        }

        let walletResult: unknown = await tx.rfidWallet.findFirst({
          where: { id: credential.walletId, shopId },
        });
        if (dto.action === 'SPEND' || dto.action === 'LOAD') {
          if (!dto.amountMinor) throw new BadRequestException('amountMinor is required for SPEND or LOAD.');
          walletResult = await this.mutateWalletInTx(
            tx,
            actor,
            credential.walletId,
            {
              amountMinor: dto.amountMinor,
              idempotencyKey: `tap-ledger:${dto.idempotencyKey}`,
              referenceType: 'RFID_TAP',
              referenceId: dto.idempotencyKey,
            },
            dto.action,
          );
        }
        const tap = await tx.rfidTap.create({
          data: {
            shopId,
            credentialId: credential.id,
            uidHash,
            walletId: credential.walletId,
            action: dto.action,
            amountMinor: dto.amountMinor ?? null,
            result: 'ACCEPTED',
            idempotencyKey: dto.idempotencyKey,
            deviceId: dto.deviceId ?? null,
          },
        });
        await tx.rfidCredential.update({ where: { id: credential.id }, data: { lastTapAt: new Date() } });
        return { tap, replayed: false, wallet: walletResult };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.prisma.rfidTap.findUnique({
          where: { shopId_idempotencyKey: { shopId, idempotencyKey: dto.idempotencyKey } },
        });
        if (replay) return { tap: replay, replayed: true };
      }
      throw error;
    }
  }

  async readiness(actor: JwtAccessPayload) {
    const shopId = this.shopId(actor);
    const [products, wallets, credentials] = await Promise.all([
      this.prisma.ticketProduct.count({ where: { shopId, active: true } }),
      this.prisma.rfidWallet.count({ where: { shopId, active: true } }),
      this.prisma.rfidCredential.count({ where: { shopId, status: 'ACTIVE' } }),
    ]);
    return {
      status: 'ok',
      hashing: 'hmac-sha256',
      opaqueIdentifierSecretConfigured: Boolean(this.secret()),
      products,
      wallets,
      credentials,
      contractHash: sha256('ticketing-rfid-v1'),
    };
  }
}