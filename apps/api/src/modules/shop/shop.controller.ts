import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  ConvertCurrencyDto,
  SyncVenueCategoriesDto,
  UpdateShopSettingsDto,
} from './dto/shop-settings.dto';
import { ShopService } from './shop.service';

@ApiTags('shop')
@Controller('shop')
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: JwtAccessPayload) {
    return this.shop.getSettings(user);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateShopSettingsDto,
  ) {
    return this.shop.updateSettings(user, dto);
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

  @Post('currency/convert')
  convert(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ConvertCurrencyDto,
  ) {
    return this.shop.convertCurrency(user, dto);
  }
}
