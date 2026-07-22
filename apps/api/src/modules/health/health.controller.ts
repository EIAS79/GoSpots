import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Backward-compatible alias (liveness only — no DB). Prefer /live. */
  @Public()
  @Get('health')
  @ApiOkResponse({ description: 'API process is up (liveness)' })
  healthAlias() {
    return this.health.live();
  }

  /** Liveness: process is running. Do not probe the database here. */
  @Public()
  @Get('live')
  @ApiOkResponse({ description: 'Liveness probe — process up' })
  live() {
    return this.health.live();
  }

  /** Readiness: process can serve traffic (includes DB connectivity). */
  @Public()
  @Get('ready')
  @ApiOkResponse({ description: 'Readiness probe — DB reachable' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  async ready(@Res({ passthrough: true }) res: Response) {
    const body = await this.health.ready();
    if (body.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
