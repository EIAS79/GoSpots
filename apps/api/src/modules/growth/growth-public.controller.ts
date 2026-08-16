import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { isCaptchaEscalated } from '../../common/captcha-escalation.util';
import {
  assertCaptchaOrThrow,
  CAPTCHA_TOKEN_HEADER,
  readCaptchaToken,
} from '../../common/captcha.util';
import { publicThrottle } from '../../common/throttle.config';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';
import {
  type CapacityRequest,
  GrowthCapacityService,
  type UnifiedBookingInput,
} from './growth-capacity.service';

type PublicBookingInput = Omit<UnifiedBookingInput, 'sourceChannel'> & {
  sourceChannel?: string;
  captchaToken?: string;
};

type PublicWaitlistInput = {
  resourceId?: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  partySize?: number;
  desiredStartsAt: string;
  desiredEndsAt: string;
  note?: string;
  captchaToken?: string;
};

@ApiTags('growth-public')
@Public()
@Controller('growth/public')
export class GrowthPublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: GrowthCapacityService,
  ) {}

  private async assertBookingCaptcha(
    req: Request,
    bodyToken?: string,
    headerToken?: string,
  ) {
    const ip = req.ip ?? '';
    await assertCaptchaOrThrow({
      token: readCaptchaToken({ bodyToken, headerToken }),
      remoteIp: ip,
      escalated: isCaptchaEscalated(ip, 'booking'),
    });
  }

  private assertRequiredContact(input: {
    guestEmail?: string;
    guestPhone?: string;
  }) {
    if (!input.guestEmail?.trim() && !input.guestPhone?.trim()) {
      throw new BadRequestException(
        'A guest email address or phone number is required.',
      );
    }
  }

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

  @Throttle(publicThrottle('booking'))
  @Post(':slug/reservations')
  async create(
    @Param('slug') slug: string,
    @Body() dto: PublicBookingInput,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertBookingCaptcha(req, dto.captchaToken, captchaHeader);
    this.assertRequiredContact(dto);
    const shop = await this.requirePublishedShop(slug);
    const activePolicy = await this.prisma.reservationPolicy.findFirst({
      where: { shopId: shop.id, active: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const created = await this.capacity.createPublic(shop.id, {
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      partySize: dto.partySize,
      resourceId: dto.resourceId,
      resourceCategoryId: dto.resourceCategoryId,
      resourceType: dto.resourceType,
      guestName: dto.guestName,
      guestEmail: dto.guestEmail,
      guestPhone: dto.guestPhone,
      notes: dto.notes,
      recurrence: dto.recurrence,
      sourceChannel: dto.sourceChannel?.trim() || 'PUBLIC_WEB',
    });

    if (!activePolicy || created.reservations.length === 0) return created;

    const policySnapshot = {
      name: activePolicy.name,
      depositKind: activePolicy.depositKind,
      depositFixedMinor: activePolicy.depositFixedMinor,
      depositPercentBps: activePolicy.depositPercentBps,
      cancellationWindowMinutes: activePolicy.cancellationWindowMinutes,
      lateCancelForfeitPercent: activePolicy.lateCancelForfeitPercent,
      noShowForfeitPercent: activePolicy.noShowForfeitPercent,
      capturedAt: new Date().toISOString(),
      source: 'PUBLIC_BOOKING_ACTIVE_POLICY',
    } as Prisma.InputJsonValue;
    const reservationIds = created.reservations.map((row) => row.reservationId);

    try {
      await this.prisma.$transaction(
        reservationIds.map((reservationId) =>
          this.prisma.reservationExtension.upsert({
            where: { reservationId },
            create: {
              shopId: shop.id,
              reservationId,
              policyId: activePolicy.id,
              policySnapshot,
            },
            update: {
              policyId: activePolicy.id,
              policySnapshot,
            },
          }),
        ),
      );
    } catch (error) {
      // Do not return a public confirmation with a missing deposit-policy snapshot.
      // These rows are brand new and have not been exposed to the caller yet, so
      // compensate the booking creation if policy persistence fails.
      await this.prisma.$transaction([
        this.prisma.reservationBookingEvidence.deleteMany({
          where: { shopId: shop.id, reservationId: { in: reservationIds } },
        }),
        this.prisma.reservation.deleteMany({
          where: { shopId: shop.id, id: { in: reservationIds } },
        }),
      ]);
      throw error;
    }

    return created;
  }

  @Throttle(publicThrottle('booking'))
  @Post(':slug/reservations/:id/reschedule')
  async reschedule(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: CapacityRequest & { guestToken: string },
  ) {
    const shop = await this.requirePublishedShop(slug);
    if (!dto.guestToken?.trim()) {
      throw new BadRequestException('guestToken is required.');
    }
    return this.capacity.reschedulePublic(shop.id, id, dto.guestToken, dto);
  }

  @Throttle(publicThrottle('booking'))
  @Post(':slug/reservations/:id/cancel')
  async cancel(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: { guestToken: string; reason?: string },
  ) {
    const shop = await this.requirePublishedShop(slug);
    if (!dto.guestToken?.trim()) {
      throw new BadRequestException('guestToken is required.');
    }
    return this.capacity.cancelPublic(shop.id, id, dto.guestToken, dto.reason);
  }

  @Throttle(publicThrottle('booking'))
  @Post(':slug/waitlist')
  async waitlist(
    @Param('slug') slug: string,
    @Body() dto: PublicWaitlistInput,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertBookingCaptcha(req, dto.captchaToken, captchaHeader);
    this.assertRequiredContact(dto);
    const shop = await this.requirePublishedShop(slug);
    if (!dto.guestName?.trim()) {
      throw new BadRequestException('Guest name is required.');
    }
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
