import { Module } from '@nestjs/common';
import { GuestModule } from '../guest/guest.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ShopModule } from '../shop/shop.module';
import { PublicController } from './public.controller';

@Module({
  imports: [ShopModule, ReservationsModule, GuestModule],
  controllers: [PublicController],
})
export class PublicModule {}
