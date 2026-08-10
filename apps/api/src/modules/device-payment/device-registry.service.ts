import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeviceStatus, DeviceType, Prisma } from '@prisma/client';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import { normalizePaymentProvider } from './connectors/payment-connector.registry';
import { CreateDeviceDto, UpdateDeviceDto } from './dto/device.dto';

const ONLINE_WINDOW_MS = 90 * 1000;

@Injectable()
export class DeviceRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
  ) {}

  private async requireRegistry(shopId: string) {
    if (!(await this.flags.isFeatureEnabled(shopId, 'device_registry'))) {
      throw new ForbiddenException('Device registry is not enabled for this venue');
    }
  }

  private serialize(device: any) {
    const lastSeenAt: Date | null = device.lastSeenAt ?? null;
    const online =
      device.status === DeviceStatus.ACTIVE &&
      lastSeenAt != null &&
      Date.now() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS;
    return {
      id: device.id,
      label: device.label,
      type: device.type,
      provider: device.terminal?.provider ?? device.provider ?? null,
      status: device.status,
      online,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      metadata: device.metadata ?? null,
      terminal: device.terminal
        ? {
            id: device.terminal.id,
            provider: device.terminal.provider,
            externalTerminalId: device.terminal.externalTerminalId,
            capabilities: device.terminal.capabilities ?? null,
            enabled: device.terminal.enabled,
          }
        : null,
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    };
  }

  async list(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const devices = await this.prisma.device.findMany({
      where: { shopId },
      include: { terminal: true },
      orderBy: [{ type: 'asc' }, { label: 'asc' }],
    });
    return { devices: devices.map((device) => this.serialize(device)) };
  }

  async create(actor: JwtAccessPayload, dto: CreateDeviceDto) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const provider = dto.provider ? normalizePaymentProvider(dto.provider) : null;
    if (dto.type === DeviceType.PAYMENT_TERMINAL && !provider) {
      throw new BadRequestException('Payment terminal provider is required');
    }
    if (dto.type !== DeviceType.PAYMENT_TERMINAL && dto.externalTerminalId) {
      throw new BadRequestException('externalTerminalId is only valid for payment terminals');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          shopId,
          label: dto.label.trim(),
          type: dto.type,
          provider,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      if (dto.type === DeviceType.PAYMENT_TERMINAL && provider) {
        await tx.paymentTerminal.create({
          data: {
            shopId,
            deviceId: device.id,
            provider,
            externalTerminalId: dto.externalTerminalId?.trim() || null,
            capabilities: dto.capabilities as Prisma.InputJsonValue | undefined,
          },
        });
      }
      return tx.device.findFirst({
        where: { id: device.id, shopId },
        include: { terminal: true },
      });
    });
    if (!created) throw new NotFoundException('Device not found after creation');
    return this.serialize(created);
  }

  async update(actor: JwtAccessPayload, id: string, dto: UpdateDeviceDto) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const existing = await this.prisma.device.findFirst({
      where: { id, shopId },
      include: { terminal: true },
    });
    if (!existing) throw new NotFoundException('Device not found');
    const provider =
      dto.provider !== undefined
        ? normalizePaymentProvider(dto.provider)
        : (existing.terminal?.provider ?? existing.provider ?? null);
    if (existing.type === DeviceType.PAYMENT_TERMINAL && !provider) {
      throw new BadRequestException('Payment terminal provider is required');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: existing.id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.provider !== undefined ? { provider } : {}),
          ...(dto.metadata !== undefined
            ? { metadata: dto.metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
      if (existing.type === DeviceType.PAYMENT_TERMINAL && existing.terminal) {
        await tx.paymentTerminal.update({
          where: { id: existing.terminal.id },
          data: {
            ...(dto.provider !== undefined && provider ? { provider } : {}),
            ...(dto.externalTerminalId !== undefined
              ? { externalTerminalId: dto.externalTerminalId.trim() || null }
              : {}),
            ...(dto.terminalEnabled !== undefined ? { enabled: dto.terminalEnabled } : {}),
            ...(dto.capabilities !== undefined
              ? { capabilities: dto.capabilities as Prisma.InputJsonValue }
              : {}),
          },
        });
      }
      return tx.device.findFirst({
        where: { id: existing.id, shopId },
        include: { terminal: true },
      });
    });
    if (!updated) throw new NotFoundException('Device not found after update');
    return this.serialize(updated);
  }

  async heartbeat(actor: JwtAccessPayload, id: string) {
    const shopId = requireShopId(actor);
    await this.requireRegistry(shopId);
    const result = await this.prisma.device.updateMany({
      where: { id, shopId, status: DeviceStatus.ACTIVE },
      data: { lastSeenAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException('Active device not found');
    const device = await this.prisma.device.findFirst({
      where: { id, shopId },
      include: { terminal: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    return this.serialize(device);
  }
}
