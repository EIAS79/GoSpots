import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtAccessPayload } from "../auth/auth.service";
import { NOTIFICATION_SECTIONS } from "../../common/notification.constants";
import { ArchiveNotificationsDto } from "./dto/archive-notifications.dto";
import { NotificationQueryDto } from "./dto/notification-query.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get("sections")
  sections() {
    return { sections: NOTIFICATION_SECTIONS };
  }

  @Get()
  list(@CurrentUser() user: JwtAccessPayload, @Query() q: NotificationQueryDto) {
    return this.notifications.list(user, {
      from: q.from,
      to: q.to,
      section: q.section,
      status: q.status,
      take: q.take ? +q.take : undefined,
      skip: q.skip ? +q.skip : undefined,
    });
  }

  @Get("recent")
  recent(
    @CurrentUser() user: JwtAccessPayload,
    @Query("since") since?: string,
  ) {
    return this.notifications.recent(user, since);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: JwtAccessPayload) {
    return this.notifications.unreadCount(user);
  }

  @Patch("read-all")
  markAllRead(@CurrentUser() user: JwtAccessPayload) {
    return this.notifications.markAllRead(user);
  }

  @Patch("archive")
  archive(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ArchiveNotificationsDto,
  ) {
    return this.notifications.archive(user, dto);
  }

  @Patch("unarchive")
  unarchive(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ArchiveNotificationsDto,
  ) {
    return this.notifications.unarchive(user, dto);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: JwtAccessPayload, @Param("id") id: string) {
    return this.notifications.markRead(user, id);
  }

  @Patch(":id/unread")
  markUnread(@CurrentUser() user: JwtAccessPayload, @Param("id") id: string) {
    return this.notifications.markUnread(user, id);
  }
}
