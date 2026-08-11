import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { GrowthPublicDepositService } from './growth-public-deposit.service';

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
