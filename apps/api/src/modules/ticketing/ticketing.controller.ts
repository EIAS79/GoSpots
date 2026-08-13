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
import {
  hashIdempotencyRequest,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureFlagGuard } from '../foundation/feature-flag.guard';
import { RequireFeature } from '../foundation/require-feature.decorator';
import {
  BindRfidCredentialDto,
  CreateRfidWalletDto,
  CreateTicketProductDto,
  IssueTicketOrderDto,
  ReverseRfidEntryDto,
  RfidTapDto,
  RfidWalletMutationDto,
  ScanTicketDto,
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
  ) {}

  private shopId(user: JwtAccessPayload): string {
    if (!user.shopId) {
      throw new BadRequestException('Venue context is required.');
    }
    return user.shopId;
  }

  @Get()
  overview(@CurrentUser() user: JwtAccessPayload) {
    return this.ticketing.overview(user);
  }

  @Post('products')
  createProduct(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateTicketProductDto,
  ) {
    return this.ticketing.createProduct(user, dto);
  }

  @Post('orders')
  async issueOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: IssueTicketOrderDto,
  ) {
    const shopId = this.shopId(user);
    let firstResponseRawTokens: string[] | undefined;
    const result = await withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'ticketing.orders.issue',
        key: dto.idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      async () => {
        const first = await this.ticketing.issueOrder(user, dto);
        firstResponseRawTokens = first.replayed ? [] : first.rawTokens;
        // Raw admission tokens are one-time secrets. Never persist them in the
        // shared replay receipt; a replay receives the durable order/tickets only.
        return { ...first, rawTokens: [] as string[] };
      },
    );
    return firstResponseRawTokens === undefined
      ? result
      : { ...result, rawTokens: firstResponseRawTokens };
  }

  @Post('tickets/scan')
  scan(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ScanTicketDto,
  ) {
    const shopId = this.shopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'ticketing.tickets.scan',
        key: dto.idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.ticketing.scan(user, dto),
    );
  }

  @Post('rfid/wallets')
  createWallet(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateRfidWalletDto,
  ) {
    return this.ticketing.createWallet(user, dto);
  }

  @Post('rfid/credentials')
  bindCredential(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: BindRfidCredentialDto,
  ) {
    return this.ticketing.bindCredential(user, dto);
  }

  private walletMutation(
    user: JwtAccessPayload,
    walletId: string,
    operation: 'load' | 'spend' | 'refund',
    dto: RfidWalletMutationDto,
  ) {
    const shopId = this.shopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        // RfidWalletEntry itself has one tenant-wide idempotency-key namespace.
        // Keep all wallet-entry operations in that same canonical scope so a key
        // reused for another wallet or operation is a conflict, never a replay.
        scope: 'ticketing.rfid.wallet-entry',
        key: dto.idempotencyKey,
        requestHash: hashIdempotencyRequest({ walletId, operation, dto }),
      },
      () => this.ticketing[operation](user, walletId, dto),
    );
  }

  @Post('rfid/wallets/:id/load')
  load(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: RfidWalletMutationDto,
  ) {
    return this.walletMutation(user, id, 'load', dto);
  }

  @Post('rfid/wallets/:id/spend')
  spend(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: RfidWalletMutationDto,
  ) {
    return this.walletMutation(user, id, 'spend', dto);
  }

  @Post('rfid/wallets/:id/refund')
  refund(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: RfidWalletMutationDto,
  ) {
    return this.walletMutation(user, id, 'refund', dto);
  }

  @Post('rfid/wallets/:id/reverse')
  reverse(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: ReverseRfidEntryDto,
  ) {
    const shopId = this.shopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'ticketing.rfid.wallet-entry',
        key: dto.idempotencyKey,
        requestHash: hashIdempotencyRequest({
          walletId: id,
          operation: 'reverse',
          dto,
        }),
      },
      () => this.ticketing.reverse(user, id, dto),
    );
  }

  @Post('rfid/tap')
  tap(@CurrentUser() user: JwtAccessPayload, @Body() dto: RfidTapDto) {
    const shopId = this.shopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: 'ticketing.rfid.tap',
        key: dto.idempotencyKey,
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.ticketing.tap(user, dto),
    );
  }

  @Get('readiness')
  readiness(@CurrentUser() user: JwtAccessPayload) {
    return this.ticketing.readiness(user);
  }
}
