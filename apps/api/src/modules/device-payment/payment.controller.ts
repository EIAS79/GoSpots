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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PaymentConnectorRegistry } from './connectors/payment-connector.registry';
import { CreateProviderRefundDto, StartProviderPaymentDto } from './dto/payment.dto';
import { MoneyOperationsService } from './money-operations.service';
import { PaymentDomainService } from './payment-domain.service';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(
    private readonly payments: PaymentDomainService,
    private readonly connectors: PaymentConnectorRegistry,
    private readonly money: MoneyOperationsService,
  ) {}

  @Get('providers')
  async providers() {
    const providers = await Promise.all(
      this.connectors.providers().map(async (provider) => {
        const connector = this.connectors.resolve(provider);
        const capabilities = await connector.capabilities();
        const health = await connector.health();
        const readiness = connector.readiness
          ? await connector.readiness()
          : {
              ready: Boolean(health.ok && capabilities.payments),
              ok: health.ok,
              checkedAt: new Date().toISOString(),
              message: health.message,
            };
        return { provider, capabilities, health, readiness };
      }),
    );
    return { providers };
  }

  @Post('operations')
  start(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: StartProviderPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.payments.startPayment(user, dto, idempotencyKey);
  }

  @Get('operations/:id')
  get(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.payments.getOperation(user, id);
  }

  @Post('operations/:id/reconcile')
  reconcile(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.payments.reconcile(user, id);
  }

  @Post('operations/:id/cancel')
  cancel(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.payments.cancel(user, id);
  }

  @Post('operations/:id/refunds')
  refund(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: CreateProviderRefundDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.money.assertRefundAuthorized(user);
    return this.payments.createRefund(user, id, dto, idempotencyKey);
  }
}
