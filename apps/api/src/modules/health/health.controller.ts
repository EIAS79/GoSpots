import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOkResponse({ description: 'API is running' })
  check() {
    return {
      status: 'ok',
      service: 'venueflow-api',
      timestamp: new Date().toISOString(),
    };
  }
}
