import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

function metricsBearerOk(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const got = Buffer.from(header.slice('Bearer '.length));
  const want = Buffer.from(expected);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

@ApiTags('metrics')
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Prometheus text scrape (opt-in via METRICS_ENDPOINT=on).
   * Returns 404 when disabled so the route stays hidden in default deploys.
   * Optional METRICS_BEARER_TOKEN requires Authorization: Bearer …
   */
  @Public()
  @Get('metrics')
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(
    @Headers('authorization') authorization?: string,
  ): Promise<string> {
    if (!this.metricsService.isEnabled()) {
      throw new NotFoundException();
    }
    const bearer = process.env.METRICS_BEARER_TOKEN?.trim();
    if (bearer && !metricsBearerOk(authorization, bearer)) {
      throw new UnauthorizedException('Metrics scrape requires a valid bearer token.');
    }
    return this.metricsService.renderPrometheusText();
  }
}
