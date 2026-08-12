import { guestCheckCloseReadiness } from './guest-check-close.util';

function baseCheck() {
  return {
    shopOrders: [] as Array<{ id: string; status: string; label?: string | null }>,
    playSessions: [] as Array<{
      id: string;
      status: string;
      reservationId?: string | null;
      label?: string | null;
    }>,
    reservations: [] as Array<{
      id: string;
      status: string;
      guestName?: string | null;
      resourceId?: string | null;
      billedAmount?: unknown | null;
    }>,
  };
}

describe('guest check close readiness', () => {
  it('allows a check when linked operations are finalized', () => {
    const check = baseCheck();
    check.shopOrders.push({ id: 'order-1', status: 'COMPLETED' });
    check.playSessions.push({
      id: 'play-1',
      status: 'COMPLETED',
      reservationId: null,
    });
    check.reservations.push({
      id: 'res-1',
      status: 'CONFIRMED',
      resourceId: 'table-1',
      billedAmount: '20.0000',
    });

    expect(guestCheckCloseReadiness(check)).toEqual({
      ready: true,
      blockers: [],
    });
  });

  it('returns structured blockers for open order, play, and unpaid resource booking', () => {
    const check = baseCheck();
    check.shopOrders.push({ id: 'order-12345678', status: 'PENDING', label: 'Table 4' });
    check.playSessions.push({ id: 'play-12345678', status: 'ACTIVE', reservationId: null });
    check.reservations.push({
      id: 'res-12345678',
      status: 'CHECKED_IN',
      guestName: 'Alex',
      resourceId: 'pool-1',
      billedAmount: null,
    });

    const result = guestCheckCloseReadiness(check);

    expect(result.ready).toBe(false);
    expect(result.blockers.map((row) => row.reason)).toEqual([
      'ORDER_OPEN',
      'PLAY_SESSION_OPEN',
      'RESERVATION_UNBILLED',
    ]);
    expect(result.blockers[0]).toEqual(
      expect.objectContaining({ label: 'Table 4', sourceType: 'SHOP_ORDER' }),
    );
    expect(result.blockers[2]).toEqual(
      expect.objectContaining({ label: 'Alex', sourceType: 'RESERVATION' }),
    );
  });

  it('does not double-block reservation-linked play or zero-charge non-resource bookings', () => {
    const check = baseCheck();
    check.playSessions.push({
      id: 'play-linked',
      status: 'ACTIVE',
      reservationId: 'res-linked',
    });
    check.reservations.push({
      id: 'res-linked',
      status: 'CONFIRMED',
      resourceId: null,
      billedAmount: null,
    });

    expect(guestCheckCloseReadiness(check)).toEqual({
      ready: true,
      blockers: [],
    });
  });

  it('ignores canceled and no-show reservations', () => {
    const check = baseCheck();
    check.reservations.push(
      {
        id: 'res-cancelled',
        status: 'CANCELED',
        resourceId: 'pool-1',
        billedAmount: null,
      },
      {
        id: 'res-no-show',
        status: 'NO_SHOW',
        resourceId: 'pool-2',
        billedAmount: null,
      },
    );

    expect(guestCheckCloseReadiness(check).ready).toBe(true);
  });
});
