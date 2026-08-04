import { SkipThrottle } from '@nestjs/throttler';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { requireShopId } from '../../common/tenant';
import { Public } from '../auth/decorators/public.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { isDualBillingEnabled } from './billing-config';
import { BillingOrchestratorService } from './billing-orchestrator.service';
import { BillingService } from './billing.service';
import { BillingWebhookProcessor } from './billing-webhook.processor';
import { BillingWebhookService } from './billing-webhook.service';
import { ConfigService } from '@nestjs/config';
import {
  CancelDto,
  ChangePlanDto,
  ChangeRenewalModeDto,
  CheckoutDto,
  PauseDto,
  SwitchProviderDto,
} from './dto/billing.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly orchestrator: BillingOrchestratorService,
    private readonly webhooks: BillingWebhookService,
    private readonly webhookProcessor: BillingWebhookProcessor,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status() {
    if (isDualBillingEnabled(this.config)) {
      return {
        provider: 'dual' as const,
        ...this.orchestrator.listProviders(),
        lemon: this.billing.status(),
      };
    }
    return this.billing.status();
  }

  @Get('catalog')
  @UseGuards(JwtAuthGuard)
  catalog(
    @CurrentUser() user: JwtAccessPayload,
    @Query('currency') currency?: string,
  ) {
    return this.orchestrator.getCatalog(user, currency);
  }

  @Get('providers')
  @UseGuards(JwtAuthGuard)
  providers(@CurrentUser() user: JwtAccessPayload) {
    return this.orchestrator.listProviders(user);
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  subscription(@CurrentUser() user: JwtAccessPayload) {
    return this.orchestrator.getSubscription(user, requireShopId(user));
  }

  @Get('payments')
  @UseGuards(JwtAuthGuard)
  payments(
    @CurrentUser() user: JwtAccessPayload,
    @Query('take') take?: string,
  ) {
    return this.orchestrator.listPayments(
      user,
      requireShopId(user),
      take ? Number.parseInt(take, 10) : 40,
    );
  }

  /** Alias: invoices are represented as BillingPayment rows (provider invoices linked). */
  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  invoices(
    @CurrentUser() user: JwtAccessPayload,
    @Query('take') take?: string,
  ) {
    return this.orchestrator.listPayments(
      user,
      requireShopId(user),
      take ? Number.parseInt(take, 10) : 40,
    );
  }

  @Get('audit')
  @UseGuards(JwtAuthGuard)
  audit(
    @CurrentUser() user: JwtAccessPayload,
    @Query('take') take?: string,
  ) {
    return this.orchestrator.listBillingAudit(
      user,
      requireShopId(user),
      take ? Number.parseInt(take, 10) : 50,
    );
  }

  @Get('health')
  @UseGuards(JwtAuthGuard)
  health(@CurrentUser() user: JwtAccessPayload) {
    if (user.sysRole !== 'SUPER_ADMIN' && user.shopRole !== 'OWNER') {
      throw new ForbiddenException(
        'Billing health is restricted to owners and platform admins.',
      );
    }
    return this.orchestrator.getHealth();
  }

  @Get('webhooks/dead-letter')
  @UseGuards(JwtAuthGuard)
  deadLetters(
    @CurrentUser() user: JwtAccessPayload,
    @Query('take') take?: string,
  ) {
    return this.webhooks.deadLetterSummary(
      user,
      take ? Number.parseInt(take, 10) : 50,
    );
  }

  @Post('webhooks/dead-letter/:id/replay')
  @UseGuards(JwtAuthGuard)
  replayDeadLetter(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.webhooks.requeueDeadLetter(user, id);
  }

  @Get('checkout/:operationId/status')
  @UseGuards(JwtAuthGuard)
  checkoutStatus(
    @CurrentUser() user: JwtAccessPayload,
    @Param('operationId') operationId: string,
  ) {
    return this.orchestrator.getCheckoutStatus(
      user,
      requireShopId(user),
      operationId,
    );
  }

  /**
   * Dual checkout when BILLING_ENABLED; otherwise Lemon (soft-gated).
   */
  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (isDualBillingEnabled(this.config)) {
      return this.orchestrator.createCheckout(
        user,
        requireShopId(user),
        dto,
        idempotencyKey,
      );
    }
    return this.billing.createCheckout(user);
  }

  /** Legacy Lemon customer portal (when Lemon enabled). */
  @Post('portal')
  @UseGuards(JwtAuthGuard)
  portal(@CurrentUser() user: JwtAccessPayload) {
    return this.billing.openPortal(user);
  }

  @Post('subscription/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CancelDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.cancel(
      user,
      requireShopId(user),
      dto,
      idempotencyKey,
    );
  }

  @Post('subscription/pause')
  @UseGuards(JwtAuthGuard)
  pause(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: PauseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.pause(
      user,
      requireShopId(user),
      dto ?? {},
      idempotencyKey,
    );
  }

  @Post('subscription/resume')
  @UseGuards(JwtAuthGuard)
  resume(
    @CurrentUser() user: JwtAccessPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.resume(
      user,
      requireShopId(user),
      idempotencyKey,
    );
  }

  @Post('subscription/change-plan')
  @UseGuards(JwtAuthGuard)
  changePlan(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ChangePlanDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.changePlan(
      user,
      requireShopId(user),
      dto,
      idempotencyKey,
    );
  }

  @Post('subscription/change-renewal-mode')
  @UseGuards(JwtAuthGuard)
  changeRenewalMode(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ChangeRenewalModeDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.changeRenewalMode(
      user,
      requireShopId(user),
      dto,
      idempotencyKey,
    );
  }

  @Post('subscription/switch-provider')
  @UseGuards(JwtAuthGuard)
  switchProvider(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: SwitchProviderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.switchProvider(
      user,
      requireShopId(user),
      dto,
      idempotencyKey,
    );
  }

  @Post('manual-renewal/checkout')
  @UseGuards(JwtAuthGuard)
  manualRenewal(
    @CurrentUser() user: JwtAccessPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.createManualRenewalCheckout(
      user,
      requireShopId(user),
      idempotencyKey,
    );
  }

  @Post('payment-method/update')
  @UseGuards(JwtAuthGuard)
  updatePaymentMethod(
    @CurrentUser() user: JwtAccessPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.updatePaymentMethod(
      user,
      requireShopId(user),
      idempotencyKey,
    );
  }

  @Post('stripe/customer-portal')
  @UseGuards(JwtAuthGuard)
  stripePortal(
    @CurrentUser() user: JwtAccessPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orchestrator.openStripeCustomerPortal(
      user,
      requireShopId(user),
      idempotencyKey,
    );
  }

  @Public()
  @SkipCsrf()
  @SkipThrottle()
  @Post('webhooks/stripe')
  async stripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    const raw =
      req.rawBody ??
      Buffer.from(
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
      );
    const result = await this.webhooks.ingestStripe(raw, signature);
    if (!result.duplicate) {
      this.webhookProcessor.enqueueSoon(result.eventId);
    }
    return result;
  }

  @Public()
  @SkipCsrf()
  @SkipThrottle()
  @Post('webhooks/mollie')
  async mollieWebhook(@Req() req: Request) {
    // Mollie may send application/x-www-form-urlencoded { id } or JSON.
    const body =
      req.body && typeof req.body === 'object'
        ? req.body
        : typeof req.body === 'string'
          ? (() => {
              try {
                return JSON.parse(req.body);
              } catch {
                return { id: String(req.body) };
              }
            })()
          : {};
    const result = await this.webhooks.ingestMollie(body);
    if (!result.duplicate) {
      this.webhookProcessor.enqueueSoon(result.eventId);
    }
    return result;
  }

  @Public()
  @SkipCsrf()
  @SkipThrottle()
  @Post('webhooks/lemon-squeezy')
  async lemonWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-signature') signature?: string,
  ) {
    const raw =
      req.rawBody ??
      Buffer.from(
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
      );
    // Signature first — never insert a receipt on auth failure (401).
    this.billing.verifySignature(raw, signature);

    let payload: unknown;
    try {
      if (typeof req.body === 'object' && req.body !== null) {
        payload = req.body;
      } else if (typeof req.body === 'string') {
        payload = JSON.parse(req.body);
      } else {
        payload = JSON.parse(raw.toString('utf8'));
      }
    } catch {
      throw new BadRequestException('Malformed webhook JSON.');
    }
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Malformed webhook JSON.');
    }

    return this.billing.handleWebhook(payload, raw);
  }
}
