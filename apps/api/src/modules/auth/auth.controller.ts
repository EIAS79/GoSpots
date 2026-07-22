import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type {
  AuthTokenBundle,
  JwtAccessPayload,
  LoginResult,
  MfaLoginChallenge,
} from './auth.service';
import { ActivateStaffDto } from './dto/activate-staff.dto';
import { LoginDto, RegisterDto, ForgotPasswordDto, ResetPasswordDto, StaffForgotPasswordDto, MfaTotpBeginDto, MfaTotpConfirmDto, MfaTotpDisableDto, MfaRecoveryRegenerateDto, MfaVerifyDto } from './dto/auth.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { LinkVenuesDto, LinkVenuesPreviewDto } from './dto/link-venues.dto';
import {
  ACCESS_COOKIE_PATH,
  REFRESH_COOKIE_PATH,
  resolveAuthCookieFlags,
} from '../../common/cookie-options.util';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
} from '../../common/csrf.constants';
import { generateCsrfToken } from '../../common/csrf.util';
import { authThrottle } from '../../common/throttle.config';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

function isMfaLoginChallenge(
  result: LoginResult,
): result is MfaLoginChallenge {
  return (
    typeof result === 'object' &&
    result != null &&
    'mfaRequired' in result &&
    (result as MfaLoginChallenge).mfaRequired === true &&
    typeof (result as MfaLoginChallenge).mfaToken === 'string'
  );
}

function isAuthTokenBundle(result: LoginResult): result is AuthTokenBundle {
  return !isMfaLoginChallenge(result);
}

@ApiTags('auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** First User-Agent header value (Express may expose string | string[]). */
  private requestUserAgent(req: Request): string | undefined {
    const raw = req.headers['user-agent'];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  }

  /**
   * Auth cookie flags. Prefer SameSite=lax + Vercel same-origin `/api/v1` proxy.
   * SameSite=none forces Secure (browser requirement) — use only for cross-site API.
   */
  private cookieOptions() {
    return resolveAuthCookieFlags({
      nodeEnv: this.config.get<string>('NODE_ENV'),
      cookieSecure: this.config.get<string>('COOKIE_SECURE'),
      cookieSameSite: this.config.get<string>('COOKIE_SAME_SITE'),
    });
  }

  private setCsrfCookie(res: Response): string {
    const token = generateCsrfToken();
    const { secure, sameSite } = this.cookieOptions();
    // Not httpOnly: JS must read it for the double-submit X-CSRF-Token header.
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure,
      sameSite,
      path: ACCESS_COOKIE_PATH,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return token;
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
    const flags = this.cookieOptions();
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...flags,
      path: ACCESS_COOKIE_PATH,
      maxAge: tokens.accessExpiresIn * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...flags,
      path: REFRESH_COOKIE_PATH,
      maxAge: tokens.refreshExpiresIn * 1000,
    });
    this.setCsrfCookie(res);
  }

  private clearAuthCookies(res: Response) {
    const flags = this.cookieOptions();
    res.clearCookie(ACCESS_COOKIE, { ...flags, path: ACCESS_COOKIE_PATH });
    res.clearCookie(REFRESH_COOKIE, {
      ...flags,
      path: REFRESH_COOKIE_PATH,
    });
    res.clearCookie(CSRF_COOKIE, {
      httpOnly: false,
      secure: flags.secure,
      sameSite: flags.sameSite,
      path: ACCESS_COOKIE_PATH,
    });
  }

  // POST /auth/register
  @Public()
  @Throttle(authThrottle('strict'))
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.register(dto);
    const result = await this.auth.login(
      { login: dto.email, password: dto.password },
      req.ip,
      this.requestUserAgent(req),
    );
    if (!isAuthTokenBundle(result)) {
      // New accounts never have MFA; treat as hard failure if this happens.
      throw new UnauthorizedException('Unexpected MFA challenge on register.');
    }
    this.setAuthCookies(res, result);
    return { user: result.user, venuePath: result.venuePath };
  }

  /** Employee completes one-time setup (personal password). */
  @Public()
  @Throttle(authThrottle('login'))
  @HttpCode(200)
  @Post('staff/activate')
  async activateStaff(
    @Body() dto: ActivateStaffDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.activateStaffInvite(
      dto.token,
      dto.password,
      req.ip,
      this.requestUserAgent(req),
    );
    this.setAuthCookies(res, tokens);
    return { user: tokens.user, venuePath: tokens.venuePath };
  }

  // POST /auth/login
  @Public()
  @Throttle(authThrottle('login'))
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      dto,
      req.ip,
      this.requestUserAgent(req),
    );
    if (isMfaLoginChallenge(result)) {
      return { mfaRequired: true as const, mfaToken: result.mfaToken };
    }
    this.setAuthCookies(res, result);
    return { user: result.user, venuePath: result.venuePath };
  }

  /** Owner MFA status (authenticated). */
  @Get('mfa/status')
  mfaStatus(@CurrentUser() user: JwtAccessPayload) {
    return this.auth.getMfaStatus(user.sub);
  }

  /** Begin TOTP enroll — returns secret + otpauth URI once. */
  @Throttle(authThrottle('login'))
  @Post('mfa/totp/begin')
  @HttpCode(200)
  beginMfaTotp(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: MfaTotpBeginDto,
  ) {
    return this.auth.beginMfaTotp(user.sub, dto);
  }

  /** Confirm TOTP enroll + issue recovery codes once. */
  @Throttle(authThrottle('login'))
  @Post('mfa/totp/confirm')
  @HttpCode(200)
  confirmMfaTotp(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: MfaTotpConfirmDto,
  ) {
    return this.auth.confirmMfaTotp(user.sub, dto);
  }

  /** Disable MFA — password + TOTP or recovery. */
  @Throttle(authThrottle('login'))
  @Post('mfa/totp/disable')
  @HttpCode(200)
  disableMfaTotp(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: MfaTotpDisableDto,
  ) {
    return this.auth.disableMfaTotp(user.sub, dto);
  }

  /** Regenerate recovery codes — invalidates unused prior codes. */
  @Throttle(authThrottle('login'))
  @Post('mfa/recovery/regenerate')
  @HttpCode(200)
  regenerateMfaRecovery(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: MfaRecoveryRegenerateDto,
  ) {
    return this.auth.regenerateMfaRecoveryCodes(user.sub, dto);
  }

  /** Complete MFA login challenge; sets cookies on success. */
  @Public()
  @Throttle(authThrottle('login'))
  @HttpCode(200)
  @Post('mfa/verify')
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.verifyMfaLogin(
      dto,
      req.ip,
      this.requestUserAgent(req),
    );
    this.setAuthCookies(res, tokens);
    return { user: tokens.user, venuePath: tokens.venuePath };
  }

  /** Owner-only forgot password (email link). */
  @Public()
  @Throttle(authThrottle('strict'))
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestOwnerPasswordReset(dto);
  }

  /**
   * Staff forgot password — notifies the venue owner.
   * Owner issues a new setup link from Employee accounts.
   */
  @Public()
  @Throttle(authThrottle('strict'))
  @HttpCode(200)
  @Post('staff/forgot-password')
  staffForgotPassword(@Body() dto: StaffForgotPasswordDto) {
    return this.auth.requestStaffPasswordReset(dto);
  }

  @Public()
  @Throttle(authThrottle('login'))
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetOwnerPassword(dto);
  }

  // POST /auth/refresh
  @Public()
  @Throttle(authThrottle('refresh'))
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rt = req.cookies?.[REFRESH_COOKIE];
    if (!rt) throw new UnauthorizedException('No refresh token.');
    const tokens = await this.auth.refresh(
      rt,
      req.ip,
      this.requestUserAgent(req),
    );
    this.setAuthCookies(res, tokens);
    return { user: tokens.user, venuePath: tokens.venuePath };
  }

  // POST /auth/logout
  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearAuthCookies(res);
  }

  /**
   * Issues / rotates the double-submit CSRF cookie.
   * Call before cookie-authenticated mutations if the browser has no csrf_token yet.
   * Throttled separately (higher than login) so login smoke / soft-reload stay healthy.
   */
  @Public()
  @Throttle(authThrottle('csrf'))
  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const csrfToken = this.setCsrfCookie(res);
    return { csrfToken };
  }

  // GET /auth/me
  @Get('me')
  async me(@CurrentUser() user: JwtAccessPayload) {
    const profile = await this.auth.me(user.sub);
    const venuePath = this.auth.resolveVenuePathForUser(profile);
    return { ...profile, venuePath };
  }

  /** List active AuthSessions for the signed-in user (no raw tokens). */
  @Get('sessions')
  listSessions(@CurrentUser() user: JwtAccessPayload) {
    return this.auth.listAuthSessions(user.sub);
  }

  /** Revoke one session by id (family revoke). Must belong to the caller. */
  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    await this.auth.revokeAuthSession(user.sub, id);
  }

  /** Revoke all other active sessions; keep the current refresh family. */
  @Post('sessions/revoke-others')
  @HttpCode(200)
  revokeOtherSessions(
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ) {
    return this.auth.revokeOtherAuthSessions(user.sub, {
      refreshToken: req.cookies?.[REFRESH_COOKIE],
      sessionId: user.sid,
    });
  }

  /** Create another venue for the signed-in owner account. */
  @Post('venues')
  async createVenue(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateVenueDto,
  ) {
    return this.auth.createVenueForOwner(user.sub, dto);
  }

  /** Verify email+password and list venues that can be linked. */
  @Throttle(authThrottle('login'))
  @Post('venues/link/preview')
  @HttpCode(200)
  async previewLinkVenues(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: LinkVenuesPreviewDto,
  ) {
    return this.auth.previewLinkVenuesByEmail(
      user.sub,
      dto.email,
      dto.password,
    );
  }

  /** Link selected venues from a verified owner email onto this account. */
  @Throttle(authThrottle('login'))
  @Post('venues/link')
  @HttpCode(200)
  async linkVenues(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: LinkVenuesDto,
  ) {
    return this.auth.linkVenuesByEmail(
      user.sub,
      dto.email,
      dto.password,
      dto.shopIds,
    );
  }

  /** Confirms cookie session + membership for dashboard bind (`x-venue-path` = slug or legacy slug--key). */
  @Get('venue/:venuePath')
  async verifyVenue(
    @CurrentUser() user: JwtAccessPayload,
    @Param('venuePath') venuePath: string,
  ) {
    return this.auth.verifyVenueDashboard(user.sub, user.sysRole, venuePath);
  }

  /** Binds JWT + cookies to the venue in the dashboard URL (shopId for tenant APIs). */
  @Post('venue/:venuePath/session')
  @HttpCode(200)
  async bindVenueSession(
    @CurrentUser() user: JwtAccessPayload,
    @Param('venuePath') venuePath: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bound = await this.auth.bindVenueSession(user, venuePath);
    const flags = this.cookieOptions();
    res.cookie(ACCESS_COOKIE, bound.accessToken, {
      ...flags,
      path: ACCESS_COOKIE_PATH,
      maxAge: bound.accessExpiresIn * 1000,
    });
    this.setCsrfCookie(res);
    return { shop: bound.shop };
  }
}
