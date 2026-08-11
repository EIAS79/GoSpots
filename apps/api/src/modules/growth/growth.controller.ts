import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommerceGrowthService } from './commerce-growth.service';
import { EventsGrowthService } from './events-growth.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { ReservationGrowthService } from './reservation-growth.service';
import type { AttachReservationPolicyDto, CreateCustomerDto, CreateEventHoldDto, CreateEventProposalDto, CreateEventScheduleDto, CreatePackageDto, CreatePromotionDto, CreateReservationPolicyDto, CreateStoredValueAccountDto, CreateTierDto, CreateWaitlistDto, EnrollCustomerDto, LoyaltyEntryDto, MarkEventSchedulePaidDto, OfferWaitlistDto, QuoteDto, RecordDepositDto, RecordTipDto, ReservationOutcomeDto, SnapshotDto, StartEventDto, StoredValueEntryDto } from './growth.types';

@ApiTags('growth')
@Controller('growth')
@UseGuards(JwtAuthGuard)
export class GrowthController {
  constructor(private readonly reservations:ReservationGrowthService,private readonly commerce:CommerceGrowthService,private readonly events:EventsGrowthService,private readonly analytics:GrowthAnalyticsService){}

  @Get('reservations/policies') @RequirePermissions(PERMISSIONS.RESERVATION_READ) policies(@CurrentUser() u:JwtAccessPayload){return this.reservations.listPolicies(u);}
  @Post('reservations/policies') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) createPolicy(@CurrentUser() u:JwtAccessPayload,@Body() d:CreateReservationPolicyDto){return this.reservations.createPolicy(u,d);}
  @Post('reservations/:id/policy') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) attachPolicy(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:AttachReservationPolicyDto){return this.reservations.attachPolicy(u,id,d);}
  @Post('reservations/:id/deposits') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) deposit(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:RecordDepositDto){return this.reservations.recordDeposit(u,id,d);}
  @Get('reservations/:id/deposits') @RequirePermissions(PERMISSIONS.TRANSACTION_READ) depositSummary(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.reservations.depositSummary(u,id);}
  @Post('reservations/:id/outcome') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) outcome(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:ReservationOutcomeDto){return this.reservations.closeReservation(u,id,d);}
  @Post('reservations/:id/session') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE) session(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.reservations.convertReservation(u,id);}
  @Get('reservations/timeline/range') @RequirePermissions(PERMISSIONS.RESERVATION_READ) timeline(@CurrentUser() u:JwtAccessPayload,@Query('from') from:string,@Query('to') to:string){return this.reservations.timeline(u,new Date(from),new Date(to));}
  @Get('waitlist') @RequirePermissions(PERMISSIONS.RESERVATION_READ) waitlist(@CurrentUser() u:JwtAccessPayload){return this.reservations.listWaitlist(u);}
  @Post('waitlist') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) createWaitlist(@CurrentUser() u:JwtAccessPayload,@Body() d:CreateWaitlistDto){return this.reservations.createWaitlist(u,d);}
  @Post('waitlist/:id/offer') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) offer(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:OfferWaitlistDto){return this.reservations.offerWaitlist(u,id,d);}
  @Post('waitlist/:id/convert') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) convertWaitlist(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.reservations.convertWaitlist(u,id);}

  @Get('promotions') @RequirePermissions(PERMISSIONS.TRANSACTION_READ) promotions(@CurrentUser() u:JwtAccessPayload){return this.commerce.listPromotions(u);}
  @Post('promotions') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) createPromotion(@CurrentUser() u:JwtAccessPayload,@Body() d:CreatePromotionDto){return this.commerce.createPromotion(u,d);}
  @Post('packages') @RequirePermissions(PERMISSIONS.MENU_WRITE) createPackage(@CurrentUser() u:JwtAccessPayload,@Body() d:CreatePackageDto){return this.commerce.createPackage(u,d);}
  @Post('pricing/quote') @RequirePermissions(PERMISSIONS.TRANSACTION_READ) quote(@CurrentUser() u:JwtAccessPayload,@Body() d:QuoteDto){return this.commerce.quote(u,d);}
  @Post('pricing/snapshots') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) snapshot(@CurrentUser() u:JwtAccessPayload,@Body() d:SnapshotDto){return this.commerce.snapshot(u,d);}
  @Post('tips') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) tip(@CurrentUser() u:JwtAccessPayload,@Body() d:RecordTipDto){return this.commerce.recordTip(u,d);}

  @Get('customers') @RequirePermissions(PERMISSIONS.RESERVATION_READ) customers(@CurrentUser() u:JwtAccessPayload){return this.commerce.listCustomers(u);}
  @Post('customers') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) createCustomer(@CurrentUser() u:JwtAccessPayload,@Body() d:CreateCustomerDto){return this.commerce.createCustomer(u,d);}
  @Get('customers/:id/history') @RequirePermissions(PERMISSIONS.RESERVATION_READ) history(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.commerce.customerHistory(u,id);}
  @Post('membership-tiers') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) tier(@CurrentUser() u:JwtAccessPayload,@Body() d:CreateTierDto){return this.commerce.createTier(u,d);}
  @Post('customers/:id/membership') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) enroll(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:EnrollCustomerDto){return this.commerce.enroll(u,id,d);}
  @Post('customers/:id/loyalty') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) loyalty(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:LoyaltyEntryDto){return this.commerce.loyalty(u,id,d);}
  @Post('stored-value/accounts') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) storedAccount(@CurrentUser() u:JwtAccessPayload,@Body() d:CreateStoredValueAccountDto){return this.commerce.createStoredAccount(u,d);}
  @Post('stored-value/accounts/:id/ledger') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) storedLedger(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:StoredValueEntryDto){return this.commerce.storedValue(u,id,d);}

  @Get('events/:id') @RequirePermissions(PERMISSIONS.RESERVATION_READ) event(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.events.detail(u,id);}
  @Post('events/:id/proposals') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) proposal(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:CreateEventProposalDto){return this.events.createProposal(u,id,d);}
  @Post('events/proposals/:id/send') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) sendProposal(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.events.setProposalStatus(u,id,'SENT');}
  @Post('events/proposals/:id/accept') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) acceptProposal(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.events.acceptProposal(u,id);}
  @Post('events/:id/holds') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) hold(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:CreateEventHoldDto){return this.events.createHold(u,id,d);}
  @Post('events/:id/payment-schedule') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) schedule(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:CreateEventScheduleDto){return this.events.createPaymentSchedule(u,id,d);}
  @Post('events/payment-schedule/:id/paid') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) paid(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:MarkEventSchedulePaidDto){return this.events.markPaymentPaid(u,id,d);}
  @Post('events/:id/start') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) startEvent(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string,@Body() d:StartEventDto){return this.events.startExecution(u,id,d);}
  @Post('events/:id/complete') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) completeEvent(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.events.finishExecution(u,id,'COMPLETED');}
  @Post('events/:id/cancel') @RequirePermissions(PERMISSIONS.RESERVATION_WRITE) cancelEvent(@CurrentUser() u:JwtAccessPayload,@Param('id') id:string){return this.events.finishExecution(u,id,'CANCELED');}

  @Get('analytics/overview') @RequirePermissions(PERMISSIONS.TRANSACTION_READ) overview(@CurrentUser() u:JwtAccessPayload,@Query('from') from:string,@Query('to') to:string){return this.analytics.overview(u,new Date(from),new Date(to));}
}
