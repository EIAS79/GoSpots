import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import type {
  MenuPresentationDto,
  MenuServiceModePolicyDto,
  ModifierAvailabilityDto,
  PrepStationTimerPolicyDto,
} from './dto/restaurant-operations.dto';

@Injectable()
export class RestaurantConfigurationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async setServiceModePolicy(actor: JwtAccessPayload, dto: MenuServiceModePolicyDto) {
    const shopId = requireShopId(actor);
    await this.requireMenuItem(shopId, dto.menuItemId);
    const row = await this.prisma.$transaction(async (tx) => {
      const policy = await tx.menuServiceModePolicy.upsert({
        where: { shopId_menuItemId_serviceMode: { shopId, menuItemId: dto.menuItemId, serviceMode: dto.serviceMode } },
        create: { shopId, menuItemId: dto.menuItemId, serviceMode: dto.serviceMode, enabled: dto.enabled, updatedById: actor.sub },
        update: { enabled: dto.enabled, updatedById: actor.sub },
      });
      await this.emitAvailability(tx, shopId, dto.menuItemId, 'ITEM_SERVICE_MODE', { serviceMode: dto.serviceMode, enabled: dto.enabled });
      return policy;
    });
    await this.audit.record(actor, {
      section: 'menu',
      action: 'menu.service_mode_availability',
      summary: `${dto.enabled ? 'Enabled' : 'Disabled'} item for ${dto.serviceMode}`,
      meta: { menuItemId: dto.menuItemId, serviceMode: dto.serviceMode, enabled: dto.enabled },
    });
    return row;
  }

  async setPresentation(actor: JwtAccessPayload, dto: MenuPresentationDto) {
    const shopId = requireShopId(actor);
    await this.requireMenuItem(shopId, dto.menuItemId);
    const row = await this.prisma.restaurantMenuPresentation.upsert({
      where: { shopId_menuItemId: { shopId, menuItemId: dto.menuItemId } },
      create: {
        shopId,
        menuItemId: dto.menuItemId,
        customerName: dto.customerName?.trim() || null,
        kitchenName: dto.kitchenName?.trim() || null,
        expectedRestockAt: dto.expectedRestockAt ? new Date(dto.expectedRestockAt) : null,
        updatedById: actor.sub,
      },
      update: {
        customerName: dto.customerName !== undefined ? dto.customerName.trim() || null : undefined,
        kitchenName: dto.kitchenName !== undefined ? dto.kitchenName.trim() || null : undefined,
        expectedRestockAt: dto.expectedRestockAt !== undefined ? new Date(dto.expectedRestockAt) : undefined,
        updatedById: actor.sub,
      },
    });
    await this.audit.record(actor, { section: 'menu', action: 'menu.restaurant_presentation', summary: 'Updated customer/kitchen menu presentation', meta: { menuItemId: dto.menuItemId, expectedRestockAt: dto.expectedRestockAt } });
    return row;
  }

  async setModifierAvailability(actor: JwtAccessPayload, dto: ModifierAvailabilityDto) {
    const shopId = requireShopId(actor);
    const modifier = await this.prisma.menuModifier.findFirst({ where: { id: dto.modifierId, shopId } });
    if (!modifier) throw new NotFoundException('Modifier not found.');
    const row = await this.prisma.$transaction(async (tx) => {
      const availability = await tx.menuModifierAvailability.upsert({
        where: { shopId_modifierId: { shopId, modifierId: dto.modifierId } },
        create: {
          shopId,
          modifierId: dto.modifierId,
          available: dto.available,
          reason: dto.reason?.trim() || null,
          expectedRestockAt: dto.expectedRestockAt ? new Date(dto.expectedRestockAt) : null,
          updatedById: actor.sub,
        },
        update: {
          available: dto.available,
          reason: dto.reason !== undefined ? dto.reason.trim() || null : undefined,
          expectedRestockAt: dto.expectedRestockAt !== undefined ? new Date(dto.expectedRestockAt) : undefined,
          updatedById: actor.sub,
        },
      });
      await this.emitAvailability(tx, shopId, dto.modifierId, 'MODIFIER', { available: dto.available, expectedRestockAt: dto.expectedRestockAt ?? null });
      return availability;
    });
    await this.audit.record(actor, { section: 'menu', action: 'menu.modifier_availability', summary: `${dto.available ? 'Re-enabled' : '86’d'} modifier ${modifier.name}`, meta: { modifierId: dto.modifierId, reason: dto.reason, expectedRestockAt: dto.expectedRestockAt } });
    return row;
  }

  async setTimerPolicy(actor: JwtAccessPayload, dto: PrepStationTimerPolicyDto) {
    if (dto.warningPct >= dto.overduePct) throw new BadRequestException('warningPct must be lower than overduePct.');
    const shopId = requireShopId(actor);
    const station = await this.prisma.prepStation.findFirst({ where: { id: dto.stationId, shopId, active: true } });
    if (!station) throw new NotFoundException('Prep station not found.');
    const row = await this.prisma.prepStationTimerPolicy.upsert({
      where: { shopId_stationId: { shopId, stationId: dto.stationId } },
      create: { shopId, stationId: dto.stationId, warningPct: dto.warningPct, overduePct: dto.overduePct, updatedById: actor.sub },
      update: { warningPct: dto.warningPct, overduePct: dto.overduePct, updatedById: actor.sub },
    });
    await this.audit.record(actor, { section: 'operations', action: 'kds.timer_policy', summary: `Configured KDS timer thresholds for ${station.name}`, meta: { stationId: station.id, warningPct: dto.warningPct, overduePct: dto.overduePct } });
    return row;
  }

  private async requireMenuItem(shopId: string, menuItemId: string) {
    const item = await this.prisma.menuItem.findFirst({ where: { id: menuItemId, shopId } });
    if (!item) throw new NotFoundException('Menu item not found.');
    return item;
  }

  private emitAvailability(tx: Prisma.TransactionClient, shopId: string, aggregateId: string, kind: string, state: Record<string, unknown>) {
    return tx.domainEventOutbox.create({
      data: {
        shopId,
        aggregateType: 'RESTAURANT_MENU_AVAILABILITY',
        aggregateId,
        eventType: 'restaurant.menu_availability.changed.v1',
        payload: { schemaVersion: 1, kind, ...state } as Prisma.InputJsonValue,
      },
    });
  }
}
