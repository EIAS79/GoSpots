export type MetricFamily =
  | 'financial'
  | 'resource'
  | 'restaurant'
  | 'inventory'
  | 'reservation'
  | 'customer'
  | 'workforce';

export type Phase14MetricDefinition = {
  key: string;
  family: MetricFamily;
  name: string;
  definition: string;
  formula: string;
  sourceFacts: string[];
  filters: string;
  timeRule: string;
  refundTreatment: string;
  taxTreatment: string;
  comparisonBehavior: string;
};

const DEFAULT_FILTER = 'Authenticated shop only; selected venue business-day window.';
const TIME_RULE =
  'Venue IANA timezone + businessDayStartMinutes. Inclusive business-date keys are converted to a half-open UTC interval.';
const REFUNDS =
  'Refunds remain immutable facts; they reduce net metrics only where the formula explicitly says so.';
const TAX =
  'Tax is reported separately from immutable settlement/pricing snapshots unless a formula explicitly includes it.';
const COMPARISON =
  'Compare equivalent venue business-day windows, never raw UTC calendar days when venue settings differ.';

function m(
  family: MetricFamily,
  key: string,
  name: string,
  definition: string,
  formula: string,
  sourceFacts: string[],
): Phase14MetricDefinition {
  return {
    family,
    key,
    name,
    definition,
    formula,
    sourceFacts,
    filters: DEFAULT_FILTER,
    timeRule: TIME_RULE,
    refundTreatment: REFUNDS,
    taxTreatment: TAX,
    comparisonBehavior: COMPARISON,
  };
}

export const PHASE14_METRIC_DICTIONARY: Phase14MetricDefinition[] = [
  m('financial', 'gross_sales', 'Gross sales', 'Pre-adjustment value of paid settlements.', 'SUM(CheckSettlement.subtotal)', ['CheckSettlement']),
  m('financial', 'net_sales', 'Net sales', 'Canonical sale ledger less canonical refund ledger.', 'SUM(SALE ledger) - ABS(SUM(REFUND ledger))', ['LedgerEntry']),
  m('financial', 'tax', 'Tax', 'Tax recorded on paid settlement snapshots.', 'SUM(CheckSettlement.taxAmount)', ['CheckSettlement']),
  m('financial', 'discounts', 'Discounts', 'Effective non-void commercial discount value.', 'SUM(beforeTotalMinor-afterTotalMinor) for discount adjustments', ['CommercialAdjustment']),
  m('financial', 'comps', 'Comps', 'Effective manager comp value.', 'SUM(beforeTotalMinor-afterTotalMinor) where type=MANAGER_COMP', ['CommercialAdjustment']),
  m('financial', 'refunds', 'Refunds', 'Successful immutable refund facts.', 'ABS(SUM(REFUND ledger))', ['LedgerEntry', 'Refund']),
  m('financial', 'tips', 'Tips', 'Net recorded gratuity movement.', 'SUM(TipLedgerEntry.amountMinor)', ['TipLedgerEntry']),
  m('financial', 'service_charges', 'Service charges', 'Final immutable settlement charge lines classified as service charges.', 'SUM(ChargeSnapshot.finalAmount)', ['ChargeSnapshot']),
  m('financial', 'payment_method', 'Payment method mix', 'Successful checkout value by tender.', 'GROUP SUM(Payment.amount) BY method', ['Payment']),
  m('financial', 'cash_variance', 'Cash expected/count/variance', 'Physical close evidence for closed cash shifts.', 'SUM(expected), SUM(counted), SUM(variance)', ['CashSession', 'CashMovement']),
  m('financial', 'average_check', 'Average check', 'Average paid settlement total.', 'SUM(paid total)/COUNT(paid settlements)', ['CheckSettlement']),
  m('financial', 'revenue_per_hour', 'Revenue per hour', 'Canonical net sales per elapsed report hour.', 'netSalesMinor/elapsedHours', ['LedgerEntry']),
  m('financial', 'revenue_per_branch', 'Revenue per branch', 'Canonical net sales for each separately scoped branch.', 'GROUP net sales BY shop/branch', ['LedgerEntry', 'OrganizationShop']),

  m('resource', 'utilization', 'Utilization %', 'Occupied minutes divided by available minutes.', 'occupiedMinutes/availableMinutes*100', ['OperationsSession', 'OperationsSessionPause', 'ResourceMaintenancePeriod', 'OpeningHour']),
  m('resource', 'occupied_minutes', 'Occupied minutes', 'Session time minus pause segments.', 'SUM(clipped active time-paused time)/60', ['OperationsSession', 'OperationsSessionPause']),
  m('resource', 'available_minutes', 'Available minutes', 'Opening time less maintenance downtime.', 'openingMinutes-maintenanceMinutes', ['OpeningHour', 'ScheduleException', 'ResourceMaintenancePeriod']),
  m('resource', 'maintenance_downtime', 'Maintenance downtime', 'Recorded maintenance inside opening windows.', 'openingMinutes-availableMinutes', ['ResourceMaintenancePeriod']),
  m('resource', 'average_session_duration', 'Average session duration', 'Occupied minutes per session.', 'occupiedMinutes/sessionCount', ['OperationsSession']),
  m('resource', 'revenue_per_session', 'Revenue per session', 'Accrued timed-resource revenue per session.', 'accruedResourceRevenueMinor/sessionCount', ['OperationsSession']),
  m('resource', 'revenue_per_occupied_hour', 'Revenue per occupied resource hour', 'Timed-resource revenue normalized by occupied hours.', 'revenue/(occupiedMinutes/60)', ['OperationsSession']),
  m('resource', 'revenue_per_available_hour', 'Revenue per available resource hour', 'Timed-resource revenue normalized by available hours.', 'revenue/(availableMinutes/60)', ['OperationsSession', 'OpeningHour']),
  m('resource', 'peak_hours', 'Peak hours', 'Session starts grouped by venue-local clock hour.', 'COUNT(session starts) BY local hour', ['OperationsSession']),
  m('resource', 'resource_profitability', 'Table/station profitability', 'Revenue, utilization and revenue per available hour by resource.', 'Per-resource revenue + utilization + RevPAH', ['OperationsSession', 'Resource']),
  m('resource', 'fb_attach_rate', 'F&B attach rate', 'Timed sessions linked to at least one completed venue order.', 'attached sessions/sessionCount*100', ['OperationsSession', 'VenueOrder']),

  m('restaurant', 'covers', 'Covers', 'Guest party count on completed restaurant checks.', 'SUM(unique linked GuestCheck.partySize)', ['VenueOrder', 'GuestCheck']),
  m('restaurant', 'table_turns', 'Table turns', 'Settled restaurant-table checks per distinct serviced table.', 'settled table checks/distinct serviced resources', ['GuestCheckCommercialProfile', 'GuestCheck']),
  m('restaurant', 'average_spend', 'Average spend', 'Completed restaurant order value per cover.', 'SUM(VenueOrder.totalMinor)/covers', ['VenueOrder']),
  m('restaurant', 'item_mix', 'Item mix', 'Completed non-cancelled quantity/value by immutable item name.', 'GROUP quantity,value BY nameSnapshot', ['VenueOrderLine']),
  m('restaurant', 'category_mix', 'Category mix', 'Completed quantity/value by catalog section.', 'GROUP line quantity,value BY MenuSection', ['VenueOrderLine', 'MenuItem', 'MenuSection']),
  m('restaurant', 'kds_prep_time', 'KDS prep time', 'Elapsed time from prep start/open to ready.', 'AVG(readyAt-startedAt/openedAt)', ['PrepTicket']),
  m('restaurant', 'late_tickets', 'Late tickets', 'Completed prep tickets beyond station target.', 'completedTicketCount-slaMetCount', ['PrepTicket', 'PrepStation']),
  m('restaurant', 'void_comp_rate', 'Void/comp rate', 'Cancelled orders and manager comps relative to completed activity.', 'voids/(completed+voids); comp checks/completed checks', ['VenueOrder', 'CommercialAdjustment']),
  m('restaurant', 'server_sales', 'Server sales', 'Completed order value by creator.', 'GROUP SUM(totalMinor) BY createdById', ['VenueOrder']),
  m('restaurant', 'service_mode_mix', 'Dine-in/take-away mix', 'Completed order count/value by service mode.', 'GROUP COUNT,SUM(totalMinor) BY serviceMode', ['VenueOrder']),

  m('inventory', 'theoretical_consumption', 'Theoretical consumption', 'Recipe-driven sale-consumption movements.', 'SUM ABS(SALE_CONSUMPTION quantity/cost)', ['StockMovement']),
  m('inventory', 'actual_consumption', 'Actual consumption', 'Recorded outbound sale/waste/spoilage movements.', 'SUM ABS(outbound quantity/cost)', ['StockMovement']),
  m('inventory', 'inventory_variance', 'Inventory variance', 'Stocktake/manual adjustment movement value.', 'SUM adjustment movements', ['StockMovement', 'Stocktake']),
  m('inventory', 'waste', 'Waste', 'Recorded waste/spoilage inventory cost.', 'SUM ABS(waste/spoilage totalCostMinor)', ['StockMovement']),
  m('inventory', 'cogs', 'COGS', 'Net sale-consumption cost.', 'SALE_CONSUMPTION cost-SALE_REVERSAL cost', ['StockMovement']),
  m('inventory', 'gross_margin', 'Gross margin', 'Canonical net sales less COGS.', 'netSalesMinor-cogsMinor', ['LedgerEntry', 'StockMovement']),
  m('inventory', 'days_on_hand', 'Days on hand', 'Current inventory value divided by average daily COGS.', 'currentInventoryValue/(COGS/businessDayCount)', ['StockMovement', 'StockItem']),
  m('inventory', 'low_stock_risk', 'Low-stock risk', 'Active items at/below reorder level.', 'currentQuantity<=reorderLevelMilli', ['StockMovement', 'StockItem']),
  m('inventory', 'purchase_price_trend', 'Purchase-price trend', 'First versus latest purchase receipt unit cost.', 'latestCost-firstCost BY stockItem', ['StockMovement']),

  m('reservation', 'booking_volume', 'Booking volume', 'Reservations starting in the window.', 'COUNT(Reservation)', ['Reservation']),
  m('reservation', 'conversion_to_session', 'Conversion to session', 'Reservations with a converted session.', 'converted/reservations*100', ['ReservationExtension']),
  m('reservation', 'no_show', 'No-show rate', 'Finalized reservations marked NO_SHOW.', 'NO_SHOW/finalized*100', ['Reservation']),
  m('reservation', 'cancellation', 'Cancellation rate', 'Observed reservation cohort marked cancelled.', 'CANCELLED/reservations*100', ['Reservation']),
  m('reservation', 'deposit_conversion', 'Deposit conversion', 'Deposit-bearing reservations applied to a GuestCheck.', 'applied/deposit-bearing reservations*100', ['ReservationDepositLedgerEntry', 'ReservationDepositApplication']),
  m('reservation', 'booking_vs_walkin', 'Booking vs walk-in occupancy', 'Timed sessions linked to a reservation versus walk-ins.', 'reservation-linked sessions vs unlinked sessions', ['OperationsSession']),
  m('reservation', 'wait_time', 'Wait time', 'Waitlist time from create to offer.', 'AVG(offeredAt-createdAt)', ['ReservationWaitlistEntry']),

  m('customer', 'new_returning', 'New vs returning', 'Identified visitors split by prior-visit evidence.', 'eligible-repeat vs repeat', ['CustomerVisit']),
  m('customer', 'visit_frequency', 'Visit frequency', 'Completed identified visits per identified customer.', 'visits/customers', ['CustomerVisit']),
  m('customer', 'retention', 'Observed retention', 'Customers in the window with an earlier visit.', 'repeat/eligible*100', ['CustomerVisit']),
  m('customer', 'member_revenue', 'Member revenue', 'Settled visits by active member customers.', 'SUM(CustomerVisit.settledAmountMinor)', ['CustomerVisit', 'CustomerMembership']),
  m('customer', 'loyalty_redemption', 'Loyalty redemption', 'Absolute negative/redeem points movement in the window.', 'SUM ABS(negative loyalty points)', ['LoyaltyLedgerEntry']),
  m('customer', 'stored_value_liability', 'Stored-value liability', 'Net stored-value ledger balance by currency.', 'SUM(StoredValueLedgerEntry.amountMinor)', ['StoredValueLedgerEntry']),
  m('customer', 'ltv_estimate', 'Observed LTV estimate', 'Historical settled visit value up to report end divided by distinct identified customers; descriptive, not predictive.', 'historical settled value/distinct historical customers', ['CustomerVisit']),

  m('workforce', 'labor_hours', 'Labor hours', 'Worked time less unpaid breaks.', 'workedSeconds/3600', ['TimePunch', 'BreakRecord']),
  m('workforce', 'labor_to_sales', 'Labor-to-sales', 'Recorded labor cost divided by canonical net sales.', 'laborCostMinor/netSalesMinor*100', ['TimePunch', 'LedgerEntry']),
  m('workforce', 'sales_by_operator', 'Sales by operator', 'Completed order value by authenticated creator.', 'GROUP SUM(totalMinor) BY createdById', ['VenueOrder']),
  m('workforce', 'risk_actions_by_operator', 'Discounts/refunds/voids by operator', 'High-risk staff evidence by operator/action.', 'GROUP COUNT,SUM(amountMinor) BY actorMembershipId/actionKind', ['StaffActionEvidence']),
  m('workforce', 'cash_variance_by_operator', 'Cash variance by closer', 'Closed cash variance by closing user.', 'GROUP SUM(variance) BY closedById', ['CashSession']),
  m('workforce', 'shift_productivity', 'Shift productivity', 'Attributed completed-order sales per worked hour.', 'operatorSalesMinor/workedHours', ['VenueOrder', 'TimePunch', 'Membership']),
];

export function phase14MetricDictionary() {
  return {
    version: 'phase14-metrics-v1-2026-08-19',
    generatedFromCanonicalFacts: true,
    metrics: PHASE14_METRIC_DICTIONARY,
  };
}
