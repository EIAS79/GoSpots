export type CreateReservationPolicyDto = {
  name: string;
  depositKind?: 'NONE' | 'FIXED' | 'PERCENT';
  depositFixedMinor?: number;
  depositPercentBps?: number;
  cancellationWindowMinutes?: number;
  lateCancelForfeitPercent?: number;
  noShowForfeitPercent?: number;
};
export type AttachReservationPolicyDto = { policyId: string };
export type RecordDepositDto = {
  type: 'CAPTURE' | 'REFUND' | 'FORFEIT' | 'REVERSAL';
  amountMinor: number;
  currency?: string;
  paymentId?: string;
  refundId?: string;
  correlationId: string;
  note?: string;
};
export type ReservationOutcomeDto = {
  outcome: 'CANCELED' | 'NO_SHOW';
  reason?: string;
};
export type CreateWaitlistDto = {
  resourceId?: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  partySize?: number;
  desiredStartsAt: string;
  desiredEndsAt: string;
  priority?: number;
  note?: string;
};
export type OfferWaitlistDto = { offerMinutes?: number };

export type PromotionConditionKind =
  | 'DAY_OF_WEEK'
  | 'TIME_WINDOW'
  | 'RESOURCE'
  | 'RESOURCE_CATEGORY'
  | 'ITEM'
  | 'ITEM_CATEGORY'
  | 'MEMBER'
  | 'CUSTOMER'
  | 'SESSION_LENGTH'
  | 'PARTY_SIZE'
  | 'SPEND'
  | 'CODE'
  | 'BOOKING_CHANNEL';

export type PromotionBenefitKind =
  | 'PERCENT'
  | 'FIXED'
  | 'FIXED_PRICE'
  | 'FREE_MINUTES'
  | 'BUNDLE'
  | 'BOGO';

export type PromotionConditionDto = {
  kind: PromotionConditionKind;
  operator?: 'EQ' | 'IN' | 'GTE' | 'LTE' | 'BETWEEN';
  value: string | number | boolean | string[] | number[] | Record<string, unknown>;
};

export type PromotionBenefitDto = {
  kind: PromotionBenefitKind;
  value: string | number | boolean | Record<string, unknown>;
};

export type CreatePromotionDto = {
  code?: string;
  name: string;
  kind: PromotionBenefitKind;
  valueBps?: number;
  amountMinor?: number;
  priority?: number;
  stackable?: boolean;
  exclusiveGroup?: string;
  minSubtotalMinor?: number;
  requiresCode?: boolean;
  startsAt?: string;
  endsAt?: string;
  conditions?: PromotionConditionDto[] | Record<string, string | number | boolean>;
  benefits?: PromotionBenefitDto[];
};

export type CreatePackageDto = {
  name: string;
  priceMinor: number;
  currency?: string;
  components: Record<string, string | number | boolean>[];
};

export type QuoteDto = {
  subtotalMinor: number;
  taxMinor?: number;
  tipMinor?: number;
  tipBps?: number;
  promotionIds?: string[];
  promotionCodes?: string[];
  packageIds?: string[];
  context?: {
    at?: string;
    resourceId?: string;
    resourceCategoryId?: string;
    itemIds?: string[];
    itemCategoryIds?: string[];
    customerId?: string;
    isMember?: boolean;
    sessionMinutes?: number;
    partySize?: number;
    bookingChannel?: string;
  };
};

export type SnapshotDto = QuoteDto & {
  sourceType: string;
  sourceId: string;
  currency?: string;
};
export type RecordTipDto = {
  guestCheckId?: string;
  paymentId?: string;
  type: 'TIP' | 'REFUND' | 'REVERSAL';
  amountMinor: number;
  currency?: string;
  correlationId: string;
  reason?: string;
};

export type CreateCustomerDto = {
  name?: string;
  email?: string;
  phone?: string;
  marketingConsent?: boolean;
  consentSource?: string;
  notes?: string;
};
export type CreateTierDto = {
  name: string;
  code: string;
  rank?: number;
  earnRateBasisPoints?: number;
  benefits?: Record<string, string | number | boolean>;
};
export type EnrollCustomerDto = { tierId: string; expiresAt?: string };
export type LoyaltyEntryDto = {
  type: 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST' | 'REVERSAL';
  points: number;
  sourceType?: string;
  sourceId?: string;
  correlationId: string;
  note?: string;
};
export type CreateStoredValueAccountDto = {
  customerId?: string;
  code?: string;
  currency?: string;
};
export type StoredValueEntryDto = {
  type: 'LOAD' | 'REDEEM' | 'REFUND' | 'ADJUST' | 'REVERSAL';
  amountMinor: number;
  sourceType?: string;
  sourceId?: string;
  paymentId?: string;
  correlationId: string;
  note?: string;
};
export type MergeCustomerDto = {
  mergedCustomerId: string;
  reason?: string;
};
export type RecordVisitDto = {
  sourceType: 'RESERVATION' | 'GUEST_CHECK' | 'OPERATIONS_SESSION' | 'EVENT';
  sourceId: string;
};
export type ReverseRewardsDto = {
  sourceType: string;
  sourceId: string;
  correlationId: string;
  note?: string;
};

export type CreateEventProposalDto = {
  subtotalMinor: number;
  depositMinor?: number;
  currency?: string;
  terms: Record<string, string | number | boolean>;
  validUntil?: string;
};
export type CreateEventHoldDto = {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  expiresAt?: string;
};
export type CreateEventScheduleDto = {
  proposalId?: string;
  label: string;
  dueAt: string;
  amountMinor: number;
  currency?: string;
};
export type MarkEventSchedulePaidDto = { paymentId: string };
export type StartEventDto = { guestCheckId?: string };
export type CreateEventChecklistDto = {
  label: string;
  ownerUserId?: string;
  dueAt?: string;
  sortOrder?: number;
};
export type EventTransitionDto = {
  toState:
    | 'INQUIRY'
    | 'QUOTED'
    | 'HOLD'
    | 'DEPOSIT_PENDING'
    | 'CONFIRMED'
    | 'IN_PROGRESS'
    | 'FINAL_PAYMENT'
    | 'COMPLETED'
    | 'CANCELED';
  reason?: string;
};
