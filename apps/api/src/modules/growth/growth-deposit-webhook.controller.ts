import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { GrowthPublicDepositService } from './growth-public-deposit.service';

@Public()
@Controller('webhooks/stripe/reservation-deposits')
export class GrowthDepositWebhookController {
  constructor(private readonly deposits: GrowthPublicDepositService) {}

  @Post()
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature.');
    }
    if (!request.rawBody) {
      throw new BadRequestException('Raw request body is required.');
    }
    return this.deposits.handleStripeWebhook(request.rawBody, signature);
  }
}
