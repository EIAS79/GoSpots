import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type CapacityRequest,
  GrowthCapacityService,
  type UnifiedBookingInput,
} from './growth-capacity.service';

@ApiTags('growth-public')
@Controller('growth/public')
export class GrowthPublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: GrowthCapacityService,
  ) {}

  @Get(':slug/capacity')
  async availability(
    @Param('slug') slug: string,
    @Query('startsAt') startsAt: string,
    @Query('endsAt') endsAt: string,
    @Query('partySize') partySize?: string,
    @Query('resourceId') resourceId?: string,
    @Query('resourceCategoryId') resourceCategoryId?: string,
    @Query('resourceType') resourceType?: string,
  ) {
    const shop = await this.requirePublishedShop(slug);
    return this.capacity.capacityForShop(shop.id, {
      startsAt,
      endsAt,
      partySize: partySize ? Number(partySize) : undefined,
      resourceId,
      resourceCategoryId,
      resourceType,
    });
  }

  @Post(':slug/reservations')
  async create(
    @Param('slug') slug: string,
    @Body() dto: Omit<UnifiedBookingInput, 'sourceChannel'> & { sourceChannel?: string },
  ) {
    const shop = await this.requirePublishedShop(slug);
    return this.capacity.createPublic(shop.id, {
      ...dto,
      sourceChannel: dto.sourceChannel?.trim() || 'PUBLIC_WEB',
    });
  }

  @Post(':slug/reservations/:id/reschedule')
  async reschedule(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: CapacityRequest & { guestToken: string },
  ) {
    const shop = await this.requirePublishedShop(slug);
    if (!dto.guestToken?.trim()) throw new BadRequestException('guestToken is required.');
    return this.capacity.reschedulePublic(shop.id, id, dto.guestToken, dto);
  }

  @Post(':slug/reservations/:id/cancel')
  async cancel(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: { guestToken: string; reason?: string },
  ) {
    const shop = await this.requirePublishedShop(slug);
    if (!dto.guestToken?.trim()) throw new BadRequestException('guestToken is required.');
    return this.capacity.cancelPublic(shop.id, id, dto.guestToken, dto.reason);
  }

  @Post(':slug/waitlist')
  async waitlist(
    @Param('slug') slug: string,
    @Body()
    dto: {
      resourceId?: string;
      guestName: string;
      guestEmail?: string;
      guestPhone?: string;
      partySize?: number;
      desiredStartsAt: string;
      desiredEndsAt: string;
      note?: string;
    },
  ) {
    const shop = await this.requirePublishedShop(slug);
    if (!dto.guestName?.trim()) throw new BadRequestException('Guest name is required.');
    const desiredStartsAt = new Date(dto.desiredStartsAt);
    const desiredEndsAt = new Date(dto.desiredEndsAt);
    if (
      Number.isNaN(desiredStartsAt.getTime()) ||
      Number.isNaN(desiredEndsAt.getTime()) ||
      desiredEndsAt <= desiredStartsAt
    ) {
      throw new BadRequestException('Invalid waitlist time window.');
    }
    const partySize = dto.partySize ?? 1;
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 500) {
      throw new BadRequestException('partySize must be between 1 and 500.');
    }
    if (dto.resourceId) {
      const resource = await this.prisma.resource.findFirst({
        where: { id: dto.resourceId, shopId: shop.id },
        select: { id: true },
      });
      if (!resource) throw new BadRequestException('Resource not found.');
    }
    return this.prisma.reservationWaitlistEntry.create({
      data: {
        shopId: shop.id,
        resourceId: dto.resourceId ?? null,
        guestName: dto.guestName.trim(),
        guestEmail: dto.guestEmail?.trim() || null,
        guestPhone: dto.guestPhone?.trim() || null,
        partySize,
        desiredStartsAt,
        desiredEndsAt,
        priority: 0,
        status: 'WAITING',
        note: dto.note?.trim() || null,
      },
    });
  }

  private async requirePublishedShop(slug: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, slug: true },
    });
    if (!shop) throw new NotFoundException('Venue not found.');
    return shop;
  }
}
