import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
