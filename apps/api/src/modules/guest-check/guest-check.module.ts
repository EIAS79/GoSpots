import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GuestCheckController } from './guest-check.controller';
import { GuestCheckService } from './guest-check.service';

@Module({
  imports: [AuditModule],
  controllers: [GuestCheckController],
  providers: [GuestCheckService],
  exports: [GuestCheckService],
})
export class GuestCheckModule {}
