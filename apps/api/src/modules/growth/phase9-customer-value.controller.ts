import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GrowthPricingService } from './growth-pricing.service';
import type {
  LoyaltyEntryDto,
  QuoteDto,
  ReverseRewardsDto,
  SnapshotDto,
  StoredValueEntryDto,
} from './growth.types';
import { Phase9CustomerPortalService } from './phase9-customer-portal.service';
import { Phase9CustomerValueService } from './phase9-customer-value.service';
import { Phase9GuardrailsService } from './phase9-guardrails.service';
import { Phase9LoyaltyExpiryService } from './phase9-loyalty-expiry.service';

@ApiTags('growth-phase9')
@Controller('growth/phase9')
@UseGuards(JwtAuthGuard)
export class Phase9CustomerValueController {
  constructor(
    private readonly phase9: Phase9CustomerValueService,
    private readonly guardrails: Phase9GuardrailsService,
    private readonly pricing: GrowthPricingService,
    private readonly expiry: Phase9LoyaltyExpiryService,
  ) {}

  @Post('customers/anonymous')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  anonymous(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: { name?: string; notes?: string },
  ) {
    return this.phase9.createAnonymousCustomer(actor, dto);
  }

  @Get('customers/:id/value')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  customerValue(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.phase9.customerValueSummary(actor, id);
  }

  @Post('customers/:id/consent')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  consent(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: { granted: boolean; source?: string },
  ) {
    return this.phase9.setMarketingConsent(actor, id, dto);
  }

  @Put('customers/:id/preferences/:key')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  preference(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() dto: { value: unknown },
  ) {
    return this.phase9.setPreference(actor, id, key, dto.value as never);
  }

  @Post('loyalty/policy')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  loyaltyPolicy(
    @CurrentUser() actor: JwtAccessPayload,
    @Body()
    dto: {
      pointsExpireDays?: number | null;
      startsAt?: string;
      endsAt?: string;
    },
  ) {
    return this.phase9.setLoyaltyPolicy(actor, dto);
  }

  @Post('customers/:id/loyalty')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  async loyalty(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: LoyaltyEntryDto,
  ) {
    await this.expiry.processDue(requireShopId(actor), id, actor.sub);
    return this.phase9.loyalty(actor, id, dto);
  }

  @Post('customers/:id/loyalty/expire-due')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  expireDue(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.expiry.processDue(requireShopId(actor), id, actor.sub);
  }

  @Post('customers/:id/rewards/reverse')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  async reverseRewards(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: ReverseRewardsDto,
  ) {
    await this.expiry.processDue(requireShopId(actor), id, actor.sub);
    return this.phase9.reverseRewards(actor, id, dto);
  }

  @Put('stored-value/accounts/:id/policy')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  storedValuePolicy(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body()
    dto: {
      transferAllowed?: boolean;
      refundAllowed?: boolean;
      expiresAt?: string | null;
      legalPolicyRef?: string | null;
    },
  ) {
    return this.phase9.configureStoredValuePolicy(actor, id, dto);
  }

  @Post('stored-value/accounts/:id/ledger')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  storedValue(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: StoredValueEntryDto,
  ) {
    return this.phase9.storedValue(actor, id, dto);
  }

  @Post('stored-value/accounts/:id/transfer')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  transferStoredValue(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body()
    dto: {
      destinationAccountId: string;
      amountMinor: number;
      correlationId: string;
      note?: string;
    },
  ) {
    return this.phase9.transferStoredValue(actor, id, dto);
  }

  @Get('stored-value/reconciliation')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_READ)
  storedValueReconciliation(@CurrentUser() actor: JwtAccessPayload) {
    return this.guardrails.reconcileStoredValue(actor);
  }

  @Post('packages/accounts')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  packagePurchase(
    @CurrentUser() actor: JwtAccessPayload,
    @Body()
    dto: {
      customerId: string;
      packageDefinitionId: string;
      unitKind: string;
      initialUnits: number;
      paymentId: string;
      expiresAt?: string;
      correlationId: string;
    },
  ) {
    return this.phase9.createPackageAccount(actor, dto);
  }

  @Post('packages/accounts/:id/ledger')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  packageLedger(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body()
    dto: {
      type: 'LOAD' | 'CONSUME' | 'REFUND' | 'REVERSAL' | 'ADJUST';
      units: number;
      sourceType?: string;
      sourceId?: string;
      paymentId?: string;
      correlationId: string;
      note?: string;
    },
  ) {
    return this.phase9.packageMutation(actor, id, dto);
  }

  @Post('customers/:id/membership/renew')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  renewMembership(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: { expiresAt: string; correlationId: string; reason?: string },
  ) {
    return this.phase9.renewMembership(actor, id, dto);
  }

  @Post('customers/:id/membership/usage')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  membershipUsage(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body()
    dto: {
      type: 'GRANT' | 'CONSUME' | 'REFUND' | 'REVERSAL' | 'ADJUST';
      benefitKey: string;
      unitKind: string;
      units: number;
      sourceType?: string;
      sourceId?: string;
      correlationId: string;
      note?: string;
    },
  ) {
    return this.phase9.membershipUsage(actor, id, dto);
  }

  @Put('promotions/:id/usage-policy')
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_WRITE)
  promotionUsagePolicy(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body()
    dto: {
      firstVisitOnly?: boolean;
      minQuantity?: number | null;
      maxQuantity?: number | null;
      totalLimit?: number | null;
      perCustomerLimit?: number | null;
    },
  ) {
    return this.phase9.setPromotionUsagePolicy(actor, id, dto);
  }

  @Post('pricing/quote')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  async quote(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: QuoteDto,
  ) {
    const normalized = await this.guardrails.normalizeQuote(actor, dto);
    const quote = await this.pricing.quote(actor, normalized);
    return this.phase9.assertPromotionPolicies(actor, normalized, quote);
  }

  @Post('pricing/snapshots')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  async snapshot(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: SnapshotDto,
  ) {
    const normalized = await this.guardrails.normalizeQuote(actor, dto);
    return this.phase9.snapshotWithUsagePolicies(actor, normalized);
  }

  @Post('customers/:id/portal-token')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  portalToken(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Query('ttlDays') ttlDays?: string,
  ) {
    return this.phase9.issuePortalToken(
      actor,
      id,
      ttlDays ? Number(ttlDays) : 30,
    );
  }

  @Post('portal-tokens/:id/revoke')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  revokePortalToken(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.phase9.revokePortalToken(actor, id);
  }
}

@ApiTags('growth-phase9-portal')
@Controller('growth/phase9/portal')
export class Phase9CustomerPortalController {
  constructor(private readonly portal: Phase9CustomerPortalService) {}

  @Get(':token')
  snapshot(@Param('token') token: string) {
    return this.portal.snapshot(token);
  }

  @Post(':token/marketing-consent')
  consent(
    @Param('token') token: string,
    @Body() dto: { granted: boolean },
  ) {
    return this.portal.setMarketingConsent(token, Boolean(dto.granted));
  }
}
