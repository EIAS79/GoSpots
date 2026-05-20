import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ShopRoles, RequirePermissions } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { JwtAccessPayload } from "../auth/auth.service";
import { PERMISSIONS } from "../../common/permissions";
import { CreateStaffDto, UpdateStaffDto } from "./dto/staff.dto";
import { StaffService } from "./staff.service";

@ApiTags("staff")
@Controller("staff")
@UseGuards(JwtAuthGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @ShopRoles("OWNER", "MANAGER")
  @RequirePermissions(PERMISSIONS.STAFF_READ)
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.staff.list(user);
  }

  @Post()
  @ShopRoles("OWNER")
  @RequirePermissions(PERMISSIONS.STAFF_WRITE)
  create(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateStaffDto) {
    return this.staff.create(user, dto);
  }

  @Post(":membershipId/regenerate-invite")
  @ShopRoles("OWNER")
  @RequirePermissions(PERMISSIONS.STAFF_WRITE)
  regenerateInvite(
    @CurrentUser() user: JwtAccessPayload,
    @Param("membershipId") membershipId: string,
  ) {
    return this.staff.regenerateInvite(user, membershipId);
  }

  @Patch(":membershipId")
  @ShopRoles("OWNER")
  @RequirePermissions(PERMISSIONS.STAFF_WRITE)
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(user, membershipId, dto);
  }

  @Delete(":membershipId")
  @ShopRoles("OWNER")
  @RequirePermissions(PERMISSIONS.STAFF_WRITE)
  remove(
    @CurrentUser() user: JwtAccessPayload,
    @Param("membershipId") membershipId: string,
  ) {
    return this.staff.remove(user, membershipId);
  }
}
