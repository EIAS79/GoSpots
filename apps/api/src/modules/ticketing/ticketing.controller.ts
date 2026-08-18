import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { hashIdempotencyRequest, withClientIdempotency } from '../../common/idempotency.util';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilityService } from '../foundation/capability.service';
import { FeatureFlagGuard } from '../foundation/feature-flag.guard';
import { RequireFeature } from '../foundation/require-feature.decorator';
import {
  AccessScanDto,
  AssignLockerDto,
  BindAccessCredentialDto,
  ConfigureAccessScannerDto,
  CreateAccessRuleDto,
  CreateAccessZoneDto,
  CreateLockerDto,
  CreateTicketProductDto,
  IssueTicketOrderDto,
  LockerEventDto,
  OccupancyCorrectionDto,
  ReleaseLockerDto,
  StoredValueCredentialDto,
  TicketMutationDto,
} from './dto/ticketing.dto';
import { TicketingService } from './ticketing.service';

@ApiTags('ticketing')
@Controller('ticketing')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeature('access_v1')
@RequirePermissions(PERMISSIONS.TICKETING_MANAGE)
export class TicketingController {
  constructor(
    private readonly ticketing: TicketingService,
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityService,
  ) {}

  private shopId(user: JwtAccessPayload): string {
    if (!user.shopId) throw new BadRequestException('Venue context is required.');
    return user.shopId;
  }

  private idempotent<T>(
    user: JwtAccessPayload,
    scope: string,
    key: string,
    request: unknown,
    run: () => Promise<T>,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: this.shopId(user),
        scope,
        key,
        requestHash: hashIdempotencyRequest(request),
        correlationId: key,
        requireKey: true,
      },
      run,
    );
  }

  @Get()
  overview(@CurrentUser() user: JwtAccessPayload) {
    return this.ticketing.overview(user);
  }

  @Post('products')
  createProduct(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateTicketProductDto) {
    return this.ticketing.createProduct(user, dto);
  }

  @Post('orders')
  async issueOrder(@CurrentUser() user: JwtAccessPayload, @Body() dto: IssueTicketOrderDto) {
    let firstRawTokens: string[] | undefined;
    const result = await this.idempotent(user, 'ticketing.orders.fulfill', dto.idempotencyKey, dto, async () => {
      const first = await this.ticketing.issueOrder(user, dto);
      firstRawTokens = first.replayed ? [] : first.rawTokens;
      return { ...first, rawTokens: [] as string[] };
    });
    return firstRawTokens === undefined ? result : { ...result, rawTokens: firstRawTokens };
  }

  @Post('tickets/:id/cancel')
  cancelTicket(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: TicketMutationDto) {
    return this.idempotent(user, 'ticketing.ticket.cancel', dto.idempotencyKey, { id, dto }, () =>
      this.ticketing.cancelTicket(user, id, dto),
    );
  }

  @Post('tickets/:id/reissue')
  async reissueTicket(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: TicketMutationDto) {
    let firstRawToken: string | null | undefined;
    const result = await this.idempotent(user, 'ticketing.ticket.reissue', dto.idempotencyKey, { id, dto }, async () => {
      const first = await this.ticketing.reissueTicket(user, id, dto);
      firstRawToken = first.replayed ? null : first.rawToken;
      return { ...first, rawToken: null as string | null };
    });
    return firstRawToken === undefined ? result : { ...result, rawToken: firstRawToken };
  }

  @Post('zones')
  createZone(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateAccessZoneDto) {
    return this.ticketing.createZone(user, dto);
  }

  @Post('zones/:id/rules')
  createRule(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: CreateAccessRuleDto) {
    return this.ticketing.createRule(user, id, dto);
  }

  @Post('scanners/:deviceId/configure')
  configureScanner(
    @CurrentUser() user: JwtAccessPayload,
    @Param('deviceId') deviceId: string,
    @Body() dto: ConfigureAccessScannerDto,
  ) {
    return this.ticketing.configureScanner(user, deviceId, dto);
  }

  @Post('credentials')
  bindCredential(@CurrentUser() user: JwtAccessPayload, @Body() dto: BindAccessCredentialDto) {
    return this.ticketing.bindCredential(user, dto);
  }

  @Post('credentials/stored-value')
  storedValueCredential(@CurrentUser() user: JwtAccessPayload, @Body() dto: StoredValueCredentialDto) {
    return this.ticketing.storedValueCredential(user, dto);
  }

  @Post('access/scan')
  scanAccess(@CurrentUser() user: JwtAccessPayload, @Body() dto: AccessScanDto) {
    return this.idempotent(user, 'ticketing.access.scan', dto.idempotencyKey, dto, () =>
      this.ticketing.scanAccess(user, dto),
    );
  }

  @Get('zones/:id/occupancy')
  occupancy(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.ticketing.occupancy(id, user).then((occupancy) => ({ zoneId: id, occupancy }));
  }

  @Post('zones/:id/occupancy/correct')
  correctOccupancy(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: OccupancyCorrectionDto,
  ) {
    return this.idempotent(user, 'ticketing.occupancy.correct', dto.idempotencyKey, { id, dto }, () =>
      this.ticketing.correctOccupancy(user, id, dto),
    );
  }

  @Post('lockers')
  createLocker(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateLockerDto) {
    return this.ticketing.createLocker(user, dto);
  }

  @Post('lockers/:id/assign')
  assignLocker(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: AssignLockerDto) {
    return this.idempotent(user, 'ticketing.locker.assign', dto.idempotencyKey, { id, dto }, () =>
      this.ticketing.assignLocker(user, id, dto),
    );
  }

  @Post('lockers/:id/events')
  lockerEvent(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: LockerEventDto) {
    return this.idempotent(user, 'ticketing.locker.event', dto.idempotencyKey, { id, dto }, () =>
      this.ticketing.recordLockerEvent(user, id, dto),
    );
  }

  @Post('lockers/:id/release')
  releaseLocker(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: ReleaseLockerDto) {
    return this.idempotent(user, 'ticketing.locker.release', dto.idempotencyKey, { id, dto }, () =>
      this.ticketing.releaseLocker(user, id, dto),
    );
  }

  @Get('readiness')
  async readiness(@CurrentUser() user: JwtAccessPayload) {
    const shopId = this.shopId(user);
    const [domain, capabilities] = await Promise.all([
      this.ticketing.readiness(user),
      this.capabilities.snapshot(shopId),
    ]);
    return { ...domain, capabilities };
  }
}
