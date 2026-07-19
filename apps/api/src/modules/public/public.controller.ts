import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
import { EventRequestsService } from '../reservations/event-requests.service';
import { ReservationsService } from '../reservations/reservations.service';
import { CreatePublicGamingReservationDto } from '../guest/dto/public-gaming.dto';
import { CurrencyRatesService } from '../shop/currency-rates.service';
import { ShopService } from '../shop/shop.service';

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
  ) {}

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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('venues/:slug/reviews')
  submitReview(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicReviewDto,
  ) {
    return this.reviews.createFromPublic(slug, dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('venues/:slug/contact')
  submitContact(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicContactDto,
  ) {
    return this.contact.createFromPublic(slug, dto);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('venues/:slug/chats')
  createGuestChat(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicGuestChatDto,
  ) {
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
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('venues/:slug/event-requests')
  submitEventRequest(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicEventRequestDto,
  ) {
    return this.eventRequests.createFromPublic(slug, dto);
  }

  @Public()
  @Get('venues/:slug/gaming/schedule')
  gamingSchedule(
    @Param('slug') slug: string,
    @Query('date') date: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.reservations.getPublicSchedule(slug, { date, categoryId }, 'gaming');
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('venues/:slug/dining/reservations')
  submitDiningReservation(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicGamingReservationDto,
  ) {
    return this.reservations.createPublicGamingBooking(slug, dto, 'dining');
  }

  @Public()
  @Get('venues/:slug/dining/schedule')
  diningSchedule(
    @Param('slug') slug: string,
    @Query('date') date: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.reservations.getPublicSchedule(slug, { date, categoryId }, 'dining');
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('venues/:slug/gaming/reservations')
  submitGamingReservation(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicGamingReservationDto,
  ) {
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
}
