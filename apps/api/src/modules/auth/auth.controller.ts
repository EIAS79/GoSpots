import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import type { JwtAccessPayload } from "./auth.service";
import { ActivateStaffDto } from "./dto/activate-staff.dto";
import { LoginDto, RegisterDto } from "./dto/auth.dto";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

@ApiTags("auth")
@Controller("auth")
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions() {
    const secure = this.config.get("COOKIE_SECURE", "false") === "true";
    const sameSiteRaw = this.config.get<string>("COOKIE_SAME_SITE", "lax");
    const sameSite =
      sameSiteRaw === "none" || sameSiteRaw === "strict"
        ? sameSiteRaw
        : "lax";
    return { httpOnly: true, secure, sameSite } as const;
  }

  private setAuthCookies(
    res: Response,
    tokens: {
      accessToken: string;
      accessExpiresIn: number;
      refreshToken: string;
      refreshExpiresIn: number;
    },
  ) {
    const common = { ...this.cookieOptions(), path: "/" };
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...common,
      maxAge: tokens.accessExpiresIn * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...common,
      path: "/api/v1/auth",
      maxAge: tokens.refreshExpiresIn * 1000,
    });
  }

  private clearAuthCookies(res: Response) {
    const common = this.cookieOptions();
    res.clearCookie(ACCESS_COOKIE, { ...common, path: "/" });
    res.clearCookie(REFRESH_COOKIE, { ...common, path: "/api/v1/auth" });
  }

  // POST /auth/register
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.register(dto);
    const tokens = await this.auth.login(
      { login: dto.email, password: dto.password },
      req.ip,
      req.headers["user-agent"],
    );
    this.setAuthCookies(res, tokens);
    return { user: tokens.user, dashboardPath: tokens.dashboardPath };
  }

  /** Employee completes one-time setup (personal password). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("staff/activate")
  async activateStaff(
    @Body() dto: ActivateStaffDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.activateStaffInvite(
      dto.token,
      dto.password,
      req.ip,
      req.headers["user-agent"],
    );
    this.setAuthCookies(res, tokens);
    return { user: tokens.user, dashboardPath: tokens.dashboardPath };
  }

  // POST /auth/login
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(
      dto,
      req.ip,
      req.headers["user-agent"],
    );
    this.setAuthCookies(res, tokens);
    return { user: tokens.user, dashboardPath: tokens.dashboardPath };
  }

  // POST /auth/refresh
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rt = req.cookies?.[REFRESH_COOKIE];
    if (!rt) throw new UnauthorizedException("No refresh token.");
    const tokens = await this.auth.refresh(
      rt,
      req.ip,
      req.headers["user-agent"],
    );
    this.setAuthCookies(res, tokens);
    return { user: tokens.user, dashboardPath: tokens.dashboardPath };
  }

  // POST /auth/logout
  @Public()
  @HttpCode(204)
  @Post("logout")
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearAuthCookies(res);
  }

  // GET /auth/me
  @Get("me")
  async me(@CurrentUser() user: JwtAccessPayload) {
    const profile = await this.auth.me(user.sub);
    const dashboardPath = this.auth.resolveDashboardPathForUser(profile);
    return { ...profile, dashboardPath };
  }

  /** Confirms cookie session + membership for /dashboard/{slug}--{key} */
  @Get("venue/:venuePath")
  async verifyVenue(
    @CurrentUser() user: JwtAccessPayload,
    @Param("venuePath") venuePath: string,
  ) {
    return this.auth.verifyVenueDashboard(
      user.sub,
      user.sysRole,
      venuePath,
    );
  }

  /** Binds JWT + cookies to the venue in the dashboard URL (shopId for tenant APIs). */
  @Post("venue/:venuePath/session")
  @HttpCode(200)
  async bindVenueSession(
    @CurrentUser() user: JwtAccessPayload,
    @Param("venuePath") venuePath: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bound = await this.auth.bindVenueSession(user, venuePath);
    const secure = this.config.get("COOKIE_SECURE", "false") === "true";
    res.cookie(ACCESS_COOKIE, bound.accessToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: bound.accessExpiresIn * 1000,
    });
    return { shop: bound.shop };
  }
}
