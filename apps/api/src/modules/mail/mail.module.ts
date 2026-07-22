import { Global, Module } from '@nestjs/common';
import { MailOutboxController } from './mail-outbox.controller';
import { MailOutboxProcessor } from './mail-outbox.processor';
import { MailOutboxRetentionProcessor } from './mail-outbox-retention.processor';
import { MailOutboxService } from './mail-outbox.service';
import { MailService } from './mail.service';

@Global()
@Module({
  controllers: [MailOutboxController],
  providers: [
    MailOutboxService,
    MailService,
    MailOutboxProcessor,
    MailOutboxRetentionProcessor,
  ],
  exports: [MailOutboxService, MailService],
})
export class MailModule {}
