import { VENUE_ADD_ONS } from './venue-packs';

describe('venue packs publish readiness', () => {
  it('grants reports with gaming_suite and menu_orders', () => {
    expect(VENUE_ADD_ONS.gaming_suite.modules).toContain('reports');
    expect(VENUE_ADD_ONS.gaming_suite.modules).toContain('transaction');
    expect(VENUE_ADD_ONS.menu_orders.modules).toContain('reports');
    expect(VENUE_ADD_ONS.menu_orders.modules).toContain('transaction');
  });

  it('prices match launch catalog', () => {
    expect(VENUE_ADD_ONS.ops_alerts.monthlyPrice).toBe(8);
    expect(VENUE_ADD_ONS.gaming_suite.monthlyPrice).toBe(20);
    expect(VENUE_ADD_ONS.menu_orders.monthlyPrice).toBe(15);
    expect(VENUE_ADD_ONS.dining_floor.monthlyPrice).toBe(15);
    expect(VENUE_ADD_ONS.venue_presence.monthlyPrice).toBe(10);
    expect(VENUE_ADD_ONS.guest_chat.monthlyPrice).toBe(15);
    expect(VENUE_ADD_ONS.team_accounts.monthlyPrice).toBe(4);
    expect(VENUE_ADD_ONS.team_accounts.pricedPerSeat).toBe(true);
  });
});
