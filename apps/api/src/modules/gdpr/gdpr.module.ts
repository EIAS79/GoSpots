import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GdprController } from './gdpr.controller';
import { GdprRetentionProcessor } from './gdpr-retention.processor';
import { GdprService } from './gdpr.service';

@Module({
  imports: [AuditModule, NotificationsModule, MailModule],
  controllers: [GdprController],
  providers: [GdprService, GdprRetentionProcessor],
  exports: [GdprService],
})
export class GdprModule {}
