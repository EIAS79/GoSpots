import { Module } from "@nestjs/common";
import { ShopModule } from "../shop/shop.module";
import { PublicController } from "./public.controller";

@Module({
  imports: [ShopModule],
  controllers: [PublicController],
})
export class PublicModule {}
