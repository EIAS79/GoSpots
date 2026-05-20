import {
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { VENUE_PATH_HEADER } from "../../common/venue-context.interceptor";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtAccessPayload } from "../auth/auth.service";
import { AuditService } from "./audit.service";

@ApiTags("audit")
@Controller("audit")
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Headers(VENUE_PATH_HEADER) venuePath?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("section") section?: string,
    @Query("action") action?: string,
    @Query("search") search?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    return this.audit.list(user, {
      from,
      to,
      section,
      action,
      search,
      take: take ? +take : 100,
      skip: skip ? +skip : 0,
      venuePath,
    });
  }

  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(
    @CurrentUser() user: JwtAccessPayload,
    @Res() res: Response,
    @Headers(VENUE_PATH_HEADER) venuePath?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("section") section?: string,
    @Query("action") action?: string,
    @Query("search") search?: string,
  ) {
    const csv = await this.audit.exportCsv(user, {
      from,
      to,
      section,
      action,
      search,
      venuePath,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="venueflow-audit-${stamp}.csv"`,
    );
    res.send(csv);
  }

  @Delete(":id")
  remove(@CurrentUser() user: JwtAccessPayload, @Param("id") id: string) {
    return this.audit.remove(user, id);
  }
}
