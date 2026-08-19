import { PHASE14_METRIC_DICTIONARY, phase14MetricDictionary } from './phase14-metric-dictionary';

const required = {
  financial: ['gross_sales', 'net_sales', 'tax', 'discounts', 'comps', 'refunds', 'tips', 'service_charges', 'payment_method', 'cash_variance', 'average_check', 'revenue_per_hour', 'revenue_per_branch'],
  resource: ['utilization', 'occupied_minutes', 'available_minutes', 'maintenance_downtime', 'average_session_duration', 'revenue_per_session', 'revenue_per_occupied_hour', 'revenue_per_available_hour', 'peak_hours', 'resource_profitability', 'fb_attach_rate'],
  restaurant: ['covers', 'table_turns', 'average_spend', 'item_mix', 'category_mix', 'kds_prep_time', 'late_tickets', 'void_comp_rate', 'server_sales', 'service_mode_mix'],
  inventory: ['theoretical_consumption', 'actual_consumption', 'inventory_variance', 'waste', 'cogs', 'gross_margin', 'days_on_hand', 'low_stock_risk', 'purchase_price_trend'],
  reservation: ['booking_volume', 'conversion_to_session', 'no_show', 'cancellation', 'deposit_conversion', 'booking_vs_walkin', 'wait_time'],
  customer: ['new_returning', 'visit_frequency', 'retention', 'member_revenue', 'loyalty_redemption', 'stored_value_liability', 'ltv_estimate'],
  workforce: ['labor_hours', 'labor_to_sales', 'sales_by_operator', 'risk_actions_by_operator', 'cash_variance_by_operator', 'shift_productivity'],
} as const;

describe('Phase 14 metric dictionary', () => {
  it('freezes every KPI family required by the Phase 14 source', () => {
    for (const [family, keys] of Object.entries(required)) {
      const actual = PHASE14_METRIC_DICTIONARY.filter((row) => row.family === family).map((row) => row.key);
      expect(actual).toEqual(expect.arrayContaining([...keys]));
    }
  });

  it('documents formula, sources, filtering, time, refund, tax and comparison semantics for every metric', () => {
    for (const row of PHASE14_METRIC_DICTIONARY) {
      expect(row.name).toBeTruthy();
      expect(row.definition).toBeTruthy();
      expect(row.formula).toBeTruthy();
      expect(row.sourceFacts.length).toBeGreaterThan(0);
      expect(row.filters).toContain('Authenticated shop');
      expect(row.timeRule).toContain('businessDayStartMinutes');
      expect(row.refundTreatment).toContain('Refund');
      expect(row.taxTreatment).toContain('Tax');
      expect(row.comparisonBehavior).toContain('business-day');
    }
  });

  it('publishes a versioned canonical dictionary contract', () => {
    expect(phase14MetricDictionary()).toEqual(expect.objectContaining({
      version: 'phase14-metrics-v1-2026-08-19',
      generatedFromCanonicalFacts: true,
    }));
  });
});
