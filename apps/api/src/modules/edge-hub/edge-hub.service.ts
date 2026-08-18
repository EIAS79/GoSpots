import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DeviceStatus, DeviceType, Prisma } from '@prisma/client';
import { createHash, createPublicKey, randomBytes, verify } from 'crypto';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import type { ApplyOfflineOperationDto } from '../offline-sync/dto/offline-operation.dto';
import { OfflineSyncService } from '../offline-sync/offline-sync.service';
import { EdgeContinuityService } from './edge-continuity.service';
import type { EdgeHeartbeatDto, RegisterEdgeHubDto } from './dto/edge-hub.dto';

const PROVISION_TTL_MS = 15 * 60_000;
const SIGNATURE_CLOCK_SKEW_MS = 5 * 60_000;
const NONCE_SCOPE = 'edge.auth.nonce.v1';

type JsonObject = Record<string, unknown>;
type EdgeMetadata = {
  provisionTokenHash?: string;
  provisionExpiresAt?: string;
  provisionUsedAt?: string;
  provisionedBy?: string;
  publicKeyPem?: string;
  fingerprint?: string;
  registeredAt?: string;
  version?: string;
  hostname?: string;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as JsonObject) } : {};
}
function edgeMetadata(metadata: unknown): EdgeMetadata { return asObject(asObject(metadata).edge) as EdgeMetadata; }
function withEdgeMetadata(metadata: unknown, edge: EdgeMetadata): Prisma.InputJsonValue {
  const cleanEdge = Object.fromEntries(Object.entries(edge).filter(([, value]) => value !== undefined));
  return { ...asObject(metadata), edge: cleanEdge } as Prisma.InputJsonValue;
}
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}
function signatureMessage(method: string, path: string, timestamp: string, nonce: string, body: unknown) {
  const bodyHash = sha256(canonicalJson(body ?? {}));
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

@Injectable()
export class EdgeHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly audit: AuditService,
    private readonly offline: OfflineSyncService,
    private readonly continuity: EdgeContinuityService,
  ) {}

  private async requireEnabled(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'edge_hub'))) throw new ForbiddenException('Edge Hub is not enabled for this venue');
  }

  async createProvisioningToken(actor: JwtAccessPayload, deviceId: string) {
    const shopId = requireShopId(actor);
    await this.requireEnabled(shopId);
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, shopId, type: DeviceType.EDGE_HUB, status: DeviceStatus.ACTIVE } });
    if (!device) throw new NotFoundException('Active Edge Hub device not found');
    const secret = randomBytes(32).toString('base64url');
    const token = `${device.id}.${secret}`;
    const expiresAt = new Date(Date.now() + PROVISION_TTL_MS);
    const edge = edgeMetadata(device.metadata);
    await this.prisma.device.update({
      where: { id: device.id },
      data: { metadata: withEdgeMetadata(device.metadata, { ...edge, provisionTokenHash: sha256(token), provisionExpiresAt: expiresAt.toISOString(), provisionUsedAt: undefined, provisionedBy: actor.sub }) },
    });
    await this.audit.record(actor, { section: 'system', action: 'edge.provision.created', summary: `Created one-time Edge Hub provisioning token for ${device.label}`, meta: { deviceId: device.id, expiresAt: expiresAt.toISOString() } });
    return { deviceId: device.id, provisioningToken: token, expiresAt: expiresAt.toISOString() };
  }

  async register(dto: RegisterEdgeHubDto) {
    const separator = dto.provisioningToken.indexOf('.');
    if (separator <= 0) throw new UnauthorizedException('Invalid Edge Hub provisioning token');
    const deviceId = dto.provisioningToken.slice(0, separator);
    let key;
    try { key = createPublicKey(dto.publicKeyPem); } catch { throw new BadRequestException('Invalid Edge Hub public key'); }
    if (key.asymmetricKeyType !== 'ed25519') throw new BadRequestException('Edge Hub public key must use Ed25519');
    const fingerprint = sha256(key.export({ type: 'spki', format: 'der' }));
    const initial = await this.prisma.device.findFirst({ where: { id: deviceId, type: DeviceType.EDGE_HUB, status: DeviceStatus.ACTIVE }, select: { shopId: true } });
    if (!initial) throw new UnauthorizedException('Invalid Edge Hub provisioning token');
    await this.requireEnabled(initial.shopId);
    const registered = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${deviceId}, 0))`;
      const device = await tx.device.findFirst({ where: { id: deviceId, type: DeviceType.EDGE_HUB, status: DeviceStatus.ACTIVE } });
      if (!device) throw new UnauthorizedException('Invalid Edge Hub provisioning token');
      const edge = edgeMetadata(device.metadata);
      if (!edge.provisionTokenHash || sha256(dto.provisioningToken) !== edge.provisionTokenHash) throw new UnauthorizedException('Invalid Edge Hub provisioning token');
      if (!edge.provisionExpiresAt || Date.parse(edge.provisionExpiresAt) <= Date.now()) throw new UnauthorizedException('Edge Hub provisioning token expired');
      if (edge.provisionUsedAt) throw new UnauthorizedException('Edge Hub provisioning token already used');
      const now = new Date();
      const nextEdge: EdgeMetadata = { ...edge, provisionTokenHash: undefined, provisionExpiresAt: undefined, provisionUsedAt: now.toISOString(), publicKeyPem: dto.publicKeyPem, fingerprint, registeredAt: now.toISOString(), version: dto.version, hostname: dto.hostname?.trim() || undefined };
      await tx.device.update({ where: { id: device.id }, data: { metadata: withEdgeMetadata(device.metadata, nextEdge), lastSeenAt: now } });
      return { device, registeredAt: now };
    });
    await this.audit.recordForShop(registered.device.shopId, {
      section: 'system', action: 'edge.registered', summary: `Edge Hub ${registered.device.label} registered with signed device identity`, actorName: `Edge Hub ${registered.device.label}`,
      meta: { deviceId: registered.device.id, fingerprint, version: dto.version, hostname: dto.hostname ?? null },
    });
    return { deviceId: registered.device.id, shopId: registered.device.shopId, fingerprint, registeredAt: registered.registeredAt.toISOString() };
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string): string {
    const value = headers[name];
    if (typeof value !== 'string' || !value) throw new UnauthorizedException(`Missing ${name}`);
    return value;
  }

  async authenticateSignedRequest(headers: Record<string, string | string[] | undefined>, method: string, path: string, body: unknown) {
    const deviceId = this.header(headers, 'x-edge-device-id');
    const timestamp = this.header(headers, 'x-edge-timestamp');
    const nonce = this.header(headers, 'x-edge-nonce');
    const signature = this.header(headers, 'x-edge-signature');
    const parsedTimestamp = Date.parse(timestamp);
    const now = Date.now();
    if (!Number.isFinite(parsedTimestamp) || Math.abs(now - parsedTimestamp) > SIGNATURE_CLOCK_SKEW_MS) throw new UnauthorizedException('Edge Hub signature timestamp is stale');
    if (nonce.length > 120) throw new UnauthorizedException('Invalid Edge Hub nonce');
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, type: DeviceType.EDGE_HUB, status: DeviceStatus.ACTIVE } });
    if (!device) throw new UnauthorizedException('Unknown Edge Hub device');
    await this.requireEnabled(device.shopId);
    const edge = edgeMetadata(device.metadata);
    if (!edge.publicKeyPem || !edge.registeredAt) throw new UnauthorizedException('Edge Hub is not registered');
    const message = signatureMessage(method, path, timestamp, nonce, body);
    let valid = false;
    try { valid = verify(null, Buffer.from(message, 'utf8'), createPublicKey(edge.publicKeyPem), Buffer.from(signature, 'base64')); } catch { valid = false; }
    if (!valid) throw new UnauthorizedException('Invalid Edge Hub signature');
    await this.prisma.idempotencyReceipt.deleteMany({ where: { shopId: device.shopId, scope: NONCE_SCOPE, expiresAt: { lt: new Date(now) } } });
    const nonceExpiresAt = new Date(parsedTimestamp + SIGNATURE_CLOCK_SKEW_MS);
    try {
      await this.prisma.idempotencyReceipt.create({ data: { shopId: device.shopId, scope: NONCE_SCOPE, key: `${device.id}:${nonce}`, requestHash: sha256(message), status: 'COMPLETED', expiresAt: nonceExpiresAt } });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') throw new UnauthorizedException('Edge Hub nonce was already used');
      throw error;
    }
    return { device, edge };
  }

  async heartbeat(headers: Record<string, string | string[] | undefined>, dto: EdgeHeartbeatDto) {
    const { device, edge } = await this.authenticateSignedRequest(headers, 'POST', '/edge-hub/cloud/heartbeat', dto);
    const now = new Date();
    await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: now, metadata: withEdgeMetadata(device.metadata, { ...edge, version: dto.version }) } });
    return { ok: true, deviceId: device.id, shopId: device.shopId, serverTime: now.toISOString() };
  }

  async snapshot(headers: Record<string, string | string[] | undefined>, body: { cursor?: string | null }) {
    const { device } = await this.authenticateSignedRequest(headers, 'POST', '/edge-hub/cloud/snapshot', body);
    return this.continuity.snapshot(device.shopId);
  }

  async replay(headers: Record<string, string | string[] | undefined>, dto: ApplyOfflineOperationDto) {
    const { device } = await this.authenticateSignedRequest(headers, 'POST', '/edge-hub/cloud/replay', dto);
    if (dto.venueId && dto.venueId !== device.shopId) throw new ForbiddenException('Edge command venue does not match registered Edge Hub venue');
    const operationType = dto.operationType as string;
    if (['SESSION_PAUSE', 'SESSION_RESUME', 'CASH_PAYMENT'].includes(operationType)) {
      return this.continuity.replayExtended(device.shopId, device.id, dto);
    }
    const safeDeviceId = `edge:${device.id}:${dto.deviceId}`.slice(0, 120);
    return this.offline.applyEdgeOperation(device.shopId, device.id, { ...dto, venueId: device.shopId, deviceId: safeDeviceId });
  }
}
