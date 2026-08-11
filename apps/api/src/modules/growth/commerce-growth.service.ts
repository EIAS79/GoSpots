import { Injectable } from '@nestjs/common';
import type { JwtAccessPayload } from '../auth/auth.service';
import { GrowthCrmService } from './growth-crm.service';
import { GrowthPricingService } from './growth-pricing.service';
import type {
  CreateCustomerDto,
  CreatePackageDto,
  CreatePromotionDto,
  CreateStoredValueAccountDto,
  CreateTierDto,
  EnrollCustomerDto,
  LoyaltyEntryDto,
  MergeCustomerDto,
  QuoteDto,
  RecordTipDto,
  RecordVisitDto,
  ReverseRewardsDto,
  SnapshotDto,
  StoredValueEntryDto,
} from './growth.types';

@Injectable()
export class CommerceGrowthService {
  constructor(
    private readonly pricing: GrowthPricingService,
    private readonly crm: GrowthCrmService,
  ) {}

  listPromotions(actor: JwtAccessPayload) {
    return this.pricing.listPromotions(actor);
  }

  createPromotion(actor: JwtAccessPayload, dto: CreatePromotionDto) {
    return this.pricing.createPromotion(actor, dto);
  }

  listPackages(actor: JwtAccessPayload) {
    return this.pricing.listPackages(actor);
  }

  createPackage(actor: JwtAccessPayload, dto: CreatePackageDto) {
    return this.pricing.createPackage(actor, dto);
  }

  quote(actor: JwtAccessPayload, dto: QuoteDto) {
    return this.pricing.quote(actor, dto);
  }

  snapshot(actor: JwtAccessPayload, dto: SnapshotDto) {
    return this.pricing.snapshot(actor, dto);
  }

  recordTip(actor: JwtAccessPayload, dto: RecordTipDto) {
    return this.pricing.recordTip(actor, dto);
  }

  tipReport(actor: JwtAccessPayload, from: Date, to: Date) {
    return this.pricing.tipReport(actor, from, to);
  }

  listCustomers(actor: JwtAccessPayload) {
    return this.crm.listCustomers(actor);
  }

  createCustomer(actor: JwtAccessPayload, dto: CreateCustomerDto) {
    return this.crm.createCustomer(actor, dto);
  }

  mergeCustomer(
    actor: JwtAccessPayload,
    canonicalCustomerId: string,
    dto: MergeCustomerDto,
  ) {
    return this.crm.mergeCustomer(actor, canonicalCustomerId, dto);
  }

  createTier(actor: JwtAccessPayload, dto: CreateTierDto) {
    return this.crm.createTier(actor, dto);
  }

  enroll(
    actor: JwtAccessPayload,
    customerId: string,
    dto: EnrollCustomerDto,
  ) {
    return this.crm.enroll(actor, customerId, dto);
  }

  loyalty(
    actor: JwtAccessPayload,
    customerId: string,
    dto: LoyaltyEntryDto,
  ) {
    return this.crm.loyalty(actor, customerId, dto);
  }

  reverseRewards(
    actor: JwtAccessPayload,
    customerId: string,
    dto: ReverseRewardsDto,
  ) {
    return this.crm.reverseRewards(actor, customerId, dto);
  }

  createStoredAccount(
    actor: JwtAccessPayload,
    dto: CreateStoredValueAccountDto,
  ) {
    return this.crm.createStoredAccount(actor, dto);
  }

  storedValue(
    actor: JwtAccessPayload,
    accountId: string,
    dto: StoredValueEntryDto,
  ) {
    return this.crm.storedValue(actor, accountId, dto);
  }

  recordVisit(
    actor: JwtAccessPayload,
    customerId: string,
    dto: RecordVisitDto,
  ) {
    return this.crm.recordVisit(actor, customerId, dto);
  }

  issueReviewProof(
    actor: JwtAccessPayload,
    customerId: string,
    visitId: string,
  ) {
    return this.crm.issueReviewProof(actor, customerId, visitId);
  }

  customerHistory(actor: JwtAccessPayload, customerId: string) {
    return this.crm.customerHistory(actor, customerId);
  }
}
