import { Module } from "@nestjs/common";
import { ShopController } from "./shop.controller";
import { ShopService } from "./shop.service";
import { CurrencyRatesService } from "./currency-rates.service";

@Module({
  controllers: [ShopController],
  providers: [ShopService, CurrencyRatesService],
  exports: [ShopService],
})
export class ShopModule {}
