import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtAccessPayload } from "../auth/auth.service";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("overview")
  overview(@CurrentUser() user: JwtAccessPayload) {
    return this.dashboard.overview(user);
  }

  @Get("subscription")
  subscription(@CurrentUser() user: JwtAccessPayload) {
    return this.dashboard.subscription(user);
  }

}
