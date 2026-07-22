import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsSseHub } from './notifications-sse.hub';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsSseHub, NotificationsService],
  exports: [NotificationsService, NotificationsSseHub],
})
export class NotificationsModule {}
