import { Body, Controller, Get, Headers, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  hashIdempotencyRequest,
  IDEMPOTENCY_SCOPES,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { CONFIRM_PASSWORD_HEADER } from '../../common/security/verify-password.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ShopRoles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  ConvertCurrencyDto,
  PreviewCurrencyChangeDto,
  RotateDashboardKeyDto,
  SyncVenueCategoriesDto,
  UpdateShopSettingsDto,
} from './dto/shop-settings.dto';
import { ShopService } from './shop.service';

@ApiTags('shop')
@Controller('shop')
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(
    private readonly shop: ShopService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('settings')
  getSettings(@CurrentUser() user: JwtAccessPayload) {
    return this.shop.getSettings(user);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateShopSettingsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const run = () => this.shop.updateSettings(user, dto);
    // Currency apply (catalog FX reprice) — Tier C optional key; preview stays unwrapped.
    if (dto.currency != null) {
      return withClientIdempotency(
        this.prisma,
        {
          shopId: requireShopId(user),
          scope: IDEMPOTENCY_SCOPES.SHOP_CURRENCY_APPLY,
          key: idempotencyKey,
          requestHash: hashIdempotencyRequest({
            currency: dto.currency,
            confirm: dto.confirm === true,
          }),
        },
        run,
      );
    }
    return run();
  }

  /**
   * Owner-only: regenerate the venue dashboard capability key.
   * Requires password confirmation (body `password` or `X-Confirm-Password`).
   * Old `slug--key` stops binding immediately; client must rewrite sessionStorage.
   */
  @Post('dashboard-key/rotate')
  @ShopRoles('OWNER')
  rotateDashboardKey(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: RotateDashboardKeyDto,
    @Headers(CONFIRM_PASSWORD_HEADER) confirmPasswordHeader?: string,
  ) {
    return this.shop.rotateDashboardKey(user, dto, confirmPasswordHeader);
  }

  @Patch('venue-categories')
  syncVenueCategories(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: SyncVenueCategoriesDto,
  ) {
    return this.shop.syncVenueCategories(user, dto);
  }

  @Get('currencies')
  listCurrencies() {
    return this.shop.listCurrencies();
  }

  /** Live FX rate for dashboard display (no audit spam). */
  @Get('currency/rate')
  getRate(
    @CurrentUser() user: JwtAccessPayload,
    @Query('from') from = 'EUR',
    @Query('to') to?: string,
  ) {
    return this.shop.getDisplayRate(user, from, to);
  }

  /**
   * Proposed catalog price table for a currency change (no writes).
   * Apply via `PATCH /shop/settings` with `currency` + `confirm: true`.
   */
  @Post('currency/preview')
  previewCurrency(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: PreviewCurrencyChangeDto,
  ) {
    return this.shop.previewCurrencyChange(user, dto);
  }

  /** Past catalog FX conversions (audit-backed). */
  @Get('currency/history')
  currencyHistory(
    @CurrentUser() user: JwtAccessPayload,
    @Query('take') take?: string,
  ) {
    const n = take != null ? Number(take) : 30;
    return this.shop.listCurrencyHistory(
      user,
      Number.isFinite(n) ? n : 30,
    );
  }

  @Post('currency/convert')
  convert(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ConvertCurrencyDto,
  ) {
    return this.shop.convertCurrency(user, dto);
  }
}
