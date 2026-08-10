import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  hashIdempotencyRequest,
  IDEMPOTENCY_SCOPES,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CashService } from './cash.service';
import {
  ApproveCashVarianceDto,
  CashReportsQueryDto,
  CloseCashSessionDto,
  CreateCashMovementDto,
  OpenCashSessionDto,
  SubmitCashCountDto,
  UpdateCashPolicyDto,
} from './dto/cash.dto';

@ApiTags('cash')
@Controller('cash')
@UseGuards(JwtAuthGuard)
export class CashController {
  constructor(
    private readonly cash: CashService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('my-shift')
  myShift(@CurrentUser() user: JwtAccessPayload) {
    return this.cash.getMyShift(user);
  }

  @Get('policy')
  policy(@CurrentUser() user: JwtAccessPayload) {
    return this.cash.getPolicy(user);
  }

  @Patch('policy')
  @RequirePermissions(PERMISSIONS.SHOP_MANAGE)
  updatePolicy(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateCashPolicyDto,
  ) {
    return this.cash.updatePolicy(user, dto);
  }

  @Post('sessions')
  @RequirePermissions(PERMISSIONS.CASH_OPEN)
  openSession(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: OpenCashSessionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CASH_SESSION_OPEN,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.cash.openSession(user, dto),
    );
  }

  @Post('sessions/:id/movements')
  @RequirePermissions(PERMISSIONS.CASH_MOVEMENT)
  createMovement(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') cashSessionId: string,
    @Body() dto: CreateCashMovementDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CASH_MOVEMENT_CREATE,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest({ cashSessionId, ...dto }),
      },
      () => this.cash.createMovement(user, cashSessionId, dto),
    );
  }

  @Post('sessions/:id/counts')
  @RequirePermissions(PERMISSIONS.CASH_CLOSE)
  submitCount(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') cashSessionId: string,
    @Body() dto: SubmitCashCountDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CASH_COUNT_SUBMIT,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest({ cashSessionId, ...dto }),
      },
      () => this.cash.submitCount(user, cashSessionId, dto),
    );
  }

  @Post('sessions/:id/approve-variance')
  @RequirePermissions(PERMISSIONS.CASH_APPROVE_VARIANCE)
  approveVariance(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') cashSessionId: string,
    @Body() dto: ApproveCashVarianceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CASH_VARIANCE_APPROVE,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest({ cashSessionId, ...dto }),
      },
      () => this.cash.approveVariance(user, cashSessionId, dto),
    );
  }

  @Post('sessions/:id/close')
  @RequirePermissions(PERMISSIONS.CASH_CLOSE)
  closeSession(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') cashSessionId: string,
    @Body() dto: CloseCashSessionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const shopId = requireShopId(user);
    return withClientIdempotency(
      this.prisma,
      {
        shopId,
        scope: IDEMPOTENCY_SCOPES.CASH_SESSION_CLOSE,
        key: idempotencyKey,
        requireKey: true,
        requestHash: hashIdempotencyRequest({ cashSessionId, ...dto }),
      },
      () => this.cash.closeSession(user, cashSessionId, dto),
    );
  }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.CASH_VIEW_EXPECTED)
  reports(
    @CurrentUser() user: JwtAccessPayload,
    @Query() query: CashReportsQueryDto,
  ) {
    return this.cash.listReports(user, query.take ?? 50);
  }
}
