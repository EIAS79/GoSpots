import { computeGuestCheckRunningTotal } from './guest-check-total.util';

describe('computeGuestCheckRunningTotal', () => {
  it('preserves current mixed-check anti-double-count behavior', () => {
    const result = computeGuestCheckRunningTotal({
      orders: [
        {
          id: 'order-1',
          status: 'COMPLETED',
          total: '38.00',
          reservationFee: '5.00',
          label: 'Food order',
        },
        {
          id: 'order-canceled',
          status: 'CANCELED',
          total: '99.00',
        },
      ],
      reservations: [
        {
          id: 'reservation-1',
          guestName: 'Guest',
          billedAmount: '80.00',
          resourceId: 'table-1',
        },
      ],
      playSessions: [
        {
          id: 'play-linked',
          status: 'FINISHED',
          amount: '80.00',
          reservationId: 'reservation-1',
        },
        {
          id: 'play-walk-in',
          status: 'FINISHED',
          amount: '40.00',
        },
      ],
    });

    expect(result.menuTotal).toBe('38.0000');
    expect(result.reservationTotal).toBe('80.0000');
    expect(result.playTotal).toBe('40.0000');
    expect(result.runningTotal).toBe('158.0000');

    const linkedPlay = result.lines.find(
      (line) => line.sourceId === 'play-linked',
    );
    expect(linkedPlay).toMatchObject({
      kind: 'EXCLUDED_PLAY',
      amount: '0.0000',
      excluded: true,
      reason: 'linked_play_excluded_bill_on_reservation',
    });
    expect(
      result.lines.some((line) => line.sourceId === 'order-canceled'),
    ).toBe(false);
  });

  it('keeps unbilled reservations visible without increasing the total', () => {
    const result = computeGuestCheckRunningTotal({
      orders: [],
      playSessions: [],
      reservations: [
        {
          id: 'reservation-unbilled',
          guestName: 'Unbilled guest',
          billedAmount: null,
        },
      ],
    });

    expect(result.runningTotal).toBe('0.0000');
    expect(result.reservationTotal).toBe('0.0000');
    expect(result.lines).toEqual([
      expect.objectContaining({
        sourceId: 'reservation-unbilled',
        amount: '0.0000',
        excluded: false,
        reason: 'unbilled',
      }),
    ]);
  });
});
