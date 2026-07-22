import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiStaffErrorResponses } from '../../common/dto/api-error-responses.decorator';
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
import { ApplyOnboardingTemplateDto } from './dto/apply-onboarding-template.dto';
import { deriveApplyTemplateIdempotencyKey } from './onboarding-idempotency.util';
import { OnboardingService } from './onboarding.service';

@ApiTags('shop')
@Controller('shop/onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('apply-template')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  @ApiOkResponse({ description: 'Apply onboarding venue template (idempotent)' })
  @ApiStaffErrorResponses()
  applyTemplate(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ApplyOnboardingTemplateDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const key = deriveApplyTemplateIdempotencyKey(dto, idempotencyKey);
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.SHOP_ONBOARDING_APPLY_TEMPLATE,
        key,
        requestHash: hashIdempotencyRequest({
          templateId: dto.templateId,
          replace: dto.replace === true,
          previousCategoryIds: dto.previousCategoryIds ?? [],
        }),
      },
      () => this.onboarding.applyTemplate(user, dto),
    );
  }
}
