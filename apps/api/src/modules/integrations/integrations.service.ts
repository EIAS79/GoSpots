import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  ConnectorInstallationStatus,
  IntegrationJobStatus,
  Prisma,
  WebhookDeliveryStatus,
  WebhookReceiptStatus,
} from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import { IntegrationConnectorRegistry } from './connectors/integration-connector.registry';
import {
  CreateConnectorInstallationDto,
  CreateIntegrationCredentialDto,
  CreateIntegrationJobDto,
  CreateWebhookEndpointDto,
  UpdateConnectorInstallationDto,
  UpsertIntegrationMappingDto,
} from './dto/integration.dto';
import { IntegrationSecretBoxService } from './integration-secret-box.service';

const API_TOKEN_PREFIX = 'gsp_live_';
const WEBHOOK_MAX_ATTEMPTS = 8;
const MAX_WEBHOOK_SKEW_MS = 5 * 60_000;

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function backoff(attempt: number) {
  return Math.min(60 * 60_000, 2 ** Math.max(0, attempt - 1) * 5_000);
}

@Injectable()
export class IntegrationsService {
  private workersRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly audit: AuditService,
    private readonly secretBox: IntegrationSecretBoxService,
    private readonly registry: IntegrationConnectorRegistry,
  ) {}

  private async requireFeature(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    if (!(await this.flags.isFeatureEnabled(shopId, 'integrations_v1'))) {
      throw new ForbiddenException('Integrations are not enabled for this venue');
    }
    return shopId;
  }

  private serializeInstallation(row: any) {
    return {
      id: row.id,
      provider: row.provider,
      name: row.name,
      status: row.status,
      config: row.config ?? null,
      capabilities: row.capabilities ?? null,
      hasSecrets: Boolean(row.secretCiphertext),
      lastHealthAt: row.lastHealthAt?.toISOString?.() ?? row.lastHealthAt ?? null,
      lastErrorCode: row.lastErrorCode ?? null,
      lastErrorMessage: row.lastErrorMessage ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }

  async listProviders(actor: JwtAccessPayload) {
    await this.requireFeature(actor);
    return { providers: this.registry.list() };
  }

  async listInstallations(actor: JwtAccessPayload) {
    const shopId = await this.requireFeature(actor);
    const rows = await this.prisma.connectorInstallation.findMany({
      where: { shopId },
      orderBy: [{ provider: 'asc' }, { name: 'asc' }],
    });
    return { installations: rows.map((row) => this.serializeInstallation(row)) };
  }

  async createInstallation(actor: JwtAccessPayload, dto: CreateConnectorInstallationDto) {
    const shopId = await this.requireFeature(actor);
    const connector = this.registry.get(dto.provider);
    const encrypted = dto.secrets ? this.secretBox.encrypt(dto.secrets) : null;
    const row = await this.prisma.connectorInstallation.create({
      data: {
        shopId,
        provider: connector.provider,
        name: dto.name.trim(),
        config: dto.config as Prisma.InputJsonValue | undefined,
        capabilities: connector.capabilities() as Prisma.InputJsonValue,
        ...(encrypted
          ? {
              secretCiphertext: encrypted.ciphertext,
              secretIv: encrypted.iv,
              secretTag: encrypted.tag,
              secretKeyVersion: encrypted.keyVersion,
            }
          : {}),
        createdById: actor.sub,
      },
    });
    await this.audit.record(actor, {
      section: 'system',
      action: 'integration.installed',
      summary: `Installed ${connector.provider} connector`,
      meta: { installationId: row.id, provider: connector.provider },
    });
    return this.serializeInstallation(row);
  }

  async updateInstallation(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateConnectorInstallationDto,
  ) {
    const shopId = await this.requireFeature(actor);
    const existing = await this.prisma.connectorInstallation.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException('Connector installation not found');
    const encrypted = dto.secrets ? this.secretBox.encrypt(dto.secrets) : null;
    const row = await this.prisma.connectorInstallation.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.config !== undefined ? { config: dto.config as Prisma.InputJsonValue } : {}),
        ...(encrypted
          ? {
              secretCiphertext: encrypted.ciphertext,
              secretIv: encrypted.iv,
              secretTag: encrypted.tag,
              secretKeyVersion: encrypted.keyVersion,
            }
          : {}),
      },
    });
    await this.audit.record(actor, {
      section: 'system',
      action: 'integration.updated',
      summary: `Updated connector ${row.name}`,
      meta: { installationId: id, status: row.status },
    });
    return this.serializeInstallation(row);
  }

  private decryptInstallationSecrets(row: any): Record<string, unknown> | null {
    if (!row.secretCiphertext || !row.secretIv || !row.secretTag) return null;
    return this.secretBox.decrypt<Record<string, unknown>>({
      ciphertext: row.secretCiphertext,
      iv: row.secretIv,
      tag: row.secretTag,
      keyVersion: row.secretKeyVersion,
    });
  }

  async health(actor: JwtAccessPayload, id: string) {
    const shopId = await this.requireFeature(actor);
    const row = await this.prisma.connectorInstallation.findFirst({ where: { id, shopId } });
    if (!row) throw new NotFoundException('Connector installation not found');
    const connector = this.registry.get(row.provider);
    let result: { ok: boolean; detail?: string };
    try {
      result = await connector.health({
        shopId,
        installationId: row.id,
        config: (row.config as Record<string, unknown> | null) ?? {},
        secrets: this.decryptInstallationSecrets(row),
      });
    } catch (error) {
      result = { ok: false, detail: error instanceof Error ? error.message : 'Health check failed' };
    }
    await this.prisma.connectorInstallation.update({
      where: { id: row.id },
      data: {
        lastHealthAt: new Date(),
        status: result.ok ? ConnectorInstallationStatus.ACTIVE : ConnectorInstallationStatus.ERROR,
        lastErrorCode: result.ok ? null : 'HEALTH_FAILED',
        lastErrorMessage: result.ok ? null : result.detail?.slice(0, 500),
      },
    });
    return result;
  }

  async upsertMapping(
    actor: JwtAccessPayload,
    installationId: string,
    dto: UpsertIntegrationMappingDto,
  ) {
    const shopId = await this.requireFeature(actor);
    const install = await this.prisma.connectorInstallation.findFirst({ where: { id: installationId, shopId } });
    if (!install) throw new NotFoundException('Connector installation not found');
    return this.prisma.integrationMapping.upsert({
      where: {
        installationId_mappingType_localKey: {
          installationId,
          mappingType: dto.mappingType.trim(),
          localKey: dto.localKey.trim(),
        },
      },
      create: {
        shopId,
        installationId,
        mappingType: dto.mappingType.trim(),
        localKey: dto.localKey.trim(),
        externalKey: dto.externalKey.trim(),
        config: dto.config as Prisma.InputJsonValue | undefined,
      },
      update: {
        externalKey: dto.externalKey.trim(),
        active: true,
        ...(dto.config !== undefined ? { config: dto.config as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async enqueueJob(actor: JwtAccessPayload, installationId: string, dto: CreateIntegrationJobDto) {
    const shopId = await this.requireFeature(actor);
    return this.enqueueForShop(shopId, installationId, dto, null);
  }

  async enqueueForShop(
    shopId: string,
    installationId: string,
    dto: CreateIntegrationJobDto,
    correlationId: string | null,
  ) {
    const installation = await this.prisma.connectorInstallation.findFirst({
      where: { id: installationId, shopId, status: { in: [ConnectorInstallationStatus.ACTIVE, ConnectorInstallationStatus.ERROR] } },
    });
    if (!installation) throw new NotFoundException('Active connector installation not found');
    try {
      return await this.prisma.integrationJob.create({
        data: {
          shopId,
          installationId,
          direction: dto.direction,
          jobType: dto.jobType.trim(),
          idempotencyKey: dto.idempotencyKey.trim(),
          payload: dto.payload as Prisma.InputJsonValue,
          maxAttempts: dto.maxAttempts ?? 8,
          correlationId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.integrationJob.findUnique({
          where: { shopId_installationId_idempotencyKey: { shopId, installationId, idempotencyKey: dto.idempotencyKey.trim() } },
        });
        if (existing && stableJson(existing.payload) === stableJson(dto.payload)) return existing;
        throw new ConflictException('Idempotency key was already used with a different integration payload');
      }
      throw error;
    }
  }

  async listJobs(actor: JwtAccessPayload, take = 50) {
    const shopId = await this.requireFeature(actor);
    const safeTake = Math.max(1, Math.min(200, take));
    const jobs = await this.prisma.integrationJob.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: safeTake,
    });
    return { jobs };
  }

  async retryJob(actor: JwtAccessPayload, id: string) {
    const shopId = await this.requireFeature(actor);
    const job = await this.prisma.integrationJob.findFirst({ where: { id, shopId } });
    if (!job) throw new NotFoundException('Integration job not found');
    if (job.status !== IntegrationJobStatus.DEAD && job.status !== IntegrationJobStatus.RETRY) {
      throw new ConflictException('Only retry/dead jobs can be requeued');
    }
    return this.prisma.integrationJob.update({
      where: { id },
      data: { status: IntegrationJobStatus.PENDING, nextAttemptAt: null, lastError: null, lastErrorCode: null },
    });
  }

  async createCredential(actor: JwtAccessPayload, dto: CreateIntegrationCredentialDto) {
    const shopId = await this.requireFeature(actor);
    const scopes = [...new Set(dto.scopes.map((scope) => scope.trim()).filter(Boolean))];
    if (!scopes.length) throw new BadRequestException('At least one API scope is required');
    const raw = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const row = await this.prisma.integrationCredential.create({
      data: {
        shopId,
        name: dto.name.trim(),
        tokenPrefix: raw.slice(0, 20),
        tokenHash: sha256(raw),
        scopes: scopes as Prisma.InputJsonValue,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: actor.sub,
      },
    });
    await this.audit.record(actor, {
      section: 'system',
      action: 'integration.credential_created',
      summary: `Created API credential ${row.name}`,
      meta: { credentialId: row.id, scopes },
    });
    return {
      id: row.id,
      name: row.name,
      token: raw,
      tokenPrefix: row.tokenPrefix,
      scopes,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      warning: 'Store this token now. GoSpots stores only its hash and cannot show it again.',
    };
  }

  async revokeCredential(actor: JwtAccessPayload, id: string) {
    const shopId = await this.requireFeature(actor);
    const result = await this.prisma.integrationCredential.updateMany({
      where: { id, shopId, active: true },
      data: { active: false, revokedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException('Active API credential not found');
    return { revoked: true };
  }

  async createWebhookEndpoint(actor: JwtAccessPayload, dto: CreateWebhookEndpointDto) {
    const shopId = await this.requireFeature(actor);
    this.assertSafeWebhookUrl(dto.url);
    const eventTypes = [...new Set(dto.eventTypes.map((event) => event.trim()).filter(Boolean))];
    if (!eventTypes.length) throw new BadRequestException('At least one event type is required');
    const secret = randomBytes(32).toString('base64url');
    const encrypted = this.secretBox.encrypt({ secret });
    const row = await this.prisma.webhookEndpoint.create({
      data: {
        shopId,
        name: dto.name.trim(),
        url: dto.url,
        eventTypes: eventTypes as Prisma.InputJsonValue,
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
        secretKeyVersion: encrypted.keyVersion,
        createdById: actor.sub,
      },
    });
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      eventTypes,
      signingSecret: secret,
      warning: 'Store this webhook secret now. It is encrypted and will not be returned again.',
    };
  }

  async fanOutDomainEvent(input: {
    shopId: string;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { shopId: input.shopId, active: true },
    });
    const deliveries = [];
    for (const endpoint of endpoints) {
      const events = Array.isArray(endpoint.eventTypes) ? endpoint.eventTypes.map(String) : [];
      if (!events.includes('*') && !events.includes(input.eventType)) continue;
      const payload = {
        id: input.eventId,
        type: input.eventType,
        occurredAt: new Date().toISOString(),
        data: input.payload,
      };
      deliveries.push(
        this.prisma.webhookDelivery.upsert({
          where: { endpointId_eventId: { endpointId: endpoint.id, eventId: input.eventId } },
          create: {
            shopId: input.shopId,
            endpointId: endpoint.id,
            eventId: input.eventId,
            eventType: input.eventType,
            payload: payload as Prisma.InputJsonValue,
            payloadHash: sha256(stableJson(payload)),
          },
          update: {},
        }),
      );
    }
    return Promise.all(deliveries);
  }

  async receiveSignedWebhook(input: {
    installationId: string;
    eventId: string;
    timestamp: string;
    signature: string;
    payload: Record<string, unknown>;
  }) {
    const timestampMs = Number(input.timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_WEBHOOK_SKEW_MS) {
      throw new ForbiddenException('Webhook timestamp outside replay window');
    }
    const installation = await this.prisma.connectorInstallation.findUnique({ where: { id: input.installationId } });
    if (!installation || installation.status === ConnectorInstallationStatus.DISABLED) {
      throw new NotFoundException('Connector installation not found');
    }
    const secrets = this.decryptInstallationSecrets(installation);
    const webhookSecret = typeof secrets?.webhookSecret === 'string' ? secrets.webhookSecret : '';
    if (!webhookSecret) throw new ForbiddenException('Connector webhook secret is not configured');
    const canonical = `${input.timestamp}.${input.eventId}.${stableJson(input.payload)}`;
    const expected = createHmac('sha256', webhookSecret).update(canonical).digest('hex');
    const actual = input.signature.trim().toLowerCase();
    if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
      throw new ForbiddenException('Invalid webhook signature');
    }
    const payloadHash = sha256(stableJson(input.payload));
    try {
      const receipt = await this.prisma.webhookReceipt.create({
        data: {
          shopId: installation.shopId,
          installationId: installation.id,
          provider: installation.provider,
          eventId: input.eventId,
          timestamp: new Date(timestampMs),
          payloadHash,
          signatureHash: sha256(actual),
          status: WebhookReceiptStatus.APPLIED,
          processedAt: new Date(),
        },
      });
      return { accepted: true, duplicate: false, receiptId: receipt.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.webhookReceipt.findUnique({
          where: { installationId_eventId: { installationId: installation.id, eventId: input.eventId } },
        });
        if (existing?.payloadHash !== payloadHash) {
          throw new ConflictException('Webhook event ID replayed with different payload');
        }
        return { accepted: true, duplicate: true, receiptId: existing?.id ?? null };
      }
      throw error;
    }
  }

  private assertSafeWebhookUrl(raw: string) {
    const url = new URL(raw);
    if (url.protocol !== 'https:') throw new BadRequestException('Webhook URL must use HTTPS');
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      throw new BadRequestException('Webhook URL cannot target a local/private address');
    }
  }

  @Interval(5_000)
  async processQueues() {
    if (this.workersRunning) return;
    this.workersRunning = true;
    try {
      await this.processIntegrationJobs();
      await this.processWebhookDeliveries();
    } finally {
      this.workersRunning = false;
    }
  }

  private async processIntegrationJobs() {
    const now = new Date();
    const candidates = await this.prisma.integrationJob.findMany({
      where: {
        status: { in: [IntegrationJobStatus.PENDING, IntegrationJobStatus.RETRY] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    for (const candidate of candidates) {
      const claim = await this.prisma.integrationJob.updateMany({
        where: {
          id: candidate.id,
          status: { in: [IntegrationJobStatus.PENDING, IntegrationJobStatus.RETRY] },
        },
        data: { status: IntegrationJobStatus.PROCESSING, lockedAt: new Date() },
      });
      if (claim.count !== 1) continue;
      const job = await this.prisma.integrationJob.findUnique({
        where: { id: candidate.id },
        include: { installation: true },
      });
      if (!job) continue;
      const attempt = job.attemptCount + 1;
      try {
        if (job.installation.status !== ConnectorInstallationStatus.ACTIVE) {
          throw new Error(`Connector status is ${job.installation.status}`);
        }
        const connector = this.registry.get(job.installation.provider);
        await connector.execute(
          {
            shopId: job.shopId,
            installationId: job.installationId,
            config: (job.installation.config as Record<string, unknown> | null) ?? {},
            secrets: this.decryptInstallationSecrets(job.installation),
          },
          {
            id: job.id,
            jobType: job.jobType,
            idempotencyKey: job.idempotencyKey,
            payload: job.payload,
            correlationId: job.correlationId,
          },
        );
        await this.prisma.integrationJob.update({
          where: { id: job.id },
          data: {
            status: IntegrationJobStatus.SUCCEEDED,
            attemptCount: attempt,
            completedAt: new Date(),
            lockedAt: null,
            lastError: null,
            lastErrorCode: null,
          },
        });
      } catch (error) {
        const dead = attempt >= job.maxAttempts;
        await this.prisma.integrationJob.update({
          where: { id: job.id },
          data: {
            status: dead ? IntegrationJobStatus.DEAD : IntegrationJobStatus.RETRY,
            attemptCount: attempt,
            nextAttemptAt: dead ? null : new Date(Date.now() + backoff(attempt)),
            lockedAt: null,
            lastErrorCode: 'CONNECTOR_EXECUTION_FAILED',
            lastError: (error instanceof Error ? error.message : 'Connector execution failed').slice(0, 1000),
          },
        });
      }
    }
  }

  private async processWebhookDeliveries() {
    const now = new Date();
    const candidates = await this.prisma.webhookDelivery.findMany({
      where: {
        status: { in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.RETRY] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      include: { endpoint: true },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    for (const delivery of candidates) {
      const claim = await this.prisma.webhookDelivery.updateMany({
        where: {
          id: delivery.id,
          status: { in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.RETRY] },
        },
        data: { status: WebhookDeliveryStatus.RETRY },
      });
      if (claim.count !== 1 || !delivery.endpoint.active) continue;
      const attempt = delivery.attemptCount + 1;
      try {
        this.assertSafeWebhookUrl(delivery.endpoint.url);
        const secret = this.secretBox.decrypt<{ secret: string }>({
          ciphertext: delivery.endpoint.secretCiphertext,
          iv: delivery.endpoint.secretIv,
          tag: delivery.endpoint.secretTag,
          keyVersion: delivery.endpoint.secretKeyVersion,
        }).secret;
        const timestamp = Date.now().toString();
        const body = stableJson(delivery.payload);
        const signature = createHmac('sha256', secret)
          .update(`${timestamp}.${delivery.eventId}.${body}`)
          .digest('hex');
        const response = await fetch(delivery.endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'GoSpots-Webhooks/1.0',
            'x-gospots-event-id': delivery.eventId,
            'x-gospots-timestamp': timestamp,
            'x-gospots-signature': signature,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: WebhookDeliveryStatus.SUCCEEDED,
            attemptCount: attempt,
            deliveredAt: new Date(),
            nextAttemptAt: null,
            lastStatusCode: response.status,
            lastError: null,
          },
        });
      } catch (error) {
        const dead = attempt >= WEBHOOK_MAX_ATTEMPTS;
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: dead ? WebhookDeliveryStatus.DEAD : WebhookDeliveryStatus.RETRY,
            attemptCount: attempt,
            nextAttemptAt: dead ? null : new Date(Date.now() + backoff(attempt)),
            lastError: (error instanceof Error ? error.message : 'Webhook delivery failed').slice(0, 1000),
          },
        });
      }
    }
  }
}
