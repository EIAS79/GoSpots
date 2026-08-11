import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { IntegrationsService } from './integrations.service';

@ApiTags('integration-webhooks')
@Controller('integrations/inbound')
@Public()
export class IntegrationInboundWebhookController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post(':installationId')
  receive(
    @Param('installationId') installationId: string,
    @Headers('x-gospots-event-id') eventId: string,
    @Headers('x-gospots-timestamp') timestamp: string,
    @Headers('x-gospots-signature') signature: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.integrations.receiveSignedWebhook({
      installationId,
      eventId: String(eventId ?? ''),
      timestamp: String(timestamp ?? ''),
      signature: String(signature ?? ''),
      payload,
    });
  }
}
