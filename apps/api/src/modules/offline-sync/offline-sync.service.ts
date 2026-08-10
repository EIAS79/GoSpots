import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { ApiDomainErrorCode } from '../../common/api-error.codes';
import { apiConflictException } from '../../common/api-error.util';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import type {
  ApplyOfflineOperationDto,
  OfflineOperationType,
} from './dto/offline-operation.dto';

const RECEIPT_SCOPE = 'offline.sync.v1';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function trimmedString(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string`);
  const next = value.trim();
  if (next.length > max) throw new BadRequestException(`${field} is too long`);
  return next || null;
}

function optionalPartySize(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new BadRequestException('partySize must be an integer from 1 to 100');
  }
  return Number(value);
}

@Injectable()
export class OfflineSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
  ) {}

  private assertWrite(actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (hasPermission(actor.perms ?? '', PERMISSIONS.TRANSACTION_WRITE)) return;
    throw new ForbiddenException('Missing transaction.write');
  }

  private async requireEnabled(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'offline_lite'))) {
      throw new ForbiddenException('Offline Lite is not enabled for this venue');
    }
  }

  private validateHash(dto: ApplyOfflineOperationDto) {
    const calculated = sha256(canonicalJson(dto.payload));
    if (dto.payloadHash.toLowerCase() !== calculated) {
      throw new BadRequestException('Offline operation payloadHash does not match payload');
    }
    return sha256(
      canonicalJson({
        deviceId: dto.deviceId,
        operationType: dto.operationType,
        entityId: dto.entityId,
        expectedVersion: dto.expectedVersion ?? null,
        payloadHash: calculated,
      }),
    );
  }

  private async applyCheckCreate(
    tx: Prisma.TransactionClient,
    shopId: string,
    actor: JwtAccessPayload,
    dto: ApplyOfflineOperationDto,
  ) {
    if (dto.expectedVersion !== undefined) {
      throw new BadRequestException('CHECK_CREATE must not include expectedVersion');
    }
    const p = dto.payload;
    const existing = await tx.guestCheck.findFirst({
      where: { id: dto.entityId, shopId },
      select: { id: true, version: true, status: true },
    });
    if (existing) return { entityId: existing.id, version: existing.version, status: existing.status };

    const shop = await tx.shop.findUnique({
      where: { id: shopId },
      select: { currency: true },
    });
    if (!shop) throw new BadRequestException('Venue not found');

    const created = await tx.guestCheck.create({
      data: {
        id: dto.entityId,
        shopId,
        status: 'OPEN',
        guestName: trimmedString(p.guestName, 'guestName', 120),
        guestEmail: trimmedString(p.guestEmail, 'guestEmail', 160),
        guestPhone: trimmedString(p.guestPhone, 'guestPhone', 60),
        label: trimmedString(p.label, 'label', 120),
        note: trimmedString(p.note, 'note', 500),
        partySize: optionalPartySize(p.partySize) ?? 1,
        currency: shop.currency,
        createdById: actor.sub,
      },
      select: { id: true, version: true, status: true },
    });
    return { entityId: created.id, version: created.version, status: created.status };
  }

  private async applyCheckUpdate(
    tx: Prisma.TransactionClient,
    shopId: string,
    dto: ApplyOfflineOperationDto,
  ) {
    if (!dto.expectedVersion) {
      throw new BadRequestException('CHECK_UPDATE requires expectedVersion');
    }
    const current = await tx.guestCheck.findFirst({
      where: { id: dto.entityId, shopId },
      select: { id: true, version: true, status: true },
    });
    if (!current) throw new BadRequestException('Guest check not found');
    if (current.status !== 'OPEN') {
      throw apiConflictException(
        ApiDomainErrorCode.STATE_CONFLICT,
        'Guest check is no longer open',
        { entityId: dto.entityId, status: current.status, currentVersion: current.version },
      );
    }
    if (current.version !== dto.expectedVersion) {
      throw apiConflictException(
        ApiDomainErrorCode.VERSION_CONFLICT,
        'Guest check changed while this device was offline',
        {
          entityId: dto.entityId,
          expectedVersion: dto.expectedVersion,
          currentVersion: current.version,
        },
      );
    }

    const p = dto.payload;
    const data: Prisma.GuestCheckUpdateManyMutationInput = {
      currentSettlementId: null,
      version: { increment: 1 },
    };
    if ('guestName' in p) data.guestName = trimmedString(p.guestName, 'guestName', 120);
    if ('guestEmail' in p) data.guestEmail = trimmedString(p.guestEmail, 'guestEmail', 160);
    if ('guestPhone' in p) data.guestPhone = trimmedString(p.guestPhone, 'guestPhone', 60);
    if ('label' in p) data.label = trimmedString(p.label, 'label', 120);
    if ('note' in p) data.note = trimmedString(p.note, 'note', 500);
    if ('partySize' in p) data.partySize = optionalPartySize(p.partySize);

    const updated = await tx.guestCheck.updateMany({
      where: {
        id: dto.entityId,
        shopId,
        status: 'OPEN',
        version: dto.expectedVersion,
      },
      data,
    });
    if (updated.count !== 1) {
      throw apiConflictException(
        ApiDomainErrorCode.VERSION_CONFLICT,
        'Guest check changed while this offline operation was replaying',
        { entityId: dto.entityId, expectedVersion: dto.expectedVersion },
      );
    }
    return {
      entityId: dto.entityId,
      version: dto.expectedVersion + 1,
      status: 'OPEN',
    };
  }

  private apply(
    tx: Prisma.TransactionClient,
    shopId: string,
    actor: JwtAccessPayload,
    dto: ApplyOfflineOperationDto,
  ) {
    const handlers: Record<
      OfflineOperationType,
      () => Promise<{ entityId: string; version: number; status: string }>
    > = {
      CHECK_CREATE: () => this.applyCheckCreate(tx, shopId, actor, dto),
      CHECK_UPDATE: () => this.applyCheckUpdate(tx, shopId, dto),
    };
    return handlers[dto.operationType]();
  }

  async applyOperation(actor: JwtAccessPayload, dto: ApplyOfflineOperationDto) {
    this.assertWrite(actor);
    const shopId = requireShopId(actor);
    await this.requireEnabled(shopId);
    const requestHash = this.validateHash(dto);
    const receiptKey = `${dto.deviceId}:${dto.operationId}`;

    const existing = await this.prisma.idempotencyReceipt.findUnique({
      where: { shopId_scope_key: { shopId, scope: RECEIPT_SCOPE, key: receiptKey } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw apiConflictException(
          ApiDomainErrorCode.IDEMPOTENCY_CONFLICT,
          'Offline operation ID was already used with different content',
          { operationId: dto.operationId, deviceId: dto.deviceId },
        );
      }
      if (existing.status === 'COMPLETED' && existing.responseJson) {
        return JSON.parse(existing.responseJson) as Record<string, unknown>;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.idempotencyReceipt.findUnique({
        where: { shopId_scope_key: { shopId, scope: RECEIPT_SCOPE, key: receiptKey } },
      });
      if (locked?.status === 'COMPLETED' && locked.responseJson) {
        if (locked.requestHash !== requestHash) {
          throw apiConflictException(
            ApiDomainErrorCode.IDEMPOTENCY_CONFLICT,
            'Offline operation ID was already used with different content',
          );
        }
        return JSON.parse(locked.responseJson) as Record<string, unknown>;
      }
      if (!locked) {
        await tx.idempotencyReceipt.create({
          data: {
            shopId,
            scope: RECEIPT_SCOPE,
            key: receiptKey,
            requestHash,
            status: 'PENDING',
          },
        });
      }

      const result = await this.apply(tx, shopId, actor, dto);
      const response = {
        operationId: dto.operationId,
        deviceId: dto.deviceId,
        operationType: dto.operationType,
        syncState: 'SYNCED',
        ...result,
      };
      await tx.idempotencyReceipt.update({
        where: { shopId_scope_key: { shopId, scope: RECEIPT_SCOPE, key: receiptKey } },
        data: { status: 'COMPLETED', responseJson: JSON.stringify(response) },
      });
      return response;
    });
  }
}
