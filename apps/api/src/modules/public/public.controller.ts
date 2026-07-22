import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { isCaptchaEscalated } from '../../common/captcha-escalation.util';
import {
  assertCaptchaOrThrow,
  CAPTCHA_TOKEN_HEADER,
  readCaptchaToken,
} from '../../common/captcha.util';
import {
  publicThrottle,
  type PublicThrottleKind,
} from '../../common/throttle.config';
import { Public } from '../auth/decorators/public.decorator';
import {
  CreatePublicContactDto,
  CreatePublicGuestChatDto,
  CreatePublicReviewDto,
  GuestChatMessageDto,
} from '../guest/dto/guest.dto';
import { ContactMessagesService } from '../guest/contact.service';
import { GuestChatService } from '../guest/guest-chat.service';
import { VenueReviewsService } from '../guest/venue-reviews.service';
import { CreatePublicEventRequestDto } from '../reservations/dto/event-requests.dto';
import { ScheduleQueryDto } from '../reservations/dto/reservations.dto';
import { EventRequestsService } from '../reservations/event-requests.service';
import { ReservationsService } from '../reservations/reservations.service';
import {
  CreatePublicDiningReservationDto,
  CreatePublicGamingReservationDto,
} from '../guest/dto/public-gaming.dto';
import { CurrencyRatesService } from '../shop/currency-rates.service';
import { ShopService } from '../shop/shop.service';
import { GuestDsarDto } from '../gdpr/dto/gdpr.dto';
import { GdprService } from '../gdpr/gdpr.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly shop: ShopService,
    private readonly rates: CurrencyRatesService,
    private readonly eventRequests: EventRequestsService,
    private readonly reservations: ReservationsService,
    private readonly reviews: VenueReviewsService,
    private readonly contact: ContactMessagesService,
    private readonly guestChats: GuestChatService,
    private readonly gdpr: GdprService,
  ) {}

  /**
   * No-op when CAPTCHA_PROVIDER=off (default).
   * With provider on + mode=after_throttle, requires token after public-create 429
   * (in-memory escalation map via CaptchaAwareThrottlerGuard).
   */
  private async assertCreateCaptcha(
    req: Request,
    surface: PublicThrottleKind,
    bodyToken: string | undefined,
    headerToken?: string,
  ) {
    const ip = req.ip ?? '';
    await assertCaptchaOrThrow({
      token: readCaptchaToken({ bodyToken, headerToken }),
      remoteIp: ip,
      escalated: isCaptchaEscalated(ip, surface),
    });
  }

  @Public()
  @Get('currency/rate')
  async currencyRate(
    @Query('from') from = 'EUR',
    @Query('to') to = 'USD',
  ) {
    const { rate, ratesAt } = await this.rates.getRate(from, to, {
      forceRefresh: false,
    });
    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate,
      ratesAt,
    };
  }

  @Public()
  @Get('venues')
  async venues(
    @Query('q') q?: string,
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('categories') categories?: string,
  ) {
    const categoryList = categories
      ? categories
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const result = await this.shop.listPublicVenues({
      q,
      city,
      country,
      categories: categoryList,
    });
    const stats = await this.reviews.statsByShopIds(
      result.items.map((v) => v.id),
    );
    return {
      ...result,
      items: result.items.map((v) => {
        const s = stats.get(v.id);
        return {
          ...v,
          averageRating: s?.averageRating ?? null,
          reviewCount: s?.reviewCount ?? 0,
        };
      }),
    };
  }

  @Public()
  @Get('venues/:slug')
  async venue(@Param('slug') slug: string) {
    const [venue, reviewData] = await Promise.all([
      this.shop.getPublicVenue(slug),
      this.reviews.listPublished(slug, { take: 8 }),
    ]);
    return {
      ...venue,
      reviewsMode: reviewData.reviewsMode,
      canSubmitReview: reviewData.canSubmit,
      showReviews: reviewData.showReviews,
      averageRating: reviewData.averageRating,
      reviewCount: reviewData.reviewCount,
      reviews: reviewData.reviews,
    };
  }

  @Public()
  @Get('venues/:slug/reviews')
  reviewsForVenue(
    @Param('slug') slug: string,
    @Query('take') take?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    const n = take ? parseInt(take, 10) : 50;
    return this.reviews.listPublished(slug, {
      take: Number.isNaN(n) ? 50 : n,
      sort: sort === 'rating' ? 'rating' : 'date',
      order: order === 'asc' ? 'asc' : 'desc',
    });
  }

  @Public()
  @Throttle(publicThrottle('review'))
  @Post('venues/:slug/reviews')
  async submitReview(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicReviewDto,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertCreateCaptcha(req, 'review', dto.captchaToken, captchaHeader);
    return this.reviews.createFromPublic(slug, dto);
  }

  @Public()
  @Throttle(publicThrottle('contact'))
  @Post('venues/:slug/contact')
  async submitContact(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicContactDto,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertCreateCaptcha(req, 'contact', dto.captchaToken, captchaHeader);
    return this.contact.createFromPublic(slug, dto);
  }

  @Public()
  @Throttle(publicThrottle('chatOpen'))
  @Post('venues/:slug/chats')
  async createGuestChat(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicGuestChatDto,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertCreateCaptcha(req, 'chatOpen', dto.captchaToken, captchaHeader);
    return this.guestChats.createFromPublic(slug, dto);
  }

  @Public()
  @Get('venues/:slug/chats/:token')
  getGuestChat(@Param('slug') slug: string, @Param('token') token: string) {
    return this.guestChats.getPublicChat(slug, token);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('venues/:slug/chats/:token/messages')
  guestChatMessage(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body() dto: GuestChatMessageDto,
  ) {
    return this.guestChats.guestSendMessage(slug, token, dto.message);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('venues/:slug/chats/:token/ping')
  guestChatPing(@Param('slug') slug: string, @Param('token') token: string) {
    return this.guestChats.guestPing(slug, token);
  }

  @Public()
  @Post('venues/:slug/chats/:token/end')
  guestChatEnd(@Param('slug') slug: string, @Param('token') token: string) {
    return this.guestChats.guestEnd(slug, token);
  }

  @Public()
  @Delete('venues/:slug/chats/:token')
  guestChatDelete(@Param('slug') slug: string, @Param('token') token: string) {
    return this.guestChats.guestDelete(slug, token);
  }

  @Public()
  @Get('venues/:slug/event-requests/status/:token')
  eventRequestStatus(
    @Param('slug') slug: string,
    @Param('token') token: string,
  ) {
    return this.eventRequests.getPublicStatus(slug, token);
  }

  @Public()
  @Post('venues/:slug/event-requests/status/:token/cancel')
  cancelEventRequest(
    @Param('slug') slug: string,
    @Param('token') token: string,
  ) {
    return this.eventRequests.cancelFromPublic(slug, token);
  }

  @Public()
  @Throttle(publicThrottle('event'))
  @Post('venues/:slug/event-requests')
  async submitEventRequest(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicEventRequestDto,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertCreateCaptcha(req, 'event', dto.captchaToken, captchaHeader);
    return this.eventRequests.createFromPublic(slug, dto);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('venues/:slug/gaming/schedule')
  gamingSchedule(
    @Param('slug') slug: string,
    @Query() query: ScheduleQueryDto,
  ) {
    return this.reservations.getPublicSchedule(slug, query, 'gaming');
  }

  @Public()
  @Throttle(publicThrottle('booking'))
  @Post('venues/:slug/dining/reservations')
  async submitDiningReservation(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicDiningReservationDto,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertCreateCaptcha(req, 'booking', dto.captchaToken, captchaHeader);
    return this.reservations.createPublicGamingBooking(slug, dto, 'dining');
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('venues/:slug/dining/schedule')
  diningSchedule(
    @Param('slug') slug: string,
    @Query() query: ScheduleQueryDto,
  ) {
    return this.reservations.getPublicSchedule(slug, query, 'dining');
  }

  @Public()
  @Throttle(publicThrottle('booking'))
  @Post('venues/:slug/gaming/reservations')
  async submitGamingReservation(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicGamingReservationDto,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertCreateCaptcha(req, 'booking', dto.captchaToken, captchaHeader);
    return this.reservations.createPublicGamingBooking(slug, dto, 'gaming');
  }

  @Public()
  @Get('venues/:slug/gaming/reservations/status/:token')
  gamingReservationStatus(
    @Param('slug') slug: string,
    @Param('token') token: string,
  ) {
    return this.reservations.getPublicGamingStatus(slug, token, 'gaming');
  }

  @Public()
  @Post('venues/:slug/gaming/reservations/status/:token/cancel')
  cancelGamingReservation(
    @Param('slug') slug: string,
    @Param('token') token: string,
  ) {
    return this.reservations.cancelPublicGamingBooking(slug, token, 'gaming');
  }

  @Public()
  @Get('venues/:slug/dining/reservations/status/:token')
  diningReservationStatus(
    @Param('slug') slug: string,
    @Param('token') token: string,
  ) {
    return this.reservations.getPublicGamingStatus(slug, token, 'dining');
  }

  @Public()
  @Post('venues/:slug/dining/reservations/status/:token/cancel')
  cancelDiningReservation(
    @Param('slug') slug: string,
    @Param('token') token: string,
  ) {
    return this.reservations.cancelPublicGamingBooking(slug, token, 'dining');
  }

  /** Guest self-serve DSAR (access / erasure) for a published venue. */
  @Public()
  @Throttle(publicThrottle('contact'))
  @Post('venues/:slug/gdpr/dsar')
  async submitGuestDsar(
    @Param('slug') slug: string,
    @Body() dto: GuestDsarDto,
    @Req() req: Request,
    @Headers(CAPTCHA_TOKEN_HEADER) captchaHeader?: string,
  ) {
    await this.assertCreateCaptcha(
      req,
      'contact',
      dto.captchaToken,
      captchaHeader,
    );
    return this.gdpr.submitGuestDsar(slug, dto, req.ip);
  }
}
