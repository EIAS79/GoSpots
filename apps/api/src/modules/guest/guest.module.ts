import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContactMessagesController } from './contact.controller';
import { ContactMessagesService } from './contact.service';
import { GuestChatController } from './guest-chat.controller';
import { GuestChatService } from './guest-chat.service';
import { VenueReviewsController } from './reviews.controller';
import { VenueReviewsService } from './venue-reviews.service';

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [
    ContactMessagesController,
    VenueReviewsController,
    GuestChatController,
  ],
  providers: [
    VenueReviewsService,
    ContactMessagesService,
    GuestChatService,
  ],
  exports: [
    VenueReviewsService,
    ContactMessagesService,
    GuestChatService,
  ],
})
export class GuestModule {}
