import { checkoutBillReadiness } from './checkout-integrity.util';

describe('checkoutBillReadiness', () => {
  it('blocks mutable orders and running standalone play', () => {
    const result = checkoutBillReadiness({
      shopOrders: [{ id: 'order-1', status: 'PENDING', label: 'Table 4' }],
      playSessions: [
        {
          id: 'play-1',
          status: 'ACTIVE',
          reservationId: null,
          endedAt: null,
          label: 'Pool 2',
        },
      ],
    });

    expect(result.ready).toBe(false);
    expect(result.blockers.map((row) => row.reason)).toEqual([
      'ORDER_OPEN',
      'PLAY_SESSION_OPEN',
    ]);
  });

  it('allows an ended standalone play timer before its paid completion stamp', () => {
    const result = checkoutBillReadiness({
      shopOrders: [{ id: 'order-1', status: 'COMPLETED' }],
      playSessions: [
        {
          id: 'play-1',
          status: 'ACTIVE',
          reservationId: null,
          endedAt: new Date('2026-08-12T10:00:00Z'),
        },
      ],
    });

    expect(result).toEqual({ ready: true, blockers: [] });
  });

  it('does not treat reservation-linked play as a duplicate mutable charge source', () => {
    expect(
      checkoutBillReadiness({
        shopOrders: [],
        playSessions: [
          {
            id: 'play-linked',
            status: 'ACTIVE',
            reservationId: 'reservation-1',
            endedAt: null,
          },
        ],
      }),
    ).toEqual({ ready: true, blockers: [] });
  });
});
