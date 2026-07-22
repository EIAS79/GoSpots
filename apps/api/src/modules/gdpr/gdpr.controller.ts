import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CONFIRM_PASSWORD_HEADER } from '../../common/security/verify-password.util';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ShopRoles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  CloseGuestDsarDto,
  EraseAccountDto,
  EraseGuestByEmailDto,
  EraseGuestDto,
} from './dto/gdpr.dto';
import { GdprService } from './gdpr.service';

@ApiTags('gdpr')
@Controller('gdpr')
@UseGuards(JwtAuthGuard)
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  /**
   * Owner-only read-only JSON package of shop-scoped personal data.
   * No pack/feature gate.
   */
  @Get('export')
  @ShopRoles('OWNER')
  export(@CurrentUser() user: JwtAccessPayload) {
    return this.gdpr.exportShopPersonalData(user);
  }

  /**
   * Owner-only guest PII redaction for one entity in the current shop.
   * Keeps billing amounts and row ids. Requires password confirmation.
   */
  @Post('erase-guest')
  @ShopRoles('OWNER')
  eraseGuest(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: EraseGuestDto,
    @Headers(CONFIRM_PASSWORD_HEADER) confirmPasswordHeader?: string,
  ) {
    return this.gdpr.eraseGuest(user, dto, confirmPasswordHeader);
  }

  /** Owner-only batch redact by guest email in the current shop. */
  @Post('erase-guest-email')
  @ShopRoles('OWNER')
  eraseGuestByEmail(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: EraseGuestByEmailDto,
    @Headers(CONFIRM_PASSWORD_HEADER) confirmPasswordHeader?: string,
  ) {
    return this.gdpr.eraseGuestByEmail(user, dto, confirmPasswordHeader);
  }

  /**
   * Soft account wipe for the signed-in user (password + confirm phrase).
   * Money / Lemon rows kept — OPERATOR processor purge residual.
   */
  @Post('erase-account')
  eraseAccount(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: EraseAccountDto,
  ) {
    return this.gdpr.eraseAccount(user, dto);
  }

  @Get('dsar')
  @ShopRoles('OWNER')
  listDsar(@CurrentUser() user: JwtAccessPayload) {
    return this.gdpr.listGuestDsar(user);
  }

  @Post('dsar/:id/close')
  @ShopRoles('OWNER')
  closeDsar(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: CloseGuestDsarDto,
    @Headers(CONFIRM_PASSWORD_HEADER) confirmPasswordHeader?: string,
  ) {
    return this.gdpr.closeGuestDsar(user, id, dto, confirmPasswordHeader);
  }
}
