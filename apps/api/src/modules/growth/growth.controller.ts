import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommerceGrowthService } from './commerce-growth.service';
import { EventsGrowthService } from './events-growth.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import {
  GrowthCapacityService,
  type UnifiedBookingInput,
} from './growth-capacity.service';
import { ReservationGrowthService } from './reservation-growth.service';
import type {
  AttachReservationPolicyDto,
  CreateCustomerDto,
  CreateEventChecklistDto,
  CreateEventHoldDto,
  CreateEventProposalDto,
  CreateEventScheduleDto,
  CreatePackageDto,
  CreatePromotionDto,
  CreateReservationPolicyDto,
  CreateStoredValueAccountDto,
  CreateTierDto,
  CreateWaitlistDto,
  EnrollCustomerDto,
  EventTransitionDto,
  LoyaltyEntryDto,
  MarkEventSchedulePaidDto,
  MergeCustomerDto,
  OfferWaitlistDto,
  QuoteDto,
  RecordDepositDto,
  RecordTipDto,
  RecordVisitDto,
  ReservationOutcomeDto,
  ReverseRewardsDto,
  SnapshotDto,
  StartEventDto,
  StoredValueEntryDto,
} from './growth.types';

@ApiTags('growth')
@Controller('growth')
@UseGuards(JwtAuthGuard)
export class GrowthController {
  constructor(
    private readonly reservations: ReservationGrowthService,
    private readonly capacity: GrowthCapacityService,
    private readonly commerce: CommerceGrowthService,
    private readonly events: EventsGrowthService,
    private readonly analytics: GrowthAnalyticsService,
  ) {}

  // Chunk 16 — Reservations 2.0, deposits and waitlist
  @Get('reservations/capacity')
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  capacityForStaff(
    @CurrentUser() user: JwtAccessPayload,
    @Query('startsAt') startsAt: string,
    @Query('endsAt') endsAt: string,
    @Query('partySize') partySize?: string,
    @Query('resourceId') resourceId?: string,
    @Query('resourceCategoryId') resourceCategoryId?: string,
    @Query('resourceType') resourceType?: string,
  ) {
    return this.capacity.capacity(user, {
      startsAt,
      endsAt,
      partySize: partySize ? Number(partySize) : undefined,
      resourceId,
      resourceCategoryId,
      resourceType,
    });
  }

  @Post('reservations/unified')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  createUnifiedReservation(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UnifiedBookingInput,
  ) {
    return this.capacity.createStaff(user, {
      ...dto,
      sourceChannel: dto.sourceChannel?.trim() || 'STAFF',
    });
  }

  @Post('reservations/:id/check-in')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  checkInReservation(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.capacity.checkIn(user, id);
  }

  @Post('reservations/:id/deposit-application')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  applyReservationDeposit(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body()
    dto: {
      guestCheckId: string;
      amountMinor: number;
      currency?: string;
      correlationId: string;
    },
  ) {
    return this.capacity.applyDeposit(user, id, dto);
  }

  @Get('reservations/policies')
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  policies(@CurrentUser() user: JwtAccessPayload) {
    return this.reservations.listPolicies(user);
  }

  @Post('reservations/policies')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  createPolicy(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateReservationPolicyDto,
  ) {
    return this.reservations.createPolicy(user, dto);
  }

  @Post('reservations/:id/policy')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  attachPolicy(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: AttachReservationPolicyDto,
  ) {
    return this.reservations.attachPolicy(user, id, dto);
  }

  @Post('reservations/:id/deposits')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  deposit(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: RecordDepositDto,
  ) {
    return this.reservations.recordDeposit(user, id, dto);
  }

  @Get('reservations/:id/deposits')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  depositSummary(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.reservations.depositSummary(user, id);
  }

  @Post('reservations/:id/outcome')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  outcome(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: ReservationOutcomeDto,
  ) {
    return this.reservations.closeReservation(user, id, dto);
  }

  @Post('reservations/:id/session')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  session(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.reservations.convertReservation(user, id);
  }

  @Get('reservations/timeline/range')
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  timeline(
    @CurrentUser() user: JwtAccessPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reservations.timeline(user, new Date(from), new Date(to));
  }

  @Get('waitlist')
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  waitlist(@CurrentUser() user: JwtAccessPayload) {
    return this.reservations.listWaitlist(user);
  }

  @Post('waitlist')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  createWaitlist(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateWaitlistDto,
  ) {
    return this.reservations.createWaitlist(user, dto);
  }

  @Post('waitlist/:id/offer')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  offerWaitlist(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: OfferWaitlistDto,
  ) {
    return this.reservations.offerWaitlist(user, id, dto);
  }

  @Post('waitlist/:id/claim')
  @Post('waitlist/:id/convert')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  claimWaitlist(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.reservations.convertWaitlist(user, id);
  }

  // Chunk 17 — Promotions, packages and tips
  @Get('promotions')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  promotions(@CurrentUser() user: JwtAccessPayload) {
    return this.commerce.listPromotions(user);
  }

  @Post('promotions')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createPromotion(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreatePromotionDto,
  ) {
    return this.commerce.createPromotion(user, dto);
  }

  @Get('packages')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  packages(@CurrentUser() user: JwtAccessPayload) {
    return this.commerce.listPackages(user);
  }

  @Post('packages')
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  createPackage(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreatePackageDto,
  ) {
    return this.commerce.createPackage(user, dto);
  }

  @Post('pricing/quote')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  quote(@CurrentUser() user: JwtAccessPayload, @Body() dto: QuoteDto) {
    return this.commerce.quote(user, dto);
  }

  @Post('pricing/snapshots')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  snapshot(@CurrentUser() user: JwtAccessPayload, @Body() dto: SnapshotDto) {
    return this.commerce.snapshot(user, dto);
  }

  @Post('tips')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  tip(@CurrentUser() user: JwtAccessPayload, @Body() dto: RecordTipDto) {
    return this.commerce.recordTip(user, dto);
  }

  @Get('tips/report')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  tipReport(
    @CurrentUser() user: JwtAccessPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.commerce.tipReport(user, new Date(from), new Date(to));
  }

  // Chunk 18 — CRM, membership, loyalty and stored value
  @Get('customers')
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  customers(@CurrentUser() user: JwtAccessPayload) {
    return this.commerce.listCustomers(user);
  }

  @Post('customers')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  createCustomer(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.commerce.createCustomer(user, dto);
  }

  @Get('customers/:id/history')
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  history(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.commerce.customerHistory(user, id);
  }

  @Post('customers/:id/merge')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  mergeCustomer(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: MergeCustomerDto,
  ) {
    return this.commerce.mergeCustomer(user, id, dto);
  }

  @Post('membership-tiers')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  tier(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateTierDto) {
    return this.commerce.createTier(user, dto);
  }

  @Post('customers/:id/membership')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  enroll(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: EnrollCustomerDto,
  ) {
    return this.commerce.enroll(user, id, dto);
  }

  @Post('customers/:id/loyalty')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  loyalty(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: LoyaltyEntryDto,
  ) {
    return this.commerce.loyalty(user, id, dto);
  }

  @Post('customers/:id/rewards/reverse')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  reverseRewards(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: ReverseRewardsDto,
  ) {
    return this.commerce.reverseRewards(user, id, dto);
  }

  @Post('customers/:id/visits')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  recordVisit(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: RecordVisitDto,
  ) {
    return this.commerce.recordVisit(user, id, dto);
  }

  @Post('customers/:id/visits/:visitId/review-proof')
  @RequirePermissions(PERMISSIONS.REVIEWS_WRITE)
  issueReviewProof(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('visitId') visitId: string,
  ) {
    return this.commerce.issueReviewProof(user, id, visitId);
  }

  @Post('stored-value/accounts')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  storedAccount(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateStoredValueAccountDto,
  ) {
    return this.commerce.createStoredAccount(user, dto);
  }

  @Post('stored-value/accounts/:id/ledger')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  storedLedger(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: StoredValueEntryDto,
  ) {
    return this.commerce.storedValue(user, id, dto);
  }

  // Chunk 19 — Events / Parties 2.0
  @Get('events/:id')
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  event(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.events.detail(user, id);
  }

  @Post('events/:id/proposals')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  proposal(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: CreateEventProposalDto,
  ) {
    return this.events.createProposal(user, id, dto);
  }

  @Post('events/proposals/:id/send')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  sendProposal(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.events.setProposalStatus(user, id, 'SENT');
  }

  @Post('events/proposals/:id/accept')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  acceptProposal(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.events.acceptProposal(user, id);
  }

  @Post('events/:id/holds')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  hold(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: CreateEventHoldDto,
  ) {
    return this.events.createHold(user, id, dto);
  }

  @Post('events/:id/payment-schedule')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  schedule(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: CreateEventScheduleDto,
  ) {
    return this.events.createPaymentSchedule(user, id, dto);
  }

  @Post('events/payment-schedule/:id/paid')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  paid(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: MarkEventSchedulePaidDto,
  ) {
    return this.events.markPaymentPaid(user, id, dto);
  }

  @Post('events/:id/checklist')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  createChecklist(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: CreateEventChecklistDto,
  ) {
    return this.events.createChecklistItem(user, id, dto);
  }

  @Post('events/checklist/:id/status')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  checklistStatus(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: { status: 'OPEN' | 'DONE' },
  ) {
    return this.events.setChecklistStatus(user, id, dto.status);
  }

  @Post('events/:id/start')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  startEvent(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: StartEventDto,
  ) {
    return this.events.startExecution(user, id, dto);
  }

  @Post('events/:id/final-payment')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  finalPayment(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.events.moveToFinalPayment(user, id);
  }

  @Post('events/:id/transition')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  eventTransition(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: EventTransitionDto,
  ) {
    return this.events.transitionExplicit(user, id, dto);
  }

  @Post('events/:id/complete')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  completeEvent(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.events.finishExecution(user, id, 'COMPLETED');
  }

  @Post('events/:id/cancel')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  cancelEvent(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.events.finishExecution(user, id, 'CANCELED');
  }

  @Get('events/:id/profitability')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  eventProfitability(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.events.profitability(user, id);
  }

  // Chunk 20 — Analytics 2.0; exactly four decision surfaces.
  @Get('analytics/overview')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  overview(
    @CurrentUser() user: JwtAccessPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analytics.overview(user, new Date(from), new Date(to));
  }

  @Get('analytics/operations')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  analyticsOperations(
    @CurrentUser() user: JwtAccessPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analytics.operations(user, new Date(from), new Date(to));
  }

  @Get('analytics/guests')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  analyticsGuests(
    @CurrentUser() user: JwtAccessPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analytics.guests(user, new Date(from), new Date(to));
  }

  @Get('analytics/finance')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  analyticsFinance(
    @CurrentUser() user: JwtAccessPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analytics.finance(user, new Date(from), new Date(to));
  }

  @Post('analytics/facts/rebuild')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  rebuildAnalyticsFacts(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: { from: string; to: string },
  ) {
    return this.analytics.rebuildFacts(
      user,
      new Date(dto.from),
      new Date(dto.to),
    );
  }
}
