import { SkipThrottle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status() {
    return this.billing.status();
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@CurrentUser() user: JwtAccessPayload) {
    return this.billing.createCheckout(user);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  portal(@CurrentUser() user: JwtAccessPayload) {
    return this.billing.openPortal(user);
  }

  @Public()
  @SkipThrottle()
  @Post('webhooks/lemon-squeezy')
  async lemonWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-signature') signature?: string,
  ) {
    const raw =
      req.rawBody ??
      Buffer.from(
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
      );
    this.billing.verifySignature(raw, signature);
    const payload =
      typeof req.body === 'object' && req.body
        ? req.body
        : JSON.parse(raw.toString('utf8'));
    return this.billing.handleWebhook(payload);
  }
}
