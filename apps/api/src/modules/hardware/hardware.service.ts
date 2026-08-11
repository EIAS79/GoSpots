import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CustomerDisplayStatus,
  DeviceStatus,
  DeviceType,
  Prisma,
  PrintJobStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { EdgeHubService } from '../edge-hub/edge-hub.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import {
  BindCustomerDisplayDto,
  CompletePrintJobDto,
  ConfigurePrinterDto,
  CreatePrintJobDto,
  CreatePrintRouteDto,
  UpdateCustomerDisplaySnapshotDto,
  UpsertBarcodeAliasDto,
} from './dto/hardware.dto';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

@Injectable()
export class HardwareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly audit: AuditService,
    private readonly edge: EdgeHubService,
  ) {}

  private async requireRegistry(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'device_registry'))) {
      throw new ForbiddenException('Device registry is not enabled for this venue');
    }
  }

  private async requirePrinter(shopId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        shopId,
        type: DeviceType.PRINTER,
        status: DeviceStatus.ACTIVE,
      },
    });
    if (!device) throw new NotFoundException('Active printer device not found');
    return device;
  }

  async overview(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const [printers, routes, recentJobs, displays, barcodes] = await Promise.all([
      this.prisma.printerDeviceConfiguration.findMany({
        where: { shopId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.printRoute.findMany({
        where: { shopId },
        orderBy: [{ jobType: 'asc' }, { priority: 'asc' }],
      }),
      this.prisma.printJob.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.customerDisplayBinding.findMany({
        where: { shopId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.barcodeAlias.count({ where: { shopId } }),
    ]);
    return { printers, routes, recentJobs, displays, barcodeAliasCount: barcodes };
  }

  async configurePrinter(actor: JwtAccessPayload, dto: ConfigurePrinterDto) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    await this.requirePrinter(shopId, dto.deviceId);
    if (dto.paperWidthMm && ![58, 80, 112].includes(dto.paperWidthMm)) {
      throw new BadRequestException('Supported paper widths are 58, 80 or 112 mm');
    }
    const row = await this.prisma.printerDeviceConfiguration.upsert({
      where: { deviceId: dto.deviceId },
      create: {
        shopId,
        deviceId: dto.deviceId,
        adapter: dto.adapter.trim().toLowerCase(),
        host: dto.host?.trim() || null,
        port: dto.port ?? null,
        paperWidthMm: dto.paperWidthMm ?? 80,
        capabilities: dto.capabilities as Prisma.InputJsonValue | undefined,
      },
      update: {
        adapter: dto.adapter.trim().toLowerCase(),
        host: dto.host?.trim() || null,
        port: dto.port ?? null,
        ...(dto.paperWidthMm ? { paperWidthMm: dto.paperWidthMm } : {}),
        ...(dto.capabilities !== undefined
          ? { capabilities: dto.capabilities as Prisma.InputJsonValue }
          : {}),
        enabled: true,
        lastError: null,
      },
    });
    await this.audit.record(actor, {
      section: 'system',
      action: 'hardware.printer_configured',
      summary: 'Configured printer device',
      meta: { deviceId: dto.deviceId, adapter: row.adapter },
    });
    return row;
  }

  async createRoute(actor: JwtAccessPayload, dto: CreatePrintRouteDto) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    await this.requirePrinter(shopId, dto.printerDeviceId);
    const configured = await this.prisma.printerDeviceConfiguration.findFirst({
      where: { shopId, deviceId: dto.printerDeviceId, enabled: true },
    });
    if (!configured) throw new ConflictException('Printer must be configured before it can receive routes');
    return this.prisma.printRoute.create({
      data: {
        shopId,
        name: dto.name.trim(),
        jobType: dto.jobType,
        sourceKey: dto.sourceKey?.trim() || null,
        printerDeviceId: dto.printerDeviceId,
        priority: dto.priority ?? 100,
      },
    });
  }

  private async resolveRoute(shopId: string, dto: CreatePrintJobDto) {
    const exact = dto.sourceKey
      ? await this.prisma.printRoute.findFirst({
          where: {
            shopId,
            jobType: dto.type,
            sourceKey: dto.sourceKey.trim(),
            enabled: true,
          },
          orderBy: { priority: 'asc' },
        })
      : null;
    const route =
      exact ??
      (await this.prisma.printRoute.findFirst({
        where: { shopId, jobType: dto.type, sourceKey: null, enabled: true },
        orderBy: { priority: 'asc' },
      }));
    if (!route) throw new NotFoundException(`No print route configured for ${dto.type}`);
    const printer = await this.prisma.printerDeviceConfiguration.findFirst({
      where: { shopId, deviceId: route.printerDeviceId, enabled: true },
    });
    if (!printer) throw new ConflictException('Print route points to an unavailable printer');
    return { route, printer };
  }

  async createPrintJob(actor: JwtAccessPayload, dto: CreatePrintJobDto) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const { route } = await this.resolveRoute(shopId, dto);
    try {
      const job = await this.prisma.printJob.create({
        data: {
          shopId,
          type: dto.type,
          routeId: route.id,
          printerDeviceId: route.printerDeviceId,
          sourceType: dto.sourceType.trim(),
          sourceId: dto.sourceId.trim(),
          payload: dto.payload as Prisma.InputJsonValue,
          dedupeKey: dto.dedupeKey.trim(),
          fiscalSemanticKey: dto.fiscalSemanticKey?.trim() || null,
          maxAttempts: dto.maxAttempts ?? 5,
          createdById: actor.sub,
        },
      });
      return job;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const byDedupe = await this.prisma.printJob.findUnique({
          where: { shopId_dedupeKey: { shopId, dedupeKey: dto.dedupeKey.trim() } },
        });
        if (byDedupe) {
          const same =
            byDedupe.type === dto.type &&
            byDedupe.sourceType === dto.sourceType.trim() &&
            byDedupe.sourceId === dto.sourceId.trim() &&
            canonicalJson(byDedupe.payload) === canonicalJson(dto.payload);
          if (same) return byDedupe;
          throw new ConflictException('Print dedupe key was reused with different content');
        }
        if (dto.fiscalSemanticKey) {
          throw new ConflictException(
            'A print job already exists for this fiscal semantic document; retry the existing job instead of creating another',
          );
        }
      }
      throw error;
    }
  }

  async retryPrintJob(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const job = await this.prisma.printJob.findFirst({ where: { id, shopId } });
    if (!job) throw new NotFoundException('Print job not found');
    if (job.status !== PrintJobStatus.FAILED) {
      throw new ConflictException('Only failed print jobs can be retried');
    }
    return this.prisma.printJob.update({
      where: { id },
      data: {
        status: PrintJobStatus.QUEUED,
        claimedByEdgeDeviceId: null,
        claimedAt: null,
        printingAt: null,
        lastErrorCode: null,
        lastError: null,
      },
    });
  }

  async edgeClaim(
    headers: Record<string, string | string[] | undefined>,
  ) {
    const { device } = await this.edge.authenticateSignedRequest(
      headers,
      'POST',
      '/hardware/edge/print-jobs/claim',
      {},
    );
    const candidate = await this.prisma.printJob.findFirst({
      where: {
        shopId: device.shopId,
        status: PrintJobStatus.QUEUED,
        attemptCount: { lt: 10 },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) return { job: null };
    const claim = await this.prisma.printJob.updateMany({
      where: { id: candidate.id, status: PrintJobStatus.QUEUED },
      data: {
        status: PrintJobStatus.CLAIMED,
        claimedByEdgeDeviceId: device.id,
        claimedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    if (claim.count !== 1) return { job: null };
    const [job, printer] = await Promise.all([
      this.prisma.printJob.findUnique({ where: { id: candidate.id } }),
      this.prisma.printerDeviceConfiguration.findUnique({
        where: { deviceId: candidate.printerDeviceId },
      }),
    ]);
    if (!job || !printer) return { job: null };
    return {
      job: {
        id: job.id,
        type: job.type,
        payload: job.payload,
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        attempt: job.attemptCount,
        printer: {
          deviceId: printer.deviceId,
          adapter: printer.adapter,
          host: printer.host,
          port: printer.port,
          paperWidthMm: printer.paperWidthMm,
          capabilities: printer.capabilities,
        },
      },
    };
  }

  async edgeMarkPrinting(
    headers: Record<string, string | string[] | undefined>,
    jobId: string,
  ) {
    const { device } = await this.edge.authenticateSignedRequest(
      headers,
      'POST',
      `/hardware/edge/print-jobs/${jobId}/printing`,
      {},
    );
    const result = await this.prisma.printJob.updateMany({
      where: {
        id: jobId,
        shopId: device.shopId,
        claimedByEdgeDeviceId: device.id,
        status: PrintJobStatus.CLAIMED,
      },
      data: { status: PrintJobStatus.PRINTING, printingAt: new Date() },
    });
    if (result.count !== 1) throw new ConflictException('Print job is not claimed by this Edge Hub');
    return { ok: true };
  }

  async edgeComplete(
    headers: Record<string, string | string[] | undefined>,
    jobId: string,
    dto: CompletePrintJobDto,
  ) {
    const { device } = await this.edge.authenticateSignedRequest(
      headers,
      'POST',
      `/hardware/edge/print-jobs/${jobId}/complete`,
      dto,
    );
    if (![PrintJobStatus.SUCCEEDED, PrintJobStatus.FAILED].includes(dto.status)) {
      throw new BadRequestException('Edge may only complete a print as SUCCEEDED or FAILED');
    }
    const job = await this.prisma.printJob.findFirst({
      where: {
        id: jobId,
        shopId: device.shopId,
        claimedByEdgeDeviceId: device.id,
        status: { in: [PrintJobStatus.CLAIMED, PrintJobStatus.PRINTING] },
      },
    });
    if (!job) throw new ConflictException('Print job is not active on this Edge Hub');
    const terminalFailure = dto.status === PrintJobStatus.FAILED && job.attemptCount >= job.maxAttempts;
    const nextStatus =
      dto.status === PrintJobStatus.SUCCEEDED
        ? PrintJobStatus.SUCCEEDED
        : terminalFailure
          ? PrintJobStatus.FAILED
          : PrintJobStatus.QUEUED;
    await this.prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: nextStatus,
        printedAt: dto.status === PrintJobStatus.SUCCEEDED ? new Date() : null,
        claimedByEdgeDeviceId: nextStatus === PrintJobStatus.QUEUED ? null : device.id,
        claimedAt: nextStatus === PrintJobStatus.QUEUED ? null : job.claimedAt,
        printingAt: null,
        lastErrorCode: dto.status === PrintJobStatus.FAILED ? dto.errorCode?.trim() || 'PRINT_FAILED' : null,
        lastError: dto.status === PrintJobStatus.FAILED ? dto.error?.trim().slice(0, 1000) || 'Printer reported failure' : null,
      },
    });
    return { ok: true, status: nextStatus };
  }

  async bindCustomerDisplay(actor: JwtAccessPayload, dto: BindCustomerDisplayDto) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const display = await this.prisma.device.findFirst({
      where: {
        id: dto.displayDeviceId,
        shopId,
        type: DeviceType.CUSTOMER_DISPLAY,
        status: DeviceStatus.ACTIVE,
      },
    });
    if (!display) throw new NotFoundException('Active customer display device not found');
    if (dto.posDeviceId) {
      const pos = await this.prisma.device.findFirst({
        where: { id: dto.posDeviceId, shopId, type: DeviceType.POS, status: DeviceStatus.ACTIVE },
      });
      if (!pos) throw new NotFoundException('Active POS device not found');
    }
    const rawToken = `gspd_${randomBytes(32).toString('base64url')}`;
    const row = await this.prisma.customerDisplayBinding.upsert({
      where: { displayDeviceId: dto.displayDeviceId },
      create: {
        shopId,
        displayDeviceId: dto.displayDeviceId,
        displayTokenHash: sha256(rawToken),
        posDeviceId: dto.posDeviceId ?? null,
      },
      update: {
        displayTokenHash: sha256(rawToken),
        posDeviceId: dto.posDeviceId ?? null,
        status: CustomerDisplayStatus.IDLE,
        snapshot: Prisma.JsonNull,
        activeCheckId: null,
      },
    });
    return {
      id: row.id,
      displayDeviceId: row.displayDeviceId,
      posDeviceId: row.posDeviceId,
      token: rawToken,
      warning: 'Store this display token on the display device. It is shown only on pairing.',
    };
  }

  async updateDisplaySnapshot(
    actor: JwtAccessPayload,
    bindingId: string,
    dto: UpdateCustomerDisplaySnapshotDto,
  ) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const result = await this.prisma.customerDisplayBinding.updateMany({
      where: { id: bindingId, shopId },
      data: {
        status: dto.status,
        activeCheckId: dto.activeCheckId?.trim() || null,
        snapshot: dto.snapshot as Prisma.InputJsonValue,
      },
    });
    if (result.count !== 1) throw new NotFoundException('Customer display binding not found');
    return { updated: true };
  }

  async customerDisplayFeed(authorization?: string) {
    const match = /^Bearer\s+(gspd_[A-Za-z0-9_-]+)$/.exec(authorization ?? '');
    if (!match) throw new UnauthorizedException('Customer display bearer token required');
    const tokenHash = sha256(match[1]);
    const row = await this.prisma.customerDisplayBinding.findUnique({
      where: { displayTokenHash: tokenHash },
    });
    if (!row || row.status === CustomerDisplayStatus.DISABLED) {
      throw new UnauthorizedException('Customer display token is invalid');
    }
    await this.prisma.customerDisplayBinding.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date() },
    });
    return {
      status: row.status,
      activeCheckId: row.activeCheckId,
      snapshot: row.snapshot ?? {},
      serverTime: new Date().toISOString(),
    };
  }

  async upsertBarcode(actor: JwtAccessPayload, dto: UpsertBarcodeAliasDto) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const barcode = dto.barcode.trim();
    return this.prisma.barcodeAlias.upsert({
      where: { shopId_barcode: { shopId, barcode } },
      create: {
        shopId,
        barcode,
        entityType: dto.entityType.trim(),
        entityId: dto.entityId.trim(),
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      update: {
        entityType: dto.entityType.trim(),
        entityId: dto.entityId.trim(),
        ...(dto.metadata !== undefined ? { metadata: dto.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async resolveBarcode(actor: JwtAccessPayload, barcode: string) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const row = await this.prisma.barcodeAlias.findUnique({
      where: { shopId_barcode: { shopId, barcode: barcode.trim() } },
    });
    if (!row) throw new NotFoundException('Barcode is not mapped');
    return row;
  }
}
