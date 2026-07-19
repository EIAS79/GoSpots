import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { CurrencyRatesService } from './currency-rates.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ShopController],
  providers: [ShopService, CurrencyRatesService],
  exports: [ShopService],
})
export class ShopModule {}
