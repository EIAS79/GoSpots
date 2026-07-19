import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [GalleryController],
  providers: [GalleryService],
})
export class GalleryModule {}
