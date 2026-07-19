import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ShopModule } from '../shop/shop.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { LemonSqueezyClient } from './lemon-squeezy.client';

@Module({
  imports: [AuditModule, ShopModule],
  controllers: [BillingController],
  providers: [BillingService, LemonSqueezyClient],
  exports: [BillingService],
})
export class BillingModule {}
